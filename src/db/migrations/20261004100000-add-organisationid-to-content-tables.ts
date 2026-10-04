import { QueryInterface, Transaction } from "sequelize";
import { removeColumnIfPresent, tableOptionsMatchingColumn } from "../migration-helpers";

/**
 * C7 of the multi-organisation model: a nullable `organisationid` on the six
 * content tables that carry their own owner (`curriculums`, `questions`,
 * `documents`, `questiontags`, `documenttags`, `subjects`), each with an index
 * and a foreign key to `organisations`. Everything else in the content tree takes
 * its owner from a parent and gets no column.
 *
 * The columns stay NULLABLE and nothing is written to them here: existing rows
 * stay unowned until a separate backfill assigns them, and only after that is
 * the column made required. No data changes.
 *
 * ## Foreign keys and collation
 *
 * As in C3, each column takes the charset and collation of the REAL
 * `organisations.organisationid` column (read from the database; MySQL refuses a
 * foreign key between columns that differ, and the sibling tables differ between
 * deployments), so it is added with a raw `ALTER TABLE`. Every identifier in a
 * statement is a constant in this file; charset and collation names come from
 * `information_schema` and are checked against a strict pattern first.
 * `ON DELETE RESTRICT` (an organisation that still owns content cannot be
 * hard-deleted), `ON UPDATE CASCADE`.
 *
 * `ADD FOREIGN KEY` is done in place (no table copy) only with
 * `foreign_key_checks` off. While the column holds no value there is nothing to
 * validate, so the key is added with it off for that one statement, on the
 * migration's own connection, and restored in a `finally`. A re-run that finds
 * values already in the column adds the key the normal, validating way.
 *
 * ## Idempotence
 *
 * MySQL DDL commits implicitly, so a half-applied run cannot be rolled back.
 * Every step is guarded (column on `describeTable`, index on `showIndex`,
 * constraint on `information_schema`), so a re-run after a partial failure
 * finishes the job.
 *
 * ## down()
 *
 * Per table, in reverse order: constraint, then index, then column. It discards
 * any owner written since `up()`; roll the code back first.
 */
const ORGANISATIONS = "organisations";
const ORGANISATION_ID = "organisationid";

const TARGETS = [
  { table: "curriculums" },
  { table: "questions" },
  { table: "documents" },
  { table: "questiontags" },
  { table: "documenttags" },
  { table: "subjects" },
].map((t) => ({
  ...t,
  index: `${t.table}_organisationid_idx`,
  constraint: `${t.table}_organisationid_fk`,
}));

const SQL_NAME = /^[A-Za-z0-9_]+$/;

type IndexRow = { name?: string };
const indexRows = async (queryInterface: QueryInterface, table: string): Promise<IndexRow[]> =>
  (await queryInterface.showIndex(table)) as IndexRow[];

async function constraintExists(
  queryInterface: QueryInterface,
  table: string,
  constraint: string,
  transaction: Transaction,
): Promise<boolean> {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME AS name
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1`,
    { replacements: [table, constraint], transaction },
  );
  return (rows as unknown[]).length > 0;
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const q = (sql: string) => queryInterface.sequelize.query(sql, { transaction });
      const opts = await tableOptionsMatchingColumn(queryInterface, ORGANISATIONS, ORGANISATION_ID);
      if (!SQL_NAME.test(opts.charset) || !SQL_NAME.test(opts.collate)) {
        throw new Error(`Unexpected charset/collation reported for ${ORGANISATIONS}.${ORGANISATION_ID}.`);
      }

      for (const target of TARGETS) {
        const description = await queryInterface.describeTable(target.table);
        if (!description[ORGANISATION_ID]) {
          await q(
            `ALTER TABLE \`${target.table}\` ADD COLUMN \`${ORGANISATION_ID}\` VARCHAR(36) ` +
              `CHARACTER SET ${opts.charset} COLLATE ${opts.collate} NULL`,
          );
        }

        const indexes = await indexRows(queryInterface, target.table);
        if (!indexes.some((i) => i.name === target.index)) {
          await queryInterface.addIndex(target.table, [ORGANISATION_ID], { name: target.index, transaction });
        }

        if (!(await constraintExists(queryInterface, target.table, target.constraint, transaction))) {
          const addKey = () =>
            q(
              `ALTER TABLE \`${target.table}\` ADD CONSTRAINT \`${target.constraint}\` ` +
                `FOREIGN KEY (\`${ORGANISATION_ID}\`) REFERENCES \`${ORGANISATIONS}\` (\`${ORGANISATION_ID}\`) ` +
                "ON DELETE RESTRICT ON UPDATE CASCADE",
            );
          const [rows] = await queryInterface.sequelize.query(
            `SELECT COUNT(*) AS n FROM \`${target.table}\` WHERE \`${ORGANISATION_ID}\` IS NOT NULL`,
            { transaction },
          );
          const filled = Number((rows as Array<{ n: number | string }>)[0]?.n ?? 0);
          if (filled === 0) {
            // Nothing to validate: add it in place instead of copying the table.
            await q("SET foreign_key_checks = 0");
            try {
              await addKey();
            } finally {
              await q("SET foreign_key_checks = 1");
            }
          } else {
            await addKey();
          }
        }
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
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
