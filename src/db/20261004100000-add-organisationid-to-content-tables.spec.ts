/**
 * C7: nullable `organisationid` on the six content tables (index + foreign key to
 * `organisations`, ON DELETE RESTRICT). Like the C3 spec this drives up()/down()
 * against a mocked QueryInterface: it proves what the migration ASKS MySQL for;
 * the real up, down, up and the partial-state recovery are run on a real database
 * (see the change description).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261004100000-add-organisationid-to-content-tables");

const TABLES = ["curriculums", "questions", "documents", "questiontags", "documenttags", "subjects"];
const TX = { id: "the-transaction" };

type State = {
  charset?: string;
  collate?: string;
  hasColumn?: string[];
  indexes?: Record<string, string[]>;
  constraints?: string[];
  /** Rows already holding an owner, per table. */
  filled?: Record<string, number>;
};

const makeQI = (state: State = {}) => {
  const hasColumn = new Set(state.hasColumn ?? []);
  const constraints = new Set(state.constraints ?? []);
  const qi = {
    describeTable: jest.fn((table: string) => Promise.resolve(hasColumn.has(table) ? { organisationid: {} } : {})),
    showIndex: jest.fn((table: string) =>
      Promise.resolve([{ name: "PRIMARY" }, ...(state.indexes?.[table] ?? []).map((name) => ({ name }))]),
    ),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined),
    addColumn: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    sequelize: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: jest.fn((sql: string, opts?: any): Promise<unknown> => {
        if (/TABLE_CONSTRAINTS/.test(sql)) {
          const [table, constraint] = opts.replacements;
          return Promise.resolve([constraints.has(`${table}.${constraint}`) ? [{ name: constraint }] : [], undefined]);
        }
        if (/INFORMATION_SCHEMA/.test(sql)) {
          return Promise.resolve([[{ cs: state.charset ?? "utf8mb4", coll: state.collate ?? "utf8mb4_unicode_ci" }]]);
        }
        const count = /SELECT COUNT\(\*\) AS n FROM `(\w+)` WHERE `organisationid` IS NOT NULL/.exec(sql);
        if (count) {
          return Promise.resolve([[{ n: state.filled?.[count[1]] ?? 0 }], undefined]);
        }
        return Promise.resolve([[], undefined]);
      }),
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)),
    },
  };
  return qi;
};

const statements = (qi: ReturnType<typeof makeQI>) => qi.sequelize.query.mock.calls.map((c) => c[0] as string);
const ddl = (qi: ReturnType<typeof makeQI>) => statements(qi).filter((s) => /^\s*ALTER TABLE/.test(s));

