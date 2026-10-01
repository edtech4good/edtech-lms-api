import { checkSchoolIdInvariant, invariantHolds, SchoolIdInvariantRow } from "./school-id-invariant";

/**
 * The invariant check is a script for a real database (`npm run
 * db:check-schoolid`); this spec pins what it asks MySQL and how it reads the
 * answer. The SQL is what makes it honest, so the parts that matter are
 * asserted on the text: names are compared byte for byte, and the looser
 * "equal under the collation" comparison is only used to LABEL a mismatch.
 */

const makeDb = (perTable: Record<string, Record<string, number>>, collation = "utf8mb4_unicode_ci") => {
  const query = jest.fn(async (sql: string) => {
    if (/INFORMATION_SCHEMA/.test(sql)) return [{ coll: collation }];
    const table = /FROM `(\w+)` t/.exec(sql)![1];
    return [perTable[table]];
  });
  return { query };
};

const zero = { rows: 5, nullSchoolId: 0, nullBecauseNoName: 0, mismatchedName: 0, looseOnlyName: 0 };

describe("checkSchoolIdInvariant", () => {
  it("reads both tables and reports counts per table", async () => {
    const db = makeDb({
      students: { ...zero, rows: 25 },
      schoolusers: { ...zero, rows: 26, nullSchoolId: 2, nullBecauseNoName: 1, mismatchedName: 3, looseOnlyName: 2 },
    });
    const result = await checkSchoolIdInvariant(db);
    expect(result).toEqual([
      { table: "students", rows: 25, nullSchoolId: 0, nullBecauseNoName: 0, mismatchedName: 0, looseOnlyName: 0, differentName: 0 },
      { table: "schoolusers", rows: 26, nullSchoolId: 2, nullBecauseNoName: 1, mismatchedName: 3, looseOnlyName: 2, differentName: 1 },
    ]);
  });

  it("compares names byte for byte, and uses the collation only to label a mismatch as 'loose only'", async () => {
    const db = makeDb({ students: zero, schoolusers: zero }, "utf8mb4_0900_as_ci");
    await checkSchoolIdInvariant(db);
    const sql = db.query.mock.calls.map((c) => String(c[0])).find((s) => /FROM `students` t/.test(s))!;
    expect(sql).toMatch(/CAST\(t\.schoolname AS BINARY\) <> CAST\(s\.schoolname AS BINARY\)/);
    // the loose label uses the school column's own collation, read from information_schema
    expect(sql).toMatch(/t\.schoolname = s\.schoolname COLLATE utf8mb4_0900_as_ci/);
    // a NULL name next to a set id is a mismatch, not silently fine
    expect(sql).toMatch(/t\.schoolname IS NULL\s+OR CAST/);
    // rows with no id are counted separately, with the ones that have no name either
    expect(sql).toMatch(/SUM\(t\.schoolid IS NULL\), 0\) AS nullSchoolId/);
    expect(sql).toMatch(/SUM\(t\.schoolid IS NULL AND t\.schoolname IS NULL\), 0\) AS nullBecauseNoName/);
  });

  it("refuses a collation name that is not a plain identifier (it is interpolated into SQL)", async () => {
    await expect(checkSchoolIdInvariant(makeDb({ students: zero, schoolusers: zero }, "x; DROP TABLE y"))).rejects.toThrow(
      /Unexpected collation/,
    );
  });
});

describe("invariantHolds", () => {
  const ok: SchoolIdInvariantRow = {
    table: "students", rows: 3, nullSchoolId: 0, nullBecauseNoName: 0, mismatchedName: 0, looseOnlyName: 0, differentName: 0,
  };

  it("is true only when no row lacks an id and no name differs", () => {
    expect(invariantHolds([ok, { ...ok, table: "schoolusers" }])).toBe(true);
  });

  it("is false for a row with no schoolid", () => {
    expect(invariantHolds([ok, { ...ok, table: "schoolusers", nullSchoolId: 1 }])).toBe(false);
  });

  it("is false for a name that differs, even one that is only equal under the collation", () => {
    expect(invariantHolds([{ ...ok, mismatchedName: 1, looseOnlyName: 1 }])).toBe(false);
    expect(invariantHolds([{ ...ok, mismatchedName: 1, differentName: 1 }])).toBe(false);
  });
});
