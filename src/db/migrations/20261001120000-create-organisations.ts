import { QueryInterface, DataTypes, Transaction } from "sequelize";
import {
  columnCollation,
  tableNameList,
  tableOptionsMatchingColumn,
} from "../migration-helpers";

/**
 * C1 of the multi-organisation model (docs/admin-organisations-schema.md §3):
 * the `organisations` table and its `organisationcountry` link table. Nothing
 * else changes - no `organisationid` column on schools, users or content yet.
 *
 * ## Collation
 *
 * Both tables take the charset/collation of `countries.countryid`, read from
 * the real table, NOT from the `countries` model. The model declares
 * `utf8mb4_0900_ai_ci`; the table in every database inspected is
 * `utf8mb4_unicode_ci`. A foreign key between columns of different collations
 * is refused by MySQL, so `organisationcountry.countryid` must match the
 * table, and `organisations` uses the same so its own id column matches the
 * link table's. (`tableOptionsMatchingColumn` falls back to
 * utf8mb4/utf8mb4_unicode_ci when the reference column cannot be found.)
 * Being a case-insensitive collation, it is also what makes the unique indexes
 * below case-insensitive.
 *
 * ## Uniqueness
 *
 * - `organisationcode` is unique across ALL rows, deleted ones included: a code
 *   is used at learner sign-in and in sync headers, so it must never be reissued.
 * - `organisationname` is unique among LIVE rows only. The design note writes
 *   plain "unique", but the same note and the API need a deleted organisation's
 *   name to be reusable (a soft delete keeps the row), which a plain unique
 *   index forbids. So the index is over `CASE WHEN isdeleted = 0 THEN
 *   organisationname END`: a deleted row contributes NULL, and MySQL allows any
 *   number of NULLs in a unique index. This is a functional key part, which
 *   needs MySQL 8.0.13 or later.
 *
 * ## Idempotence
 *
 * MySQL DDL commits implicitly, so the transaction wrapper cannot undo a
 * half-applied migration. Every step is therefore guarded: the tables on
 * `tableNameList`, every index on `showIndex`, so a re-run after a partial
 * failure completes the job instead of failing on "already exists".
 */
const ORGANISATIONS = "organisations";

/**
 * `organisationname` alone is NOT in the table's collation (see "Collation"
 * above); it is accent-sensitive and case-insensitive. Under utf8mb4_unicode_ci
 * and utf8mb4_0900_ai_ci, several Khmer marks have zero weight - bantoc (U+17CB),
 * nikahit (U+17C6), musikatoan (U+17C9) - so two different names such as
 * "សាលាកាត" and "សាលាកាត់" compare EQUAL and could not both exist (a false
 * 409 from the API, ER_DUP_ENTRY from MySQL). `_as_ci` makes marks significant
 * while "Acme" and "ACME" still collide. It governs the live-name unique index
 * (the index key keeps the column's collation), the API's duplicate check and
 * the name search, which all compare through the column. It is set here, before
 * the functional index is created, and is for this column only: the foreign-key
 * id columns keep the collation they must share with `countries.countryid`.
 */
const NAME_COLLATION = "utf8mb4_0900_as_ci";
const LINKS = "organisationcountry";

const NAME_INDEX = "organisations_organisationname_live_unique";
const NAME_SORT_INDEX = "organisations_organisationname_idx";
const CODE_INDEX = "organisations_organisationcode_unique";
const LINK_UNIQUE_INDEX = "organisationcountry_organisation_country_unique";
const LINK_COUNTRY_INDEX = "organisationcountry_countryid";

