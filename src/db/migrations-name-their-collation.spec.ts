/**
 * Every migration that creates a table names its character set and collation.
 *
 * A table that names none takes the DATABASE default. On a stock MySQL 8
 * server that is utf8mb4_0900_ai_ci, while the baseline tables are
 * utf8mb4_unicode_ci, so the foreign key from the new table to a baseline table
 * is refused ("Referencing column ... and referenced column ... are
 * incompatible") and a fresh database stops part-way through `db:migrate`.
 * Naming the collation makes the result independent of the database default.
 *
 * The set is found by RUNNING each migration's up() against a recording fake
 * QueryInterface (not by reading the source), so a migration that builds its
 * options in a helper is judged by what it actually passes to MySQL. The fake
 * answers every read as "nothing exists yet", which is the fresh-database case.
 */
import * as fs from "fs";
import * as path from "path";
import { Sequelize } from "sequelize";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const WANT_CHARSET = "utf8mb4";
const WANT_COLLATE = "utf8mb4_unicode_ci";

type CreateCall = { table: string; options: Record<string, unknown> | undefined };

type Recording = {
  creates: CreateCall[];
  rawCreates: string[];
};

const TX = { id: "the-transaction" };

/**
 * `sequelize.escape` as the MySQL dialect does it for the values a migration
 * can pass: a string is quoted with its quotes, backslashes and control
 * characters escaped, a number passes through, null is NULL. Anything else
 * (a Date, an array, an object) is not escaped here on purpose: it throws, so a
 * migration that starts escaping one gets a clear failure instead of a wrong
 * quoting.
 */
const MYSQL_ESCAPES: Record<string, string> = {
  "\0": "\\0",
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\r": "\\r",
  "\x1a": "\\Z",
  '"': '\\"',
  "'": "\\'",
  "\\": "\\\\",
};
const fakeEscape = (value: unknown): string => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    return `'${value.replace(/[\0\b\t\n\r\x1a"'\\]/g, (c) => MYSQL_ESCAPES[c])}'`;
  }
  throw new Error(`the fake sequelize.escape does not handle a ${typeof value}; add it to the fake`);
};

const makeRecordingQueryInterface = (rec: Recording) => {
  const query = jest.fn(async (sql: unknown) => {
    if (typeof sql === "string" && /CREATE\s+TABLE/i.test(sql)) {
      rec.rawCreates.push(sql);
    }
    return [[], undefined];
  });
  const sequelize = {
    query,
    escape: fakeEscape,
    transaction: jest.fn(async (cb?: (t: unknown) => Promise<unknown>) => (cb ? cb(TX) : TX)),
    Sequelize,
    fn: Sequelize.fn,
    literal: Sequelize.literal,
    col: Sequelize.col,
    getQueryInterface: () => qi,
  };
  const qi: Record<string, unknown> = {
    sequelize,
    createTable: jest.fn(async (table: string, _attrs: unknown, options?: Record<string, unknown>) => {
      rec.creates.push({ table, options });
    }),
    showAllTables: jest.fn(async () => []),
    describeTable: jest.fn(async () => ({})),
    showIndex: jest.fn(async () => []),
    getForeignKeysForTables: jest.fn(async () => ({})),
    tableExists: jest.fn(async () => false),
  };
  // Every other call (addColumn, addIndex, bulkInsert, ...) just succeeds.
  return new Proxy(qi, {
    get: (target, prop: string) =>
      prop in target ? target[prop] : jest.fn(async () => undefined),
  });
};

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith(".d.ts") && !f.endsWith(".spec.ts"))
  .sort();

const source = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

