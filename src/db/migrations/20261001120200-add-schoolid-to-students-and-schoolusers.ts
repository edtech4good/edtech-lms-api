import { QueryInterface, QueryTypes, Transaction } from "sequelize";
import { removeColumnIfPresent, tableOptionsMatchingColumn } from "../migration-helpers";

/**
 * C4 of the multi-organisation model: a nullable `schoolid` on `students` and
 * `schoolusers`, backfilled from the school's name. Learners and school logins
 * are tied to a school by NAME today; this step only makes the id exist and
 * (with the writers changed in the same package) stay correct. Nothing reads
 * the new column yet, and nothing about `schoolname` changes.
 *
 * ## Column type
 *
 * `schoolid` takes its type, charset and collation from the REAL
 * `schools.schoolid` column (information_schema), not from the model: a foreign
 * key between columns of different collations is refused by MySQL, and the
 * model and the table do not always agree (see C1, `organisationcountry`).
 * Added with raw `ALTER TABLE` because Sequelize's `addColumn` cannot carry a
 * per-column collation.
 *
 * ## Foreign key: ON DELETE RESTRICT
 *
 * Schools are only ever soft-deleted by the API (`isdeleted`); a hard delete
 * happens by hand. When it does, the choice is between failing, orphaning
 * (SET NULL) and deleting the learners (CASCADE). A school id is identity, and
 * the learners' history hangs off it, so a hard delete of a school that still
 * has learners or logins must fail loudly: RESTRICT. `ON UPDATE CASCADE` is
 * harmless (`schoolid` is a uuid that never changes) and matches C1.
 *
 * ## Backfill
 *
 * Matches the row's `schoolname` to `schools.schoolname`, in this order, and
 * only ever fills NULLs:
 *
 *  1. EXACT text (byte for byte). `CAST(.. AS BINARY)` is used because the
 *     column collation is a poor judge of "the same name": under
 *     `utf8mb4_unicode_ci` trailing spaces are ignored and several Khmer marks
 *     (bantoc U+17CB, nikahit U+17C6, musikatoan U+17C9) weigh nothing, so two
 *     different names can compare equal. A name that is exact for exactly one
 *     school is filled.
 *  2. LOOSE, under the school column's own collation, for rows still empty:
 *     filled ONLY when exactly one school matches. A learner whose stored name
 *     differs from the school's only by a trailing space or a Khmer mark still
 *     belongs to that school today (the name join is a collation compare), so
 *     it keeps its school. Its `schoolname` text is NOT rewritten: this
 *     migration changes no names.
 *  3. Everything else (no match, or several loose matches, or a NULL name) is
 *     left NULL. The counts are printed; never the names.
 *
 * Soft-deleted schools are matched like any other: the id is identity, not
 * liveness. A learner of a deleted school keeps pointing at it.
 *
 * ## Idempotence
 *
 * MySQL DDL commits implicitly, so the transaction wrapper cannot undo a
 * half-applied migration. Every step is guarded (column on `describeTable`,
 * index on `showIndex`, foreign key on information_schema) and the backfill
 * touches only rows where `schoolid IS NULL`, so a re-run changes nothing and a
 * run after a partial failure completes the job.
 */
const SCHOOLS = "schools";

type Target = { table: string; pk: string };
const TARGETS: Target[] = [
  { table: "students", pk: "studentid" },
  { table: "schoolusers", pk: "schooluserid" },
];

const indexName = (table: string) => `${table}_schoolid_idx`;
const fkName = (table: string) => `fk_${table}_schoolid`;

type Q = QueryInterface["sequelize"]["query"];

async function indexNames(queryInterface: QueryInterface, table: string): Promise<Set<string>> {
  const indexes = (await queryInterface.showIndex(table)) as Array<{ name?: string }>;
  return new Set(indexes.map((i) => String(i.name)));
}

async function foreignKeyExists(
  queryInterface: QueryInterface,
  table: string,
  name: string,
  transaction: Transaction,
): Promise<boolean> {
  const rows = (await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME AS name
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = ?`,
    { replacements: [table, name], type: QueryTypes.SELECT, transaction },
  )) as Array<{ name?: string }>;
  return rows.length > 0;
}

/** `varchar(36)` etc., exactly as the real `schools.schoolid` reports it. */
async function realColumnType(
  queryInterface: QueryInterface,
  table: string,
  column: string,
  transaction: Transaction,
): Promise<string> {
  const rows = (await queryInterface.sequelize.query(
    `SELECT COLUMN_TYPE AS type
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    { replacements: [table, column], type: QueryTypes.SELECT, transaction },
  )) as Array<{ type?: string }>;
  const type = rows[0]?.type ?? "varchar(36)";
  // Interpolated into DDL below, so refuse anything that is not a plain type.
  if (!/^[a-z]+\(\d+\)$/i.test(type)) {
    throw new Error(`Unexpected type for ${table}.${column}: ${type}`);
  }
  return type;
}

