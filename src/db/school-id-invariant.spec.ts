import { checkSchoolIdInvariant, hasReportedItems, invariantHolds, SchoolIdInvariantRow } from "./school-id-invariant";

/**
 * The invariant check is a script for a real database (`npm run
 * db:check-schoolid`); this spec pins what it asks MySQL and how it reads the
 * answer. The SQL is what makes it honest, so the parts that matter are
 * asserted on the text: names are compared byte for byte, and the looser
 * "equal under the collation" comparison only separates a tolerated drift from
 * a failure.
 */

const makeDb = (perTable: Record<string, Record<string, number>>, collation = "utf8mb4_unicode_ci") => {
  const query = jest.fn(async (sql: string) => {
    if (/INFORMATION_SCHEMA/.test(sql)) return [{ coll: collation }];
    const table = /FROM `(\w+)` t/.exec(sql)![1];
    return [perTable[table]];
  });
  return { query };
};

const zero = { rows: 5, nullWithName: 0, nullNoName: 0, nameDifferent: 0, nameLooseOnly: 0 };

describe("checkSchoolIdInvariant", () => {
  it("reads both tables and reports the four categories per table", async () => {
    const db = makeDb({
      students: { ...zero, rows: 25 },
      schoolusers: { ...zero, rows: 26, nullWithName: 2, nullNoName: 1, nameDifferent: 3, nameLooseOnly: 4 },
    });
    expect(await checkSchoolIdInvariant(db)).toEqual([
      { table: "students", rows: 25, nullWithName: 0, nullNoName: 0, nameDifferent: 0, nameLooseOnly: 0 },
      { table: "schoolusers", rows: 26, nullWithName: 2, nullNoName: 1, nameDifferent: 3, nameLooseOnly: 4 },
    ]);
  });

  it("splits the categories in SQL: no id with a name / no id and no name / name not even loosely equal / loosely equal only", async () => {
    const db = makeDb({ students: zero, schoolusers: zero }, "utf8mb4_0900_as_ci");
    await checkSchoolIdInvariant(db);
    const sql = db.query.mock.calls.map((c) => String(c[0])).find((s) => /FROM `students` t/.test(s))!;
    expect(sql).toMatch(/SUM\(t\.schoolid IS NULL AND t\.schoolname IS NOT NULL\), 0\) AS nullWithName/);
    expect(sql).toMatch(/SUM\(t\.schoolid IS NULL AND t\.schoolname IS NULL\), 0\) AS nullNoName/);
    // a NULL name next to a set id is a failure, and so is a name that is not equal under the collation
    expect(sql).toMatch(/t\.schoolname IS NULL\s+OR NOT \(t\.schoolname = s\.schoolname COLLATE utf8mb4_0900_as_ci\)\)\), 0\) AS nameDifferent/);
    // loose only = collation-equal but NOT byte for byte
    expect(sql).toMatch(/CAST\(t\.schoolname AS BINARY\) <> CAST\(s\.schoolname AS BINARY\)\s+AND t\.schoolname = s\.schoolname COLLATE utf8mb4_0900_as_ci\), 0\) AS nameLooseOnly/);
  });

  it("refuses a collation name that is not a plain identifier (it is interpolated into SQL)", async () => {
    await expect(checkSchoolIdInvariant(makeDb({ students: zero, schoolusers: zero }, "x; DROP TABLE y"))).rejects.toThrow(
      /Unexpected collation/,
    );
  });
});

describe("the verdict", () => {
  const ok: SchoolIdInvariantRow = { table: "students", rows: 3, nullWithName: 0, nullNoName: 0, nameDifferent: 0, nameLooseOnly: 0 };
  const other = { ...ok, table: "schoolusers" as const };

  it("holds when nothing is reported at all", () => {
    expect(invariantHolds([ok, other])).toBe(true);
    expect(hasReportedItems([ok, other])).toBe(false);
  });

  it("FAILS for a row that names a school but has no id", () => {
    expect(invariantHolds([ok, { ...other, nullWithName: 1 }])).toBe(false);
  });

  it("FAILS for a name that differs from its school's", () => {
    expect(invariantHolds([{ ...ok, nameDifferent: 1 }, other])).toBe(false);
  });

  it("does NOT fail for a row with no id and no name: it is reported, to be resolved before the id becomes required", () => {
    expect(invariantHolds([{ ...ok, nullNoName: 2 }, other])).toBe(true);
    expect(hasReportedItems([{ ...ok, nullNoName: 2 }, other])).toBe(true);
  });

  it("does NOT fail for a name that is equal to its school's only under the collation: reported, not failed", () => {
    expect(invariantHolds([ok, { ...other, nameLooseOnly: 3 }])).toBe(true);
    expect(hasReportedItems([ok, { ...other, nameLooseOnly: 3 }])).toBe(true);
  });
});
