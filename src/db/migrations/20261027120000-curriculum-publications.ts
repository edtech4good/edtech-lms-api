import { DataTypes, QueryInterface, QueryTypes, Transaction } from "sequelize";
import { foreignKeyName, sqlName } from "../foreign-keys";
import { tableNameList, tableOptionsMatchingColumn } from "../migration-helpers";

/**
 * A4 step 1 (docs/content-publishing-design.md, option A): the table that holds what each publish of a curriculum
 * published, `curriculumpublications`. It ships EMPTY. Nothing reads it yet except the publish and retire routes and
 * the curriculum tree; the two sync routes still serve the live tables (step 2).
 *
 *  - `publicationid` STRING(36) primary key.
 *  - `curriculumid` -> `curriculums`, `organisationid` -> `organisations`, `publishedby` -> `lmsusers`: all three
 *    ON DELETE RESTRICT ON UPDATE CASCADE (most deletes here are soft, so a hard delete of a parent that still has
 *    publications must fail loudly), named `curriculumpublications_<column>_fk`.
 *  - `publishedat` DATETIME(3) NOT NULL: milliseconds, so the order of two publishes is never a tie.
 *  - `status` ENUM('published', 'withdrawn') NOT NULL DEFAULT 'published'.
 *  - `payload` JSON NULL: NULL means "pruned, summary kept" (decision 9; see the model).
 *  - `summary` JSON NOT NULL, `payloadhash` CHAR(64) NOT NULL (a sha256 in hex).
 *  - `createdAt` / `updatedAt` DATETIME NOT NULL.
 *  - Indexes: (`curriculumid`, `publishedat`) for "the latest publication of a curriculum", `organisationid`, and
 *    `publishedby` (each foreign key is led by an index of its own, so MySQL makes no implicit one).
 *
 * ## Collation
 *
 * Each foreign-key column takes the charset and collation of the column it references, read from the real tables
 * (`tableOptionsMatchingColumn`), and the table takes `curriculums.curriculumid`'s. A foreign key between columns of
 * different collations is refused by MySQL; see migrations-name-their-collation.spec.ts.
 *
 * ## Idempotence, down()
 *
 * The table is created only if missing, and each index and key only if missing (by name, or, for a key, by the link it
 * makes whatever it is called). `down()` THROWS if the table holds rows (a publication is history that dropping the table
 * would lose) and otherwise drops it.
 */
const TABLE = "curriculumpublications";
const LATEST_INDEX = "curriculumpublications_curriculum_publishedat";
const ORGANISATION_INDEX = "curriculumpublications_organisationid";
const PUBLISHER_INDEX = "curriculumpublications_publishedby";

const KEYS = [
  { column: "curriculumid", parentTable: "curriculums", parentColumn: "curriculumid" },
  { column: "organisationid", parentTable: "organisations", parentColumn: "organisationid" },
  { column: "publishedby", parentTable: "lmsusers", parentColumn: "lmsuserid" },
] as const;

/** Charset and collation names come from information_schema; this makes them safe to spell into a column type. */
const NAME = /^[A-Za-z0-9_]+$/;
const varchar36 = (o: { charset: string; collate: string }): string => {
  if (!NAME.test(o.charset) || !NAME.test(o.collate)) {
    throw new Error(`Unexpected charset or collation: ${o.charset} / ${o.collate}`);
  }
  return `VARCHAR(36) CHARACTER SET ${o.charset} COLLATE ${o.collate}`;
};

async function indexNames(queryInterface: QueryInterface, transaction: Transaction): Promise<Set<string>> {
  const indexes = (await queryInterface.showIndex(TABLE, { transaction })) as Array<{ name?: string }>;
  return new Set(indexes.map((i) => String(i.name)));
}

/** The foreign keys of the table: their names, and the links they make (column>parent.column). */
async function keyState(queryInterface: QueryInterface, transaction: Transaction): Promise<{ names: Set<string>; links: Set<string> }> {
  const rows = (await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS ptable, REFERENCED_COLUMN_NAME AS pcol
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    { replacements: [TABLE], type: QueryTypes.SELECT, transaction },
  )) as Array<Record<string, unknown>>;
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === "object" && !Array.isArray(r));
  return {
    names: new Set(list.map((r) => String(r.name ?? r.NAME))),
    links: new Set(list.map((r) => `${r.col ?? r.COL}>${r.ptable ?? r.PTABLE}.${r.pcol ?? r.PCOL}`)),
  };
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const names = await tableNameList(queryInterface);
      if (!names.includes(TABLE)) {
        const table = await tableOptionsMatchingColumn(queryInterface, "curriculums", "curriculumid");
        const organisation = await tableOptionsMatchingColumn(queryInterface, "organisations", "organisationid");
        const user = await tableOptionsMatchingColumn(queryInterface, "lmsusers", "lmsuserid");
        await queryInterface.createTable(
          TABLE,
          {
            publicationid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
            curriculumid: { type: varchar36(table), allowNull: false },
            organisationid: { type: varchar36(organisation), allowNull: false },
            publishedat: { type: DataTypes.DATE(3), allowNull: false },
            publishedby: { type: varchar36(user), allowNull: false },
            status: { type: DataTypes.ENUM("published", "withdrawn"), allowNull: false, defaultValue: "published" },
            payload: { type: DataTypes.JSON, allowNull: true },
            summary: { type: DataTypes.JSON, allowNull: false },
            payloadhash: { type: DataTypes.CHAR(64), allowNull: false },
            createdAt: { type: DataTypes.DATE, allowNull: false },
            updatedAt: { type: DataTypes.DATE, allowNull: false },
          },
          { transaction, charset: table.charset, collate: table.collate },
        );
      }

      const have = await indexNames(queryInterface, transaction);
      if (!have.has(LATEST_INDEX)) {
        await queryInterface.addIndex(TABLE, ["curriculumid", "publishedat"], { name: LATEST_INDEX, transaction });
      }
      if (!have.has(ORGANISATION_INDEX)) {
        await queryInterface.addIndex(TABLE, ["organisationid"], { name: ORGANISATION_INDEX, transaction });
      }
      if (!have.has(PUBLISHER_INDEX)) {
        await queryInterface.addIndex(TABLE, ["publishedby"], { name: PUBLISHER_INDEX, transaction });
      }

      const keys = await keyState(queryInterface, transaction);
      for (const k of KEYS) {
        const name = foreignKeyName({ table: TABLE, column: k.column });
        if (keys.names.has(name) || keys.links.has(`${k.column}>${k.parentTable}.${k.parentColumn}`)) {
          continue;
        }
        await queryInterface.addConstraint(TABLE, {
          fields: [k.column],
          type: "foreign key",
          name,
          references: { table: k.parentTable, field: k.parentColumn },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
          transaction,
        });
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const names = await tableNameList(queryInterface);
      if (!names.includes(TABLE)) {
        return;
      }
      const rows = (await queryInterface.sequelize.query(`SELECT COUNT(*) AS n FROM \`${sqlName(TABLE)}\``, {
        type: QueryTypes.SELECT,
        transaction,
      })) as Array<{ n?: number | string }>;
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) {
        throw new Error(
          `A4 step 1 (create ${TABLE}) down() refused, so nothing was changed: the table holds ${n} publication(s) that dropping it would lose. ` +
            "Remove them, then run down() again.",
        );
      }
      await queryInterface.dropTable(TABLE, { transaction });
    }),
};