/** Interpolated into SQL, so only ever a plain identifier from information_schema. */
function safeIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Unexpected identifier: ${value}`);
  }
  return value;
}

async function count(q: Q, sql: string, transaction: Transaction): Promise<number> {
  const rows = (await q(sql, { type: QueryTypes.SELECT, transaction })) as Array<{ n: number | string }>;
  return Number(rows[0]?.n ?? 0);
}

async function affected(q: Q, sql: string, transaction: Transaction): Promise<number> {
  const result = (await q(sql, { type: QueryTypes.UPDATE, transaction })) as unknown as [unknown, number];
  return Number(result?.[1] ?? 0);
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const q: Q = queryInterface.sequelize.query.bind(queryInterface.sequelize);
      const opts = await tableOptionsMatchingColumn(queryInterface, SCHOOLS, "schoolid");
      const charset = safeIdentifier(opts.charset);
      const collate = safeIdentifier(opts.collate);
      const type = await realColumnType(queryInterface, SCHOOLS, "schoolid", transaction);

      // 1. Structure: column, index, foreign key, per table.
      for (const { table } of TARGETS) {
        const desc = await queryInterface.describeTable(table);
        if (!desc.schoolid) {
          await q(
            `ALTER TABLE \`${table}\` ADD COLUMN \`schoolid\` ${type} ` +
              `CHARACTER SET ${charset} COLLATE ${collate} NULL DEFAULT NULL`,
            { transaction },
          );
        }
        if (!(await indexNames(queryInterface, table)).has(indexName(table))) {
          await queryInterface.addIndex(table, ["schoolid"], {
            name: indexName(table),
            transaction,
          });
        }
        if (!(await foreignKeyExists(queryInterface, table, fkName(table), transaction))) {
          await q(
            `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fkName(table)}\` ` +
              `FOREIGN KEY (\`schoolid\`) REFERENCES \`${SCHOOLS}\` (\`schoolid\`) ` +
              `ON DELETE RESTRICT ON UPDATE CASCADE`,
            { transaction },
          );
        }
      }

      // 2. Backfill. The school column's own collation defines "looser".
      const nameCollation = safeIdentifier(
        (
          (await q(
            `SELECT COLLATION_NAME AS coll FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'schoolname' LIMIT 1`,
            { replacements: [SCHOOLS], type: QueryTypes.SELECT, transaction },
          )) as Array<{ coll?: string }>
        )[0]?.coll ?? "utf8mb4_unicode_ci",
      );

      for (const { table, pk } of TARGETS) {
        const exact = await affected(
          q,
          `UPDATE \`${table}\` t
             JOIN (SELECT MIN(schoolid) AS schoolid, MIN(schoolname) AS schoolname
                     FROM \`${SCHOOLS}\`
                    GROUP BY CAST(schoolname AS BINARY)
                   HAVING COUNT(*) = 1) s
               ON CAST(t.schoolname AS BINARY) = CAST(s.schoolname AS BINARY)
              SET t.schoolid = s.schoolid
            WHERE t.schoolid IS NULL AND t.schoolname IS NOT NULL`,
          transaction,
        );
        const loose = await affected(
          q,
          `UPDATE \`${table}\` t
             JOIN (SELECT t2.\`${pk}\` AS pk, MIN(s.schoolid) AS schoolid
                     FROM \`${table}\` t2
                     JOIN \`${SCHOOLS}\` s
                       ON t2.schoolname = s.schoolname COLLATE ${nameCollation}
                    WHERE t2.schoolid IS NULL AND t2.schoolname IS NOT NULL
                    GROUP BY t2.\`${pk}\`
                   HAVING COUNT(*) = 1) m
               ON m.pk = t.\`${pk}\`
              SET t.schoolid = m.schoolid
            WHERE t.schoolid IS NULL`,
          transaction,
        );
        const total = await count(q, `SELECT COUNT(*) AS n FROM \`${table}\``, transaction);
        const unnamed = await count(
          q,
          `SELECT COUNT(*) AS n FROM \`${table}\` WHERE schoolid IS NULL AND schoolname IS NULL`,
          transaction,
        );
        const ambiguous = await count(
          q,
          `SELECT COUNT(*) AS n FROM \`${table}\` t
            WHERE t.schoolid IS NULL AND t.schoolname IS NOT NULL
              AND (SELECT COUNT(*) FROM \`${SCHOOLS}\` s
                    WHERE t.schoolname = s.schoolname COLLATE ${nameCollation}) > 1`,
          transaction,
        );
        const unmatched = await count(
          q,
          `SELECT COUNT(*) AS n FROM \`${table}\` t
            WHERE t.schoolid IS NULL AND t.schoolname IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM \`${SCHOOLS}\` s
                    WHERE t.schoolname = s.schoolname COLLATE ${nameCollation})`,
          transaction,
        );
        // Counts only, never names.
        console.log(
          `C4 ${table}: rows=${total} filled_exact=${exact} filled_loose_only=${loose} ` +
            `left_null_no_name=${unnamed} left_null_ambiguous=${ambiguous} left_null_no_match=${unmatched}`,
        );
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      // Foreign key first, then its index, then the column. Each step is
      // guarded so a partial `up()` can be undone. The backfilled ids are
      // derived data (re-running `up()` recomputes them from the names).
      for (const { table } of TARGETS) {
        let desc: Record<string, unknown>;
        try {
          desc = await queryInterface.describeTable(table);
        } catch {
          continue;
        }
        if (!desc.schoolid) {
          continue;
        }
        if (await foreignKeyExists(queryInterface, table, fkName(table), transaction)) {
          await queryInterface.sequelize.query(
            `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fkName(table)}\``,
            { transaction },
          );
        }
        if ((await indexNames(queryInterface, table)).has(indexName(table))) {
          await queryInterface.removeIndex(table, indexName(table), { transaction });
        }
        await removeColumnIfPresent(queryInterface, table, "schoolid", transaction);
      }
    }),
};
