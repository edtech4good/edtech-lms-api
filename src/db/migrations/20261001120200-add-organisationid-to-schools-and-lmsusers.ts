import { QueryInterface, Transaction } from "sequelize";
import {
  removeColumnIfPresent,
  tableOptionsMatchingColumn,
} from "../migration-helpers";

/**
 * C3 of the multi-organisation model (docs/admin-organisations-schema.md §9):
 * a nullable `organisationid` on `schools` and on `lmsusers`, each with an
 * index and a foreign key to `organisations`, and a UNIQUE index on
 * `lmsusers.lmsusername`.
 *
 * Both new columns stay NULLABLE here. Nothing is backfilled: later work
 * assigns organisations and then tightens the columns. For `lmsusers`, NULL
 * means "not inside any organisation" (a platform account, once the sign-in
 * rules of the next package say so).
 *
 * ## Foreign keys and collation
 *
 * The new columns take the charset and collation of the REAL
 * `organisations.organisationid` column, read from the database, because MySQL
 * refuses a foreign key between columns of different collations and the
 * sibling tables in this database differ between deployments. A Sequelize
 * column definition cannot carry a per-column collation, so the column is
 * added with a raw `ALTER TABLE`. Every identifier in that statement is a
 * constant in this file; the charset and collation names come from
 * `information_schema` and are checked against a strict pattern before use.
 *
 * `ON DELETE RESTRICT`: an organisation that still has schools or staff cannot
 * be hard-deleted. (The API only ever soft-deletes organisations and refuses
 * that too while they are in use.) `ON UPDATE CASCADE` matches the other
 * organisation links.
 *
 * ## The unique username index, and its guard
 *
 * `lmsusername` is the sign-in email, and the model decided "one email, one
 * organisation". The unique index makes that a database fact. If duplicate
 * usernames already exist the index cannot be built and the right answer is
 * for a person to decide which account survives, so `up()` looks for
 * duplicates FIRST and, if there are any, throws (with the number of duplicate
 * groups, not the addresses) before running any DDL, so a refused run changes nothing. The duplicate check groups by the
 * column itself, so it uses the same collation (case-insensitive) as the index
 * it guards.
 *
 * ## Idempotence
 *
 * MySQL DDL commits implicitly, so the transaction wrapper cannot undo a
 * half-applied migration. Every step is therefore guarded (column on
 * `describeTable`, indexes on `showIndex`, constraints on `information_schema`),
 * so a re-run after a partial failure finishes the job.
 *
 * ## down()
 *
 * Reverses the steps in the opposite order (constraint, then index, then
 * column) and drops the unique index. It discards any `organisationid` values
 * written since `up()`.
 */
const ORGANISATIONS = "organisations";
const ORGANISATION_ID = "organisationid";

const TARGETS = [
  {
    table: "schools",
    index: "schools_organisationid_idx",
    constraint: "schools_organisationid_fk",
  },
  {
    table: "lmsusers",
    index: "lmsusers_organisationid_idx",
    constraint: "lmsusers_organisationid_fk",
  },
] as const;

const USERNAME_TABLE = "lmsusers";
const USERNAME_COLUMN = "lmsusername";
const USERNAME_INDEX = "lmsusers_lmsusername_unique";

/** What a charset or collation name from information_schema looks like. */
const SQL_NAME = /^[A-Za-z0-9_]+$/;

/** One index as Sequelize's MySQL `showIndex` returns it: one row per index, columns in `fields`. */
type IndexRow = { name?: string; unique?: boolean; fields?: Array<{ attribute?: string }> };

async function indexRows(queryInterface: QueryInterface, table: string): Promise<IndexRow[]> {
  return (await queryInterface.showIndex(table)) as IndexRow[];
}

/** Is there already a UNIQUE index on exactly the one column `lmsusername`, by any name? */
function hasUniqueIndexOnUsername(rows: IndexRow[]): boolean {
  return rows.some(
    (row) =>
      row.unique === true &&
      Array.isArray(row.fields) &&
      row.fields.length === 1 &&
      row.fields[0].attribute === USERNAME_COLUMN,
  );
}

