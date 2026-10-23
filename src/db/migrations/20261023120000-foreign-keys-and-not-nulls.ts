import { QueryInterface, QueryTypes, Transaction } from "sequelize";
import { FOREIGN_KEYS, ForeignKeySpec, NOT_NULL_COLUMNS, NotNullSpec, assertNoViolations, foreignKeyName, sqlName } from "../foreign-keys";
import { inStrictMode } from "../required-columns";
import { tableNameList } from "../migration-helpers";

/**
 * The 19 foreign keys the models have always declared and no database ever held, and the 14
 * columns the models require that the database still lets be NULL.
 *
 * ## The guard
 *
 * Before any DDL `up()` counts, for each of the 19 columns, the non-NULL child values that name no
 * parent row (soft-deleted rows included), and for each of the 14 columns the NULLs. If any count is
 * not zero it throws ONE error naming every offending column with its count (and a sample of the
 * dangling ids) and "Nothing was changed.".
 *
 * ## What it does
 *
 * 1. On the six FK columns that no index leads with (`feedbacks.created_by`, `feedbacks.curriculumid`,
 *    `rpiuseraccess.userid`, `schoolcontributedata.schoolid`, `students.standard`,
 *    `syncrecords.created_by`) it adds a single-column index, named after the column as
 *    `20261008140000-model-indexes` names its indexes. The other thirteen columns are already led by
 *    an index (the model indexes, or a composite that starts with `studentid`), which the key uses.
 * 2. Adds the 19 foreign keys, named `<table>_<column>_fk`, ON UPDATE CASCADE ON DELETE RESTRICT:
 *    most deletes here are soft, so a hard delete of a parent that still has children must fail loudly
 *    (the writers answer it with a message, never a raw error). `rpiuseraccess.userid` (varchar(45))
 *    and `students.standard` (varchar(250)) reference varchar(36) keys: MySQL allows the lengths to
 *    differ for string columns, so neither is altered.
 * 3. Makes the 14 columns NOT NULL, keeping the type, character set, collation, comment and DEFAULT
 *    as the database reports them (the eight `createdAt`/`updatedAt` keep `DEFAULT CURRENT_TIMESTAMP`;
 *    the six `studentpoints` integers have no default and still have none).
 *
 * `studentprogress.studentprogressreferenceid` is polymorphic and gets no key (see foreign-keys.ts).
 *
 * ## Idempotence
 *
 * Each step reads information_schema first: an index that leads with the column, a key that already
 * runs from the column to its parent (whatever its name), a column already NOT NULL are skipped, so a
 * re-run sends no DDL and a run that stopped halfway finishes. A table that is not there is skipped.
 * The connection is pinned to strict SQL mode for the MODIFYs and restored.
 *
 * ## down()
 *
 * Drops the 19 keys by name, then the six indexes by name (in that order: an index a key uses cannot
 * be dropped, which is also why this must come off before `20261008140000-model-indexes` does), then
 * makes the 14 columns nullable again. It drops each of the six index names if an index of exactly that
 * name is there, and never touches `20261008140000-model-indexes`' indexes. (A name cannot say who made the
 * index: one that was there before `up()` and made it skip the create is dropped too.)
 */

interface ColumnRow {
  type: string;
  nullable: string;
  def: string | null;
  extra: string;
  cs: string | null;
  coll: string | null;
  comment: string;
}

const rowsOf = (result: unknown): Array<Record<string, unknown>> => (Array.isArray(result) ? (result as Array<Record<string, unknown>>).filter((r) => r && typeof r === "object" && !Array.isArray(r)) : []);