/** Source with block and line comments removed, so a comment that says "createTable" is not counted. */
const code = (file: string) =>
  source(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** How many table creations the code of a file spells out: `createTable(` calls plus raw CREATE TABLE statements. */
const createsInSource = (file: string) =>
  (code(file).match(/\bcreateTable\s*\(/g) ?? []).length +
  (code(file).match(/\bCREATE\s+TABLE\b/gi) ?? []).length;

/**
 * Migrations whose up() cannot be run against the fake: they read rows or
 * table metadata back and branch on it (seeds, a password re-wrap, the
 * NOT NULL tightening). Because the fake cannot see what they do, the rule for
 * them is stricter: they must create no table at all (no `createTable(` and no
 * CREATE TABLE in their code). A migration that needs to create a table has to
 * be made runnable against the fake, not added here.
 */
const NEEDS_REAL_DATA: string[] = [
  "20260407120500-seed-rbac-local-dev.ts",
  "20260719160000-rewrap-md5-passwords-bcrypt.ts",
  "20261001120100-seed-organisation-permissions.ts",
  "20261002120000-seed-organisation-admin-role.ts",
  "20261006120000-require-school-and-organisation-links.ts",
  "20261006120100-require-content-owners.ts",
];

type Outcome = { file: string; rec: Recording; error?: unknown };

const outcomes: Outcome[] = [];

beforeAll(async () => {
  for (const file of migrationFiles) {
    const rec: Recording = { creates: [], rawCreates: [] };
    if (NEEDS_REAL_DATA.includes(file)) {
      outcomes.push({ file, rec });
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path.join(MIGRATIONS_DIR, file));
    try {
      await mod.up(makeRecordingQueryInterface(rec), Sequelize);
    } catch (error) {
      outcomes.push({ file, rec, error });
      continue;
    }
    outcomes.push({ file, rec });
  }
});

describe("migrations name the character set and collation of every table they create", () => {
  it("found the migration files", () => {
    expect(migrationFiles.length).toBeGreaterThan(80);
    expect(outcomes.map((o) => o.file)).toEqual(migrationFiles);
  });

  it("ran every migration's up() against the fake", () => {
    expect(
      outcomes.filter((o) => o.error).map((o) => `${o.file}: ${(o.error as Error)?.message}`),
    ).toEqual([]);
  });

  it("every table creation spelled out in a migration's code was seen (a create behind a guard the fake took cannot hide)", () => {
    const mismatched = outcomes
      .filter((o) => !NEEDS_REAL_DATA.includes(o.file))
      .map((o) => ({
        migration: o.file,
        inSource: createsInSource(o.file),
        recorded: o.rec.creates.length + o.rec.rawCreates.length,
      }))
      .filter((r) => r.inSource !== r.recorded);
    expect(mismatched).toEqual([]);
  });

  it("every createTable call passes charset utf8mb4 and collate utf8mb4_unicode_ci", () => {
    const wrong = outcomes.flatMap((o) =>
      o.rec.creates
        .filter((c) => c.options?.charset !== WANT_CHARSET || c.options?.collate !== WANT_COLLATE)
        .map((c) => ({
          migration: o.file,
          table: c.table,
          charset: c.options?.charset,
          collate: c.options?.collate,
        })),
    );
    expect(wrong).toEqual([]);
  });

  it("every raw CREATE TABLE names the table option CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci (a column-level COLLATE does not count)", () => {
    const wrong = outcomes.flatMap((o) =>
      o.rec.rawCreates
        .filter(
          (sql) =>
            !/CHARSET\s*=\s*utf8mb4\b/i.test(sql) || !/COLLATE\s*=\s*utf8mb4_unicode_ci/i.test(sql),
        )
        .map((sql) => ({ migration: o.file, sql: sql.replace(/\s+/g, " ").slice(0, 80) })),
    );
    expect(wrong).toEqual([]);
  });

  it("the migrations that cannot run against the fake create no table at all", () => {
    expect(NEEDS_REAL_DATA.filter((f) => createsInSource(f) > 0)).toEqual([]);
  });

  it("the list of migrations that cannot run against the fake names real files", () => {
    expect(NEEDS_REAL_DATA.filter((f) => !migrationFiles.includes(f))).toEqual([]);
  });

  it("saw the raw CREATE TABLE the baseline issues (the raw check is not vacuous)", () => {
    const raw = outcomes.flatMap((o) => o.rec.rawCreates.map(() => o.file));
    expect(raw).toContain("20230108000000-create-domain-tables-baseline.ts");
  });

  it("saw the tables the baseline and later migrations create (the recording is not empty)", () => {
    const all = outcomes.flatMap((o) => o.rec.creates.map((c) => c.table));
    expect(all).toEqual(
      expect.arrayContaining(["schools", "studentlearningsprogress", "organisations", "tokens"]),
    );
  });
});