async function indexNames(
  queryInterface: QueryInterface,
  table: string,
): Promise<Set<string>> {
  const indexes = (await queryInterface.showIndex(table)) as Array<{ name?: string }>;
  return new Set(indexes.map((i) => String(i.name)));
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const names = await tableNameList(queryInterface);
      const opts = await tableOptionsMatchingColumn(
        queryInterface,
        "countries",
        "countryid",
      );

      if (!names.includes(ORGANISATIONS)) {
        await queryInterface.createTable(
          ORGANISATIONS,
          {
            organisationid: {
              type: DataTypes.STRING(36),
              allowNull: false,
              primaryKey: true,
            },
            organisationname: { type: DataTypes.STRING(250), allowNull: false },
            organisationcode: { type: DataTypes.STRING(16), allowNull: false },
            organisationshortname: { type: DataTypes.STRING(12), allowNull: false },
            organisationpreset: { type: DataTypes.STRING(16), allowNull: false },
            organisationstatus: {
              type: DataTypes.BOOLEAN,
              allowNull: false,
              defaultValue: true,
            },
            uitheme: {
              type: DataTypes.STRING(16),
              allowNull: false,
              defaultValue: "kids",
            },
            brandingconfig: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
            settingsconfig: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
            isdeleted: {
              type: DataTypes.BOOLEAN,
              allowNull: false,
              defaultValue: false,
            },
            created_at: {
              type: "TIMESTAMP",
              defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
              allowNull: true,
            },
            created_by: { type: DataTypes.STRING(36), allowNull: true },
            updated_at: {
              type: "TIMESTAMP",
              defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
              allowNull: true,
            },
            updated_by: { type: DataTypes.STRING(36), allowNull: true },
            deleted_at: { type: "TIMESTAMP", allowNull: true },
            deleted_by: { type: DataTypes.STRING(36), allowNull: true },
          },
          { transaction, charset: opts.charset, collate: opts.collate },
        );
      }

      // Sequelize's column definitions cannot carry a per-column collation, so it
      // is set here, before any index on the column exists. Guarded, so a re-run
      // does not rebuild the column.
      if ((await columnCollation(queryInterface, ORGANISATIONS, "organisationname")) !== NAME_COLLATION) {
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${ORGANISATIONS}\` MODIFY \`organisationname\` VARCHAR(250) ` +
            `CHARACTER SET utf8mb4 COLLATE ${NAME_COLLATION} NOT NULL`,
          { transaction },
        );
      }

      const orgIndexes = await indexNames(queryInterface, ORGANISATIONS);
      if (!orgIndexes.has(CODE_INDEX)) {
        await queryInterface.addIndex(ORGANISATIONS, ["organisationcode"], {
          name: CODE_INDEX,
          unique: true,
          transaction,
        });
      }
      // Plain (non-unique) index so the list can ORDER BY the name, and filter
      // `isdeleted`, without sorting rows that carry JSON columns.
      if (!orgIndexes.has(NAME_SORT_INDEX)) {
        await queryInterface.addIndex(ORGANISATIONS, ["organisationname"], {
          name: NAME_SORT_INDEX,
          transaction,
        });
      }
      if (!orgIndexes.has(NAME_INDEX)) {
        // Raw SQL: addIndex cannot express a functional key part. No input is
        // interpolated - every identifier here is a constant above.
        await queryInterface.sequelize.query(
          `CREATE UNIQUE INDEX \`${NAME_INDEX}\` ON \`${ORGANISATIONS}\` ` +
            "((CASE WHEN `isdeleted` = 0 THEN `organisationname` END))",
          { transaction },
        );
      }

      if (!names.includes(LINKS)) {
        await queryInterface.createTable(
          LINKS,
          {
            organisationcountryid: {
              type: DataTypes.STRING(36),
              allowNull: false,
              primaryKey: true,
            },
            organisationid: {
              type: DataTypes.STRING(36),
              allowNull: false,
              references: { model: ORGANISATIONS, key: "organisationid" },
              // Links are owned by their organisation; organisations are only
              // ever soft-deleted by the API, so this fires only on a manual
              // hard delete, where dropping the links is what is wanted.
              onDelete: "CASCADE",
              onUpdate: "CASCADE",
            },
            countryid: {
              type: DataTypes.STRING(36),
              allowNull: false,
              references: { model: "countries", key: "countryid" },
              // A country that organisations point at cannot be hard-deleted.
              onDelete: "RESTRICT",
              onUpdate: "CASCADE",
            },
          },
          { transaction, charset: opts.charset, collate: opts.collate },
        );
      }

      const linkIndexes = await indexNames(queryInterface, LINKS);
      if (!linkIndexes.has(LINK_UNIQUE_INDEX)) {
        await queryInterface.addIndex(LINKS, ["organisationid", "countryid"], {
          name: LINK_UNIQUE_INDEX,
          unique: true,
          transaction,
        });
      }
      // InnoDB needs an index leading with each foreign key column. The unique
      // index above serves `organisationid`; `countryid` gets its own.
      if (!linkIndexes.has(LINK_COUNTRY_INDEX)) {
        await queryInterface.addIndex(LINKS, ["countryid"], {
          name: LINK_COUNTRY_INDEX,
          transaction,
        });
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      // Link table first: it holds the foreign keys. Drops our own tables
      // only, and only if present, so a partial `up()` can be undone.
      const names = await tableNameList(queryInterface);
      if (names.includes(LINKS)) {
        await queryInterface.dropTable(LINKS, { transaction });
      }
      if (names.includes(ORGANISATIONS)) {
        await queryInterface.dropTable(ORGANISATIONS, { transaction });
      }
    }),
};
