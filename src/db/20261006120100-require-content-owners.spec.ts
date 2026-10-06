import { C8_COLUMNS } from "./required-columns";
import { makeRequiredColumnsQI } from "src/test-support/required-columns-qi";

/**
 * C8: the guarded tightening. Drives up() and down() against a stand-in
 * QueryInterface (see src/test-support/required-columns-qi.ts): it proves what the
 * migration asks MySQL for, in what order, and what it refuses. The real runs
 * (a backfilled copy, a copy with NULLs put back, a fresh database) are described
 * in the change description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261006120100-require-content-owners");

const TABLES = "curriculums,questions,documents,questiontags,documenttags,subjects".split(",");
const nullable = Object.fromEntries(C8_COLUMNS.map((c) => [`${c.table}.${c.column}`, { nullable: true }]));
const tightened = Object.fromEntries(C8_COLUMNS.map((c) => [`${c.table}.${c.column}`, { nullable: false }]));
const tableOf = (sql: string) => /ALTER TABLE `(\w+)`/.exec(sql)![1];

describe("C8 up()", () => {
  it("makes exactly curriculums,questions,documents,questiontags,documenttags,subjects required, in order, each in its own ALTER, with no data written", async () => {
    const fake = makeRequiredColumnsQI(C8_COLUMNS, nullable);
    await migration.up(fake.queryInterface);
    expect(fake.alters().map(tableOf)).toEqual(TABLES);
    expect(fake.alters().every((s) => s.endsWith(" NOT NULL"))).toBe(true);
    expect(fake.writes()).toEqual([]);
  });

  it("counts the NULL rows BEFORE any DDL: the first ALTER comes after every count", async () => {
    const fake = makeRequiredColumnsQI(C8_COLUMNS, nullable);
    await migration.up(fake.queryInterface);
    const firstAlter = fake.statements.findIndex((s) => /^ALTER TABLE/.test(s));
    const lastCount = fake.statements.map((s, i) => (/^SELECT COUNT/.test(s) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    expect(lastCount).toBeGreaterThanOrEqual(0);
    expect(firstAlter).toBeGreaterThan(lastCount);
  });

  it("refuses when any column holds a NULL: throws with the counts and ids, sends no ALTER, changes nothing", async () => {
    const last = C8_COLUMNS[C8_COLUMNS.length - 1];
    const fake = makeRequiredColumnsQI(C8_COLUMNS, { ...nullable, [`${last.table}.${last.column}`]: { nullable: true, nulls: ["row-x", "row-y"] } });
    const err = await migration.up(fake.queryInterface).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("C8");
    expect(err.message).toContain("refused");
    expect(err.message).toContain(`${last.table}.${last.column}: 2 row(s) with no value (${last.pk}, all 2): row-x, row-y`);
    expect(fake.alters()).toEqual([]);
    for (const c of C8_COLUMNS) expect(fake.cols.get(`${c.table}.${c.column}`)!.nullable).toBe(true);
  });

  it("is idempotent: on tightened tables a second run is a no-op", async () => {
    const fake = makeRequiredColumnsQI(C8_COLUMNS, tightened);
    await migration.up(fake.queryInterface);
    expect(fake.alters()).toEqual([]);
  });
});

describe("C8 down()", () => {
  it("makes the columns nullable again, in reverse order, writing no data", async () => {
    const fake = makeRequiredColumnsQI(C8_COLUMNS, tightened);
    await migration.down(fake.queryInterface);
    expect(fake.alters().map(tableOf)).toEqual([...TABLES].reverse());
    expect(fake.alters().every((s) => s.endsWith(" NULL DEFAULT NULL"))).toBe(true);
    expect(fake.writes()).toEqual([]);
  });

  it("round-trips: up, down, up leaves the columns required", async () => {
    const fake = makeRequiredColumnsQI(C8_COLUMNS, nullable);
    await migration.up(fake.queryInterface);
    await migration.down(fake.queryInterface);
    for (const c of C8_COLUMNS) expect(fake.cols.get(`${c.table}.${c.column}`)!.nullable).toBe(true);
    await migration.up(fake.queryInterface);
    for (const c of C8_COLUMNS) expect(fake.cols.get(`${c.table}.${c.column}`)!.nullable).toBe(false);
  });
});