async function constraintExists(
  queryInterface: QueryInterface,
  table: string,
  constraint: string,
  transaction: Transaction,
): Promise<boolean> {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME AS name
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     LIMIT 1`,
    { replacements: [table, constraint], transaction },
  );
  return (rows as unknown[]).length > 0;
}

/** How many usernames occur more than once (groups, not accounts; no address is read out). */
async function duplicateUsernameGroups(
  queryInterface: QueryInterface,
  transaction: Transaction,
): Promise<number> {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM \`${USERNAME_TABLE}\`
       GROUP BY \`${USERNAME_COLUMN}\`
       HAVING COUNT(*) > 1
     ) AS duplicate_groups`,
    { transaction },
  );
  return Number((rows as Array<{ n: number | string }>)[0]?.n ?? 0);
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      // Guard first, before any DDL: a refused run must change nothing.
      const duplicates = await duplicateUsernameGroups(queryInterface, transaction);
      if (duplicates > 0) {
        // Usernames are email addresses, so the message gives the number of
        // duplicate groups, not the addresses; the operator lists them with
        // the same GROUP BY.
        throw new Error(
          `Cannot add a unique index on ${USERNAME_TABLE}.${USERNAME_COLUMN}: ` +
            `${duplicates} username(s) occur more than once. ` +
            "The index counts every row, disabled accounts included, so each extra account must be " +
            "renamed or deleted. Find them with: SELECT lmsusername, COUNT(*) FROM lmsusers " +
            "GROUP BY lmsusername HAVING COUNT(*) > 1. Then run this migration again.",
        );
      }

      const opts = await tableOptionsMatchingColumn(
        queryInterface,
        ORGANISATIONS,
        ORGANISATION_ID,
      );
      if (!SQL_NAME.test(opts.charset) || !SQL_NAME.test(opts.collate)) {
        throw new Error(
          `Unexpected charset/collation reported for ${ORGANISATIONS}.${ORGANISATION_ID}.`,
        );
      }

      for (const target of TARGETS) {
        const description = await queryInterface.describeTable(target.table);
        if (!description[ORGANISATION_ID]) {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${target.table}\` ADD COLUMN \`${ORGANISATION_ID}\` VARCHAR(36) ` +
              `CHARACTER SET ${opts.charset} COLLATE ${opts.collate} NULL`,
            { transaction },
          );
        }

        const indexes = await indexRows(queryInterface, target.table);
        if (!indexes.some((i) => i.name === target.index)) {
          await queryInterface.addIndex(target.table, [ORGANISATION_ID], {
            name: target.index,
            transaction,
          });
        }

        if (!(await constraintExists(queryInterface, target.table, target.constraint, transaction))) {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${target.table}\` ADD CONSTRAINT \`${target.constraint}\` ` +
              `FOREIGN KEY (\`${ORGANISATION_ID}\`) REFERENCES \`${ORGANISATIONS}\` (\`${ORGANISATION_ID}\`) ` +
              "ON DELETE RESTRICT ON UPDATE CASCADE",
            { transaction },
          );
        }
      }

      const usernameIndexes = await indexRows(queryInterface, USERNAME_TABLE);
      if (
        !usernameIndexes.some((i) => i.name === USERNAME_INDEX) &&
        !hasUniqueIndexOnUsername(usernameIndexes)
      ) {
        await queryInterface.addIndex(USERNAME_TABLE, [USERNAME_COLUMN], {
          name: USERNAME_INDEX,
          unique: true,
          transaction,
        });
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const usernameIndexes = await indexRows(queryInterface, USERNAME_TABLE);
      if (usernameIndexes.some((i) => i.name === USERNAME_INDEX)) {
        await queryInterface.removeIndex(USERNAME_TABLE, USERNAME_INDEX, { transaction });
      }

      // lmsusers first, schools second: the reverse of up(). Per table the
      // constraint goes before the index it uses, and the index before the
      // column.
      for (const target of [...TARGETS].reverse()) {
        let exists = true;
        try {
          await queryInterface.describeTable(target.table);
        } catch {
          exists = false;
        }
        if (!exists) {
          continue;
        }
        if (await constraintExists(queryInterface, target.table, target.constraint, transaction)) {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${target.table}\` DROP FOREIGN KEY \`${target.constraint}\``,
            { transaction },
          );
        }
        const indexes = await indexRows(queryInterface, target.table);
        if (indexes.some((i) => i.name === target.index)) {
          await queryInterface.removeIndex(target.table, target.index, { transaction });
        }
        await removeColumnIfPresent(queryInterface, target.table, ORGANISATION_ID, transaction);
      }
    }),
};