describe("C7 up()", () => {
  it("adds a NULLABLE organisationid to exactly the six content tables, with the collation read from organisations.organisationid", async () => {
    const qi = makeQI({ collate: "utf8mb4_0900_ai_ci" });
    await migration.up(qi);
    const adds = ddl(qi).filter((s) => /ADD COLUMN/.test(s));
    expect(adds).toEqual(
      TABLES.map(
        (t) => `ALTER TABLE \`${t}\` ADD COLUMN \`organisationid\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL`,
      ),
    );
    const read = qi.sequelize.query.mock.calls.find((c) => /INFORMATION_SCHEMA\.COLUMNS/.test(c[0]))!;
    expect(read[1].replacements).toEqual(["organisations", "organisationid"]);
  });

  it("refuses a charset or collation name that is not a plain identifier, before any DDL", async () => {
    const qi = makeQI({ collate: "utf8mb4_unicode_ci; DROP TABLE x" });
    await expect(migration.up(qi)).rejects.toThrow(/Unexpected charset\/collation/);
    expect(ddl(qi)).toEqual([]);
  });

  it("adds an index and a RESTRICT foreign key per table, the column first, then the index, then the key", async () => {
    const qi = makeQI();
    await migration.up(qi);
    for (const t of TABLES) {
      expect(qi.addIndex).toHaveBeenCalledWith(t, ["organisationid"], expect.objectContaining({ name: `${t}_organisationid_idx`, transaction: TX }));
      const fk = ddl(qi).find((s) => s.includes(`ADD CONSTRAINT \`${t}_organisationid_fk\``))!;
      expect(fk).toContain(`ALTER TABLE \`${t}\``);
      expect(fk).toContain("FOREIGN KEY (`organisationid`) REFERENCES `organisations` (`organisationid`)");
      expect(fk).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
    }
    const events: string[] = [];
    const calls = [
      ...qi.sequelize.query.mock.calls.map((c, i) => ({ order: qi.sequelize.query.mock.invocationCallOrder[i], text: c[0] as string })),
      ...qi.addIndex.mock.calls.map((c, i) => ({ order: qi.addIndex.mock.invocationCallOrder[i], text: `INDEX ${c[0]}` })),
    ].sort((a, b) => a.order - b.order);
    for (const c of calls) {
      if (/ADD COLUMN `organisationid`/.test(c.text)) events.push(`column ${/ALTER TABLE `(\w+)`/.exec(c.text)![1]}`);
      else if (c.text.startsWith("INDEX ")) events.push(`index ${c.text.slice(6)}`);
      else if (/ADD CONSTRAINT/.test(c.text)) events.push(`fk ${/ALTER TABLE `(\w+)`/.exec(c.text)![1]}`);
    }
    expect(events).toEqual(TABLES.flatMap((t) => [`column ${t}`, `index ${t}`, `fk ${t}`]));
  });

  it("writes no data: no UPDATE, INSERT or DELETE", async () => {
    const qi = makeQI();
    await migration.up(qi);
    expect(statements(qi).filter((s) => /^\s*(UPDATE|INSERT|DELETE)/i.test(s))).toEqual([]);
  });

  it("adds each key in place while the column is empty: foreign_key_checks off for that statement only, restored after, even if the statement fails", async () => {
    const qi = makeQI();
    await migration.up(qi);
    const sql = statements(qi);
    for (const t of TABLES) {
      const i = sql.findIndex((s) => s.includes(`ADD CONSTRAINT \`${t}_organisationid_fk\``));
      expect(sql[i - 1]).toBe("SET foreign_key_checks = 0");
      expect(sql[i + 1]).toBe("SET foreign_key_checks = 1");
    }
    const failing = makeQI();
    const original = failing.sequelize.query.getMockImplementation()!;
    failing.sequelize.query.mockImplementation(((sql: string, o?: unknown) =>
      /ADD CONSTRAINT/.test(sql) ? Promise.reject(new Error("fk failed")) : original(sql, o)) as never);
    await expect(migration.up(failing)).rejects.toThrow("fk failed");
    expect(statements(failing)).toContain("SET foreign_key_checks = 1");
  });

  it("when a re-run finds owners already written, the key is added the normal, validating way (checks stay on)", async () => {
    const qi = makeQI({ hasColumn: ["curriculums"], filled: { curriculums: 2 } });
    await migration.up(qi);
    const sql = statements(qi);
    const i = sql.findIndex((s) => s.includes("`curriculums_organisationid_fk`"));
    expect(sql[i - 1]).not.toBe("SET foreign_key_checks = 0");
  });

  it("is idempotent step by step: what is already there is not added again", async () => {
    const qi = makeQI({
      hasColumn: TABLES,
      indexes: Object.fromEntries(TABLES.map((t) => [t, [`${t}_organisationid_idx`]])),
      constraints: TABLES.map((t) => `${t}.${t}_organisationid_fk`),
    });
    await migration.up(qi);
    expect(ddl(qi)).toEqual([]);
    expect(qi.addIndex).not.toHaveBeenCalled();
  });

  it("recovers from a partial run: a table with the column but no index or key is finished, the finished ones are left alone", async () => {
    const qi = makeQI({
      hasColumn: ["curriculums", "questions"],
      indexes: { curriculums: ["curriculums_organisationid_idx"] },
      constraints: ["curriculums.curriculums_organisationid_fk"],
    });
    await migration.up(qi);
    expect(ddl(qi).filter((s) => /ADD COLUMN/.test(s)).map((s) => /ALTER TABLE `(\w+)`/.exec(s)![1])).toEqual(["documents", "questiontags", "documenttags", "subjects"]);
    expect(qi.addIndex.mock.calls.map((c) => c[0])).toEqual(["questions", "documents", "questiontags", "documenttags", "subjects"]);
    expect(ddl(qi).filter((s) => /ADD CONSTRAINT/.test(s))).toHaveLength(5);
  });

  it("runs in one transaction", async () => {
    const qi = makeQI();
    await migration.up(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("C7 down()", () => {
  it("per table in reverse order: foreign key, then index, then column", async () => {
    const qi = makeQI({
      hasColumn: TABLES,
      indexes: Object.fromEntries(TABLES.map((t) => [t, [`${t}_organisationid_idx`]])),
      constraints: TABLES.map((t) => `${t}.${t}_organisationid_fk`),
    });
    await migration.down(qi);
    expect(ddl(qi).filter((s) => /DROP FOREIGN KEY/.test(s)).map((s) => /ALTER TABLE `(\w+)`/.exec(s)![1])).toEqual([...TABLES].reverse());
    expect(qi.removeIndex.mock.calls.map((c) => c[1])).toEqual([...TABLES].reverse().map((t) => `${t}_organisationid_idx`));
    expect(qi.removeColumn.mock.calls.map((c) => c[0])).toEqual([...TABLES].reverse());
  });

  it("is a no-op for what is not there (a second down, or a half-applied up)", async () => {
    const qi = makeQI();
    await migration.down(qi);
    expect(ddl(qi)).toEqual([]);
    expect(qi.removeIndex).not.toHaveBeenCalled();
    expect(qi.removeColumn).not.toHaveBeenCalled();
  });
});
