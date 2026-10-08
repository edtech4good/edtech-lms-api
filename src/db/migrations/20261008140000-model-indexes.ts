import { QueryInterface, QueryTypes, Transaction } from "sequelize";
import { inStrictMode } from "../required-columns";
import { tableNameList } from "../migration-helpers";

/**
 * The indexes the models declare and no migration ever created.
 *
 * Central never calls `sequelize.sync()` (src/server.ts has it commented out), so an
 * `indexes:` entry in a model exists in a database only if a migration made it. Measured
 * from the compiled models against `information_schema.statistics` of a fully migrated
 * database (`npm run db:check-indexes`): 42 non-primary indexes declared, 21 present
 * under their model name, 21 not. Fourteen of those 21 are added here. The other seven
 * are single-column indexes that an index already there starts with, so they would add
 * nothing: `studentid` on six tables (each has `<table>_studentid_...`, a composite that
 * leads with `studentid`) and `schools.countryid` (the foreign key's own
 * `schools_countryid_foreign_idx`). They are deliberately not added; if `sync()` is ever
 * switched on it will add those seven by name, which is harmless.
 *
 * ## What it adds
 *
 * Each of the fourteen with the exact name and column list its model gives it (so a later
 * `sync()` finds each by name and does nothing), as `ADD INDEX <name> USING BTREE (<cols>)`
 * (the models declare BTREE). None is unique, so there is no duplicate to guard against.
 * One ALTER per table. No data is read or written. Note `studentactives.lessonid` is on the
 * column `referenceid`: the model names the index `lessonid` and indexes `referenceid`.
 *
 * ## Idempotence
 *
 * For each index `up()` reads `information_schema.statistics` and skips one whose NAME is
 * already on the table (the test `sync()` itself applies), so a database that already has
 * them (a hand-built one, or a re-run) is sent no DDL at all and only SequelizeMeta gains a
 * row. A table that is not there is skipped, not created. The connection is put in strict
 * SQL mode for the ALTERs and restored afterwards (no row is written, so this is a pin,
 * not a need).
 *
 * ## down()
 *
 * Drops, by name and only where present, the fourteen, in reverse, whether or not `up()`
 * created them (on a database that had them before, e.g. a hand-built one, `down()` drops
 * them too). It touches no index outside those fourteen names: the composites, primary keys
 * and the seven above stay.
 */

interface IndexSpec {
  table: string;
  name: string;
  columns: string[];
}

const ix = (table: string, name: string, ...columns: string[]): IndexSpec => ({ table, name, columns });

/** Table order is the order of the ALTERs; down() takes it in reverse. */
const MODEL_INDEXES: readonly IndexSpec[] = [
  ix("studentlearningsprogress", "lessonlearningid", "lessonlearningid"),
  ix("studentgradesprogress", "gradeid", "gradeid"),
  ix("studentgradesprogress", "curriculumid", "curriculumid"),
  ix("studentlevelsprogress", "levelid", "levelid"),
  ix("studentlevelsprogress", "gradeid", "gradeid"),
  ix("studentlevelsprogress", "curid", "curid"),
  ix("studentlessonsprogress", "lessonid", "lessonid"),
  ix("studentlessonsprogress", "levelid", "levelid"),
  ix("studentlessonsprogress", "gradeid", "gradeid"),
  ix("studentlessonsprogress", "curid", "curid"),
  ix("studentactives", "lessonid", "referenceid"),
  ix("studentpoints", "lessonid", "lessonid"),
  ix("studentappusages", "schooluserid", "schooluserid"),
  ix("lessonplans", "lessonid", "lessonid"),
];

/** Identifiers here are our own constants; this keeps it that way. */
function id(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Unexpected identifier: ${name}`);
  }
  return name;
}

async function indexNames(queryInterface: QueryInterface, table: string, transaction: Transaction): Promise<Set<string>> {
  const rows = (await queryInterface.sequelize.query(
    `SELECT DISTINCT INDEX_NAME AS name FROM information_schema.statistics
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table], type: QueryTypes.SELECT, transaction },
  )) as Array<{ name?: string; NAME?: string }>;
  return new Set(rows.map((r) => String(r.name ?? r.NAME)));
}

const addClause = (s: IndexSpec): string =>
  `ADD INDEX \`${id(s.name)}\` USING BTREE (${s.columns.map((c) => `\`${id(c)}\``).join(", ")})`;

const tablesOf = (specs: readonly IndexSpec[]): string[] => [...new Set(specs.map((s) => s.table))];

async function alter(queryInterface: QueryInterface, table: string, clauses: string[], transaction: Transaction): Promise<void> {
  if (clauses.length === 0) {
    return;
  }
  await queryInterface.sequelize.query(`ALTER TABLE \`${id(table)}\` ${clauses.join(", ")}`, { transaction });
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const present = new Set(await tableNameList(queryInterface));
      await inStrictMode(queryInterface, transaction, async () => {
        for (const table of tablesOf(MODEL_INDEXES)) {
          if (!present.has(table)) {
            continue;
          }
          const have = await indexNames(queryInterface, table, transaction);
          const missing = MODEL_INDEXES.filter((s) => s.table === table && !have.has(s.name));
          await alter(queryInterface, table, missing.map(addClause), transaction);
        }
      });
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const present = new Set(await tableNameList(queryInterface));
      await inStrictMode(queryInterface, transaction, async () => {
        for (const table of tablesOf(MODEL_INDEXES).reverse()) {
          if (!present.has(table)) {
            continue;
          }
          const have = await indexNames(queryInterface, table, transaction);
          const drops = MODEL_INDEXES.filter((s) => s.table === table && have.has(s.name))
            .reverse()
            .map((s) => `DROP INDEX \`${id(s.name)}\``);
          await alter(queryInterface, table, drops, transaction);
        }
      });
    }),
};
