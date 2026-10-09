import { DataTypes, QueryInterface, QueryTypes, Transaction } from "sequelize";
import { tableNameList, tableOptionsMatchingColumn } from "../migration-helpers";

/**
 * LI-1 (docs/content-learning-items-design.md, sections 5 and 11, step C-LI2): the link table
 * `lessonlearningdocuments`, for an item that references more than one document. It ships EMPTY
 * and stays empty until a later phase has an item type that uses it.
 *
 *  - `lessonlearningdocumentid` STRING(36) primary key.
 *  - `lessonlearningid` -> `lessonlearnings`, ON DELETE CASCADE (central deletes an item with `destroy()`).
 *  - `documentid` -> `documents`, ON DELETE RESTRICT; indexed (the "used in" lookup).
 *  - `lessonlearningdocumentrole` STRING(16): `rendition` or `asset`.
 *  - `lessonlearningdocumentorder` INTEGER NOT NULL DEFAULT 0, the order within the item.
 *  - Unique on (`lessonlearningid`, `documentid`). No audit columns.
 *
 * ## Collation
 *
 * Each foreign-key column takes the charset and collation of the column it references, read from the
 * real tables (`tableOptionsMatchingColumn`): `lessonlearningid` from `lessonlearnings.lessonlearningid`
 * (also the table's own default, which the table names), `documentid` from `documents.documentid`,
 * spelled on the column when it differs from the table's. A foreign key between columns of different
 * collations is refused by MySQL; see migrations-name-their-collation.spec.ts.
 *
 * ## Idempotence, down()
 *
 * The table is created only if missing and each index only if missing. `down()` THROWS if the
 * table has rows (it would lose data) and otherwise drops it.
 */
const TABLE = "lessonlearningdocuments";
const UNIQUE_INDEX = "lessonlearningdocuments_item_document_unique";
const DOCUMENT_INDEX = "lessonlearningdocuments_documentid";

/** Charset and collation names come from information_schema; this makes them safe to spell into a column type. */
const NAME = /^[A-Za-z0-9_]+$/;
const varchar36 = (o: { charset: string; collate: string }): string => {
  if (!NAME.test(o.charset) || !NAME.test(o.collate)) {
    throw new Error(`Unexpected charset or collation: ${o.charset} / ${o.collate}`);
  }
  return `VARCHAR(36) CHARACTER SET ${o.charset} COLLATE ${o.collate}`;
};

async function indexNames(queryInterface: QueryInterface): Promise<Set<string>> {
  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name?: string }>;
  return new Set(indexes.map((i) => String(i.name)));
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const names = await tableNameList(queryInterface);
      if (!names.includes(TABLE)) {
        const opts = await tableOptionsMatchingColumn(queryInterface, "lessonlearnings", "lessonlearningid");
        const documentOpts = await tableOptionsMatchingColumn(queryInterface, "documents", "documentid");
        await queryInterface.createTable(
          TABLE,
          {
            lessonlearningdocumentid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
            lessonlearningid: {
              type: DataTypes.STRING(36),
              allowNull: false,
              references: { model: "lessonlearnings", key: "lessonlearningid" },
              onDelete: "CASCADE",
              onUpdate: "CASCADE",
            },
            documentid: {
              type: varchar36(documentOpts),
              allowNull: false,
              references: { model: "documents", key: "documentid" },
              onDelete: "RESTRICT",
              onUpdate: "CASCADE",
            },
            lessonlearningdocumentrole: { type: DataTypes.STRING(16), allowNull: false },
            lessonlearningdocumentorder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
          },
          { transaction, charset: opts.charset, collate: opts.collate },
        );
      }
      const have = await indexNames(queryInterface);
      if (!have.has(UNIQUE_INDEX)) {
        await queryInterface.addIndex(TABLE, ["lessonlearningid", "documentid"], { name: UNIQUE_INDEX, unique: true, transaction });
      }
      if (!have.has(DOCUMENT_INDEX)) {
        await queryInterface.addIndex(TABLE, ["documentid"], { name: DOCUMENT_INDEX, transaction });
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const names = await tableNameList(queryInterface);
      if (!names.includes(TABLE)) {
        return;
      }
      const rows = (await queryInterface.sequelize.query(`SELECT COUNT(*) AS n FROM \`${TABLE}\``, {
        type: QueryTypes.SELECT,
        transaction,
      })) as Array<{ n?: number | string }>;
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) {
        throw new Error(
          `C-LI2 (create ${TABLE}) down() refused, so nothing was changed: the table holds ${n} row(s) that dropping it would lose. ` +
            "Remove them, then run down() again.",
        );
      }
      await queryInterface.dropTable(TABLE, { transaction });
    }),
};
