/**
 * C4: nullable `schoolid` on `students` and `schoolusers`, backfilled from the
 * school's name. Like the C1 spec, this drives up()/down() against a mocked
 * QueryInterface: it proves what the migration ASKS MySQL for (column type and
 * collation, index, foreign key, the order and shape of the backfill), not
 * what MySQL then does with it. The real-database proof (up, down, up on a
 * copy of the local database, with awkward rows) is in the PR description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261002090000-add-schoolid-to-students-and-schoolusers");

export {};

type State = {
  hasColumn: Record<string, boolean>;
  hasIndex: Record<string, boolean>;
  hasFk: Record<string, boolean>;
  schoolidType: string;
  schoolidCharset: string;
  schoolidCollation: string;
  schoolnameCollation: string;
  affected: number[]; // successive UPDATE results
};

const TX = { id: "the-transaction" };

const makeState = (over: Partial<State> = {}): State => ({
  hasColumn: {},
  hasIndex: {},
  hasFk: {},
  schoolidType: "varchar(36)",
  schoolidCharset: "utf8mb4",
  schoolidCollation: "utf8mb4_unicode_ci",
  schoolnameCollation: "utf8mb4_unicode_ci",
  affected: [],
  ...over,
});

const makeQueryInterface = (state: State) => {
  const updates: string[] = [];
  const query = jest.fn((sql: string, opts?: { type?: string; replacements?: string[] }) => {
    if (/UPDATE `/.test(sql)) {
      updates.push(sql);
      return Promise.resolve([undefined, state.affected.shift() ?? 0]);
    }
    if (/CHARACTER_SET_NAME AS cs/.test(sql)) {
      // tableOptionsMatchingColumn (non-SELECT call shape: [rows, meta])
      return Promise.resolve([[{ cs: state.schoolidCharset, coll: state.schoolidCollation }]]);
    }
    if (/COLUMN_TYPE AS type/.test(sql)) {
      return Promise.resolve([{ type: state.schoolidType }]);
    }
    if (/COLLATION_NAME AS coll/.test(sql) && opts?.replacements?.[0] === "schools") {
      return Promise.resolve([{ coll: state.schoolnameCollation }]);
    }
    if (/TABLE_CONSTRAINTS/.test(sql)) {
      const table = opts?.replacements?.[0] as string;
      return Promise.resolve(state.hasFk[table] ? [{ name: `fk_${table}_schoolid` }] : []);
    }
    if (/COUNT\(\*\) AS n/.test(sql)) {
      return Promise.resolve([{ n: 0 }]);
    }
    return Promise.resolve([[], undefined]); // ALTER TABLE etc.
  });
  const qi = {
    describeTable: jest.fn((table: string) =>
      Promise.resolve(state.hasColumn[table] ? { schoolid: {} } : {}),
    ),
    showIndex: jest.fn((table: string) =>
      Promise.resolve(
        state.hasIndex[table] ? [{ name: "PRIMARY" }, { name: `${table}_schoolid_idx` }] : [{ name: "PRIMARY" }],
      ),
    ),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    sequelize: {
      query,
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)),
    },
  };
  return { qi, query, updates };
};

const statements = (query: jest.Mock): string[] => query.mock.calls.map((c) => String(c[0]));
const alters = (query: jest.Mock): string[] => statements(query).filter((s) => /^ALTER TABLE/.test(s));

describe("20261002090000 up()", () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it("adds a nullable schoolid to both tables, typed and collated like the REAL schools.schoolid", async () => {
    const { qi, query } = makeQueryInterface(
      makeState({ schoolidType: "varchar(40)", schoolidCollation: "utf8mb4_0900_ai_ci" }),
    );
    await migration.up(qi);

    const adds = alters(query).filter((s) => /ADD COLUMN/.test(s));
    expect(adds).toHaveLength(2);
    for (const table of ["students", "schoolusers"]) {
      const sql = adds.find((s) => s.includes(`\`${table}\``))!;
      expect(sql).toContain(
        "ADD COLUMN `schoolid` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL",
      );
    }
  });

  it("adds an index and a foreign key to schools.schoolid, RESTRICT on delete", async () => {
    const { qi, query } = makeQueryInterface(makeState());
    await migration.up(qi);

    expect(qi.addIndex).toHaveBeenCalledWith(
      "students",
      ["schoolid"],
      expect.objectContaining({ name: "students_schoolid_idx", transaction: TX }),
    );
    expect(qi.addIndex).toHaveBeenCalledWith(
      "schoolusers",
      ["schoolid"],
      expect.objectContaining({ name: "schoolusers_schoolid_idx", transaction: TX }),
    );
    const fks = alters(query).filter((s) => /ADD CONSTRAINT/.test(s));
    expect(fks).toHaveLength(2);
    for (const sql of fks) {
      expect(sql).toMatch(/FOREIGN KEY \(`schoolid`\) REFERENCES `schools` \(`schoolid`\)/);
      expect(sql).toMatch(/ON DELETE RESTRICT/);
      expect(sql).not.toMatch(/ON DELETE (CASCADE|SET NULL)/);
    }
  });

  it("builds the structure of both tables before it backfills anything", async () => {
    const { qi, query } = makeQueryInterface(makeState());
    await migration.up(qi);

    const all = statements(query);
    const lastDdl = Math.max(...all.map((s, i) => (/^ALTER TABLE/.test(s) ? i : -1)));
    const firstUpdate = all.findIndex((s) => /UPDATE `/.test(s));
    expect(firstUpdate).toBeGreaterThan(lastDdl);
  });

  it("matches the EXACT text first (binary), only fills NULLs, and only when exactly one school has that text", async () => {
    const { qi, updates } = makeQueryInterface(makeState());
    await migration.up(qi);

    // two tables x (exact pass, loose pass)
    expect(updates).toHaveLength(4);
    const exact = updates[0];
    expect(exact).toMatch(/^UPDATE `students`/);
    expect(exact).toMatch(/CAST\(t\.schoolname AS BINARY\) = CAST\(s\.schoolname AS BINARY\)/);
    expect(exact).toMatch(/GROUP BY CAST\(schoolname AS BINARY\)\s+HAVING COUNT\(\*\) = 1/);
    expect(exact).toMatch(/WHERE t\.schoolid IS NULL AND t\.schoolname IS NOT NULL/);
    // The exact pass must not use the column collation to decide.
    expect(exact).not.toMatch(/COLLATE/);
  });

  it("then fills loose matches ONLY when exactly one school matches, under the school column's own collation", async () => {
    const { qi, updates } = makeQueryInterface(makeState({ schoolnameCollation: "utf8mb4_0900_as_ci" }));
    await migration.up(qi);

    const loose = updates[1];
    expect(loose).toMatch(/^UPDATE `students`/);
    expect(loose).toMatch(/t2\.schoolname = s\.schoolname COLLATE utf8mb4_0900_as_ci/);
    expect(loose).toMatch(/HAVING COUNT\(\*\) = 1/);
    expect(loose).toMatch(/t2\.schoolid IS NULL/);
    expect(loose).toMatch(/WHERE t\.schoolid IS NULL/);
    // Keyed on the table's own primary key
    expect(loose).toMatch(/t2\.`studentid`/);
    expect(updates[3]).toMatch(/t2\.`schooluserid`/);
    // Names are never rewritten.
    for (const sql of updates) {
      expect(sql).not.toMatch(/SET t\.schoolname/);
    }
  });

  it("includes soft-deleted schools in the match (the id is identity, not liveness)", async () => {
    const { qi, updates } = makeQueryInterface(makeState());
    await migration.up(qi);
    for (const sql of updates) {
      expect(sql).not.toMatch(/isdeleted|deleted_at/);
    }
  });

  it("prints counts only, never a school name", async () => {
    const { qi } = makeQueryInterface(makeState({ affected: [20, 0, 18, 2] }));
    await migration.up(qi);

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "C4 students: rows=0 filled_exact=20 filled_loose_only=0 left_null_no_name=0 left_null_ambiguous=0 left_null_no_match=0",
    );
    expect(lines[1]).toBe(
      "C4 schoolusers: rows=0 filled_exact=18 filled_loose_only=2 left_null_no_name=0 left_null_ambiguous=0 left_null_no_match=0",
    );
  });

  it("is idempotent: with the column, index and foreign key already there it only backfills NULLs", async () => {
    const { qi, query } = makeQueryInterface(
      makeState({
        hasColumn: { students: true, schoolusers: true },
        hasIndex: { students: true, schoolusers: true },
        hasFk: { students: true, schoolusers: true },
      }),
    );
    await migration.up(qi);

    expect(alters(query)).toHaveLength(0);
    expect(qi.addIndex).not.toHaveBeenCalled();
    expect(statements(query).filter((s) => /UPDATE `/.test(s))).toHaveLength(4);
  });

  it("completes a half-applied run: only the missing pieces are added", async () => {
    const { qi, query } = makeQueryInterface(
      makeState({
        hasColumn: { students: true, schoolusers: true },
        hasIndex: { students: true, schoolusers: false },
        hasFk: { students: false, schoolusers: false },
      }),
    );
    await migration.up(qi);

    expect(alters(query).filter((s) => /ADD COLUMN/.test(s))).toHaveLength(0);
    expect(qi.addIndex).toHaveBeenCalledTimes(1);
    expect(qi.addIndex).toHaveBeenCalledWith("schoolusers", ["schoolid"], expect.anything());
    expect(alters(query).filter((s) => /ADD CONSTRAINT/.test(s))).toHaveLength(2);
  });

  it("refuses a column type or collation that is not a plain identifier (they are interpolated into DDL)", async () => {
    await expect(
      migration.up(makeQueryInterface(makeState({ schoolidType: "varchar(36); DROP TABLE x" })).qi),
    ).rejects.toThrow(/Unexpected type/);
    await expect(
      migration.up(makeQueryInterface(makeState({ schoolnameCollation: "x; DROP TABLE y" })).qi),
    ).rejects.toThrow(/Unexpected identifier/);
  });
});

describe("20261002090000 down()", () => {
  it("drops the foreign key, then its index, then the column, on both tables", async () => {
    const { qi, query } = makeQueryInterface(
      makeState({
        hasColumn: { students: true, schoolusers: true },
        hasIndex: { students: true, schoolusers: true },
        hasFk: { students: true, schoolusers: true },
      }),
    );
    await migration.down(qi);

    const drops = alters(query);
    expect(drops).toEqual([
      "ALTER TABLE `students` DROP FOREIGN KEY `fk_students_schoolid`",
      "ALTER TABLE `schoolusers` DROP FOREIGN KEY `fk_schoolusers_schoolid`",
    ]);
    expect(qi.removeIndex).toHaveBeenCalledWith("students", "students_schoolid_idx", { transaction: TX });
    expect(qi.removeIndex).toHaveBeenCalledWith("schoolusers", "schoolusers_schoolid_idx", { transaction: TX });
    expect(qi.removeColumn).toHaveBeenCalledWith("students", "schoolid", { transaction: TX });
    expect(qi.removeColumn).toHaveBeenCalledWith("schoolusers", "schoolid", { transaction: TX });

    // Per table: FK before index before column.
    const fkOrder = query.mock.invocationCallOrder[
      query.mock.calls.findIndex((c) => /DROP FOREIGN KEY `fk_students_schoolid`/.test(String(c[0])))
    ];
    expect(fkOrder).toBeLessThan(qi.removeIndex.mock.invocationCallOrder[0]);
    expect(qi.removeIndex.mock.invocationCallOrder[0]).toBeLessThan(qi.removeColumn.mock.invocationCallOrder[0]);
  });

  it("is safe to run again (nothing there, nothing dropped) and after a half-applied up()", async () => {
    const none = makeQueryInterface(makeState());
    await migration.down(none.qi);
    expect(alters(none.query)).toHaveLength(0);
    expect(none.qi.removeIndex).not.toHaveBeenCalled();
    expect(none.qi.removeColumn).not.toHaveBeenCalled();

    // column and index but no foreign key (up() stopped before it)
    const half = makeQueryInterface(
      makeState({
        hasColumn: { students: true, schoolusers: true },
        hasIndex: { students: true, schoolusers: true },
      }),
    );
    await migration.down(half.qi);
    expect(alters(half.query)).toHaveLength(0);
    expect(half.qi.removeIndex).toHaveBeenCalledTimes(2);
    expect(half.qi.removeColumn).toHaveBeenCalledTimes(2);
  });
});