const TYPE = /^[a-z]+(\(\d+(,\d+)?\))?( unsigned)?( zerofill)?$/i;
const GENERATED_DEFAULT = /^CURRENT_TIMESTAMP(\(\d\))?$/i;
const KNOWN_EXTRA = new Set(["", "DEFAULT_GENERATED", "on update CURRENT_TIMESTAMP", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"]);

async function readColumn(queryInterface: QueryInterface, spec: NotNullSpec, transaction: Transaction): Promise<ColumnRow | null> {
  const rows = rowsOf(
    await queryInterface.sequelize.query(
      `SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def, EXTRA AS extra,
              CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll, COLUMN_COMMENT AS comment
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        LIMIT 1`,
      { replacements: [spec.table, spec.column], type: QueryTypes.SELECT, transaction },
    ),
  );
  const r = rows[0];
  if (!r || typeof r.type !== "string") {
    return null;
  }
  return {
    type: r.type,
    nullable: String(r.nullable).toUpperCase(),
    def: r.def === null || r.def === undefined ? null : String(r.def),
    extra: String(r.extra ?? ""),
    cs: (r.cs as string | null | undefined) ?? null,
    coll: (r.coll as string | null | undefined) ?? null,
    comment: String(r.comment ?? ""),
  };
}

/** `MODIFY COLUMN` for the column exactly as read, changing only its nullability (and, for NOT NULL, dropping an implicit DEFAULT NULL). */
function modifyStatement(queryInterface: QueryInterface, spec: NotNullSpec, c: ColumnRow, nullable: boolean): string {
  if (!TYPE.test(c.type)) {
    throw new Error(`Unexpected type for ${spec.table}.${spec.column}: ${c.type}`);
  }
  if (!KNOWN_EXTRA.has(c.extra)) {
    throw new Error(`Unexpected EXTRA for ${spec.table}.${spec.column}: ${c.extra}`);
  }
  const charset = c.cs === null ? "" : ` CHARACTER SET ${sqlName(c.cs)}`;
  const collation = c.coll === null ? "" : ` COLLATE ${sqlName(c.coll)}`;
  let def = "";
  if (c.def !== null) {
    if (c.extra.includes("DEFAULT_GENERATED")) {
      if (!GENERATED_DEFAULT.test(c.def)) {
        throw new Error(`Unexpected default expression for ${spec.table}.${spec.column}: ${c.def}`);
      }
      def = ` DEFAULT ${c.def}`;
    } else {
      def = ` DEFAULT ${queryInterface.sequelize.escape(c.def)}`;
    }
  } else if (nullable) {
    def = " DEFAULT NULL";
  }
  const onUpdate = /on update CURRENT_TIMESTAMP/.test(c.extra) ? " ON UPDATE CURRENT_TIMESTAMP" : "";
  const comment = c.comment === "" ? "" : ` COMMENT ${queryInterface.sequelize.escape(c.comment)}`;
  return `ALTER TABLE \`${sqlName(spec.table)}\` MODIFY COLUMN \`${sqlName(spec.column)}\` ${c.type}${charset}${collation} ${nullable ? "NULL" : "NOT NULL"}${def}${onUpdate}${comment}`;
}

/** Index names on the table, and which columns each index is led by. */
async function indexState(queryInterface: QueryInterface, table: string, transaction: Transaction): Promise<{ names: Set<string>; led: Set<string> }> {
  const rows = rowsOf(
    await queryInterface.sequelize.query(
      `SELECT INDEX_NAME AS name, COLUMN_NAME AS col, SEQ_IN_INDEX AS seq FROM information_schema.statistics
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      { replacements: [table], type: QueryTypes.SELECT, transaction },
    ),
  );
  const names = new Set<string>();
  const led = new Set<string>();
  for (const r of rows) {
    names.add(String(r.name ?? r.NAME));
    if (Number(r.seq ?? r.SEQ) === 1) {
      led.add(String(r.col ?? r.COL));
    }
  }
  return { names, led };
}

/** Foreign keys that run from a column of the table to a parent column, whatever they are named, and the names of all its foreign keys. */
async function keyState(queryInterface: QueryInterface, table: string, transaction: Transaction): Promise<{ names: Set<string>; links: Set<string> }> {
  const rows = rowsOf(
    await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS ptable, REFERENCED_COLUMN_NAME AS pcol
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      { replacements: [table], type: QueryTypes.SELECT, transaction },
    ),
  );
  return {
    names: new Set(rows.map((r) => String(r.name ?? r.NAME))),
    links: new Set(rows.map((r) => `${r.col ?? r.COL}>${r.ptable ?? r.PTABLE}.${r.pcol ?? r.PCOL}`)),
  };
}

const tablesOf = (specs: readonly { table: string }[]): string[] => [...new Set(specs.map((s) => s.table))];

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const present = new Set(await tableNameList(queryInterface));
      await assertNoViolations(queryInterface, present, transaction);

      await inStrictMode(queryInterface, transaction, async () => {
        // 1. the six indexes no index leads with
        for (const table of tablesOf(FOREIGN_KEYS)) {
          if (!present.has(table)) {
            continue;
          }
          const own = FOREIGN_KEYS.filter((s) => s.table === table && s.index);
          if (own.length === 0) {
            continue;
          }
          const have = await indexState(queryInterface, table, transaction);
          for (const s of own) {
            if (have.led.has(s.column) || have.names.has(s.index as string)) {
              continue;
            }
            await queryInterface.sequelize.query(
              `ALTER TABLE \`${sqlName(s.table)}\` ADD INDEX \`${sqlName(s.index as string)}\` USING BTREE (\`${sqlName(s.column)}\`)`,
              { transaction },
            );
          }
        }

        // 2. the 19 foreign keys
        for (const table of tablesOf(FOREIGN_KEYS)) {
          if (!present.has(table)) {
            continue;
          }
          const have = await keyState(queryInterface, table, transaction);
          for (const s of FOREIGN_KEYS.filter((k) => k.table === table)) {
            if (have.names.has(foreignKeyName(s)) || have.links.has(`${s.column}>${s.parentTable}.${s.parentColumn}`)) {
              continue;
            }
            await queryInterface.addConstraint(s.table, {
              fields: [s.column],
              type: "foreign key",
              name: foreignKeyName(s),
              references: { table: s.parentTable, field: s.parentColumn },
              onUpdate: "CASCADE",
              onDelete: "RESTRICT",
              transaction,
            });
          }
        }

        // 3. the 14 NOT NULLs
        for (const s of NOT_NULL_COLUMNS) {
          if (!present.has(s.table)) {
            continue;
          }
          const c = await readColumn(queryInterface, s, transaction);
          if (c === null) {
            throw new Error(`${s.table}.${s.column} does not exist: run the earlier migrations first.`);
          }
          if (c.nullable !== "YES") {
            continue;
          }
          await queryInterface.sequelize.query(modifyStatement(queryInterface, s, c, false), { transaction });
        }
      });
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const present = new Set(await tableNameList(queryInterface));
      await inStrictMode(queryInterface, transaction, async () => {
        // the keys first, in reverse, by name
        for (const table of tablesOf(FOREIGN_KEYS).reverse()) {
          if (!present.has(table)) {
            continue;
          }
          const have = await keyState(queryInterface, table, transaction);
          for (const s of FOREIGN_KEYS.filter((k) => k.table === table).reverse()) {
            if (have.names.has(foreignKeyName(s))) {
              await queryInterface.removeConstraint(s.table, foreignKeyName(s), { transaction });
            }
          }
        }

        // then the six indexes this migration made
        for (const table of tablesOf(FOREIGN_KEYS).reverse()) {
          if (!present.has(table)) {
            continue;
          }
          const own = FOREIGN_KEYS.filter((s: ForeignKeySpec) => s.table === table && s.index).reverse();
          if (own.length === 0) {
            continue;
          }
          const have = await indexState(queryInterface, table, transaction);
          for (const s of own) {
            if (have.names.has(s.index as string)) {
              await queryInterface.sequelize.query(`ALTER TABLE \`${sqlName(s.table)}\` DROP INDEX \`${sqlName(s.index as string)}\``, { transaction });
            }
          }
        }

        // then the columns
        for (const s of [...NOT_NULL_COLUMNS].reverse()) {
          if (!present.has(s.table)) {
            continue;
          }
          const c = await readColumn(queryInterface, s, transaction);
          if (c === null || c.nullable === "YES") {
            continue;
          }
          await queryInterface.sequelize.query(modifyStatement(queryInterface, s, c, true), { transaction });
        }
      });
    }),
};
