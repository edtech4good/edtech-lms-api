/**
 * C3 of the multi-organisation model: nullable `organisationid` on `schools`
 * and `lmsusers` (index + foreign key to `organisations`, ON DELETE RESTRICT)
 * and a UNIQUE index on `lmsusers.lmsusername`, guarded against duplicates.
 *
 * Like the C1 spec, this drives up()/down() against a mocked QueryInterface:
 * it proves what the migration ASKS MySQL for (column definition and
 * collation, indexes, constraints, the order of steps, the guard), not what
 * MySQL then does. The real-database proof (columns, indexes and foreign keys
 * read back from information_schema; up, down, up; the duplicate guard against
 * real duplicate rows) is in the PR description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261001120200-add-organisationid-to-schools-and-lmsusers");

/** An index as the real Sequelize MySQL `showIndex` returns it (verified against MySQL 8): one row per index. */
type IndexRow = { name: string; unique?: boolean; fields?: Array<{ attribute: string }> };

const idx = (name: string, unique: boolean, ...columns: string[]): IndexRow => ({
  name,
  unique,
  fields: columns.map((attribute) => ({ attribute })),
});

type MockQI = {
  describeTable: jest.Mock;
  showIndex: jest.Mock;
  addIndex: jest.Mock;
  removeIndex: jest.Mock;
  addColumn: jest.Mock;
  removeColumn: jest.Mock;
  sequelize: { query: jest.Mock; transaction: jest.Mock };
};

const TX = { id: "the-transaction" };

type State = {
  /** How many usernames occur more than once. */
  duplicates?: number;
  /** `organisationid` collation reported for organisations.organisationid. */
  charset?: string;
  collate?: string;
  /** Tables that already have the column. */
  hasColumn?: string[];
  /** Existing indexes per table. */
  indexes?: Record<string, IndexRow[]>;
  /** Existing foreign-key constraint names (`table.constraint`). */
  constraints?: string[];
};

const makeQueryInterface = (state: State = {}): MockQI => {
  const hasColumn = new Set(state.hasColumn ?? []);
  const indexes = state.indexes ?? {};
  const constraints = new Set(state.constraints ?? []);
  const qi: MockQI = {
    describeTable: jest.fn((table: string) =>
      Promise.resolve(hasColumn.has(table) ? { organisationid: {} } : {}),
    ),
    showIndex: jest.fn((table: string) =>
      Promise.resolve([idx("PRIMARY", true, "x"), ...(indexes[table] ?? [])]),
    ),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined),
    addColumn: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    sequelize: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: jest.fn((sql: string, opts?: any) => {
        if (/GROUP BY/.test(sql)) {
          return Promise.resolve([[{ n: state.duplicates ?? 0 }], undefined]);
        }
        if (/TABLE_CONSTRAINTS/.test(sql)) {
          const [table, constraint] = opts.replacements;
          return Promise.resolve([constraints.has(`${table}.${constraint}`) ? [{ name: constraint }] : [], undefined]);
        }
        if (/INFORMATION_SCHEMA/.test(sql)) {
          return Promise.resolve([
            [{ cs: state.charset ?? "utf8mb4", coll: state.collate ?? "utf8mb4_unicode_ci" }],
          ]);
        }
        return Promise.resolve([[], undefined]);
      }),
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)),
    },
  };
  return qi;
};

const statements = (qi: MockQI) => qi.sequelize.query.mock.calls.map((c) => c[0] as string);
const ddl = (qi: MockQI) => statements(qi).filter((s) => /^\s*ALTER TABLE/.test(s));

describe("20261001120200 up(): the duplicate-username guard", () => {
  it("throws, giving the number of duplicate groups (and no email address), and runs NO DDL at all", async () => {
    const qi = makeQueryInterface({ duplicates: 2 });
    const error = await migration.up(qi).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("2 username(s) occur more than once");
    // Disabling does not help: the index counts every row.
    expect(error.message).toMatch(/renamed or deleted/);
    expect(error.message).not.toMatch(/disable or rename/);
    expect(error.message).not.toMatch(/@/);
    expect(ddl(qi)).toEqual([]);
    expect(qi.addIndex).not.toHaveBeenCalled();
    expect(qi.addColumn).not.toHaveBeenCalled();
    // It did not even look at the tables: the guard is the first thing it does.
    expect(qi.describeTable).not.toHaveBeenCalled();
  });

  it("reads no username out of the table to do it: it counts groups", async () => {
    const qi = makeQueryInterface({ duplicates: 1 });
    await migration.up(qi).catch(() => undefined);
    const sql = qi.sequelize.query.mock.calls[0][0] as string;
    expect(sql).toMatch(/SELECT COUNT\(\*\) AS n FROM/);
    expect(sql).not.toMatch(/SELECT `lmsusername`/);
  });

  it("looks for duplicates by grouping lmsusername inside the transaction (the same collation as the index)", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const call = qi.sequelize.query.mock.calls.find((c) => /GROUP BY/.test(c[0]))!;
    expect(call[0]).toMatch(/FROM `lmsusers`/);
    expect(call[0]).toMatch(/GROUP BY `lmsusername`/);
    expect(call[0]).toMatch(/HAVING COUNT\(\*\) > 1/);
    expect(call[1]).toEqual({ transaction: TX });
    // And it is the first query that runs.
    expect(qi.sequelize.query.mock.calls[0][0]).toMatch(/GROUP BY/);
  });
});

describe("20261001120200 up()", () => {
  it("adds a NULLABLE organisationid to schools and to lmsusers, with the collation of organisations.organisationid", async () => {
    const qi = makeQueryInterface({ charset: "utf8mb4", collate: "utf8mb4_0900_ai_ci" });
    await migration.up(qi);

    for (const table of ["schools", "lmsusers"]) {
      const sql = ddl(qi).find((s) => s.startsWith(`ALTER TABLE \`${table}\` ADD COLUMN`))!;
      expect(sql).toBe(
        `ALTER TABLE \`${table}\` ADD COLUMN \`organisationid\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL`,
      );
    }
    // The collation is read from the real organisations.organisationid column.
    const read = qi.sequelize.query.mock.calls.find(
      (c) => /INFORMATION_SCHEMA\.COLUMNS/.test(c[0]),
    )!;
    expect(read[1].replacements).toEqual(["organisations", "organisationid"]);
  });

  it("follows whatever collation the database reports (not a constant)", async () => {
    const qi = makeQueryInterface({ collate: "utf8mb4_unicode_ci" });
    await migration.up(qi);
    expect(ddl(qi).filter((s) => /ADD COLUMN/.test(s)).every((s) => /COLLATE utf8mb4_unicode_ci NULL$/.test(s))).toBe(true);
  });

  it("refuses a charset or collation name that is not a plain identifier, before any DDL", async () => {
    const qi = makeQueryInterface({ collate: "utf8mb4_unicode_ci; DROP TABLE x" });
    await expect(migration.up(qi)).rejects.toThrow(/Unexpected charset\/collation/);
    expect(ddl(qi)).toEqual([]);
    expect(qi.addIndex).not.toHaveBeenCalled();
  });

  it("adds an index on organisationid to each table", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.addIndex).toHaveBeenCalledWith(
      "schools",
      ["organisationid"],
      expect.objectContaining({ name: "schools_organisationid_idx", transaction: TX }),
    );
    expect(qi.addIndex).toHaveBeenCalledWith(
      "lmsusers",
      ["organisationid"],
      expect.objectContaining({ name: "lmsusers_organisationid_idx", transaction: TX }),
    );
    for (const [, , opts] of qi.addIndex.mock.calls.filter((c) => c[1][0] === "organisationid")) {
      expect((opts as { unique?: boolean }).unique).toBeFalsy();
    }
  });

  it("adds a foreign key to organisations.organisationid with ON DELETE RESTRICT on each table", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    for (const [table, name] of [
      ["schools", "schools_organisationid_fk"],
      ["lmsusers", "lmsusers_organisationid_fk"],
    ]) {
      const sql = ddl(qi).find((s) => s.includes(`ADD CONSTRAINT \`${name}\``))!;
      expect(sql).toContain(`ALTER TABLE \`${table}\``);
      expect(sql).toContain("FOREIGN KEY (`organisationid`) REFERENCES `organisations` (`organisationid`)");
      expect(sql).toContain("ON DELETE RESTRICT");
      expect(sql).not.toContain("ON DELETE CASCADE");
      expect(sql).not.toContain("SET NULL");
    }
  });

  it("per table: the column first, then the index, then the foreign key that needs both", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const events: string[] = [];
    const calls = [
      ...qi.sequelize.query.mock.calls.map((c, i) => ({ o: qi.sequelize.query.mock.invocationCallOrder[i], what: String(c[0]) })),
      ...qi.addIndex.mock.calls.map((c, i) => ({ o: qi.addIndex.mock.invocationCallOrder[i], what: `index:${c[0]}:${c[1][0]}` })),
    ].sort((a, b) => a.o - b.o);
    for (const c of calls) {
      if (/ADD COLUMN `organisationid`/.test(c.what)) events.push(`col:${/`(schools|lmsusers)`/.exec(c.what)![1]}`);
      else if (/ADD CONSTRAINT/.test(c.what)) events.push(`fk:${/`(schools|lmsusers)`/.exec(c.what)![1]}`);
      else if (c.what.startsWith("index:") && c.what.endsWith("organisationid")) events.push(`idx:${c.what.split(":")[1]}`);
    }
    expect(events).toEqual(["col:schools", "idx:schools", "fk:schools", "col:lmsusers", "idx:lmsusers", "fk:lmsusers"]);
  });

  it("adds a UNIQUE index on lmsusers.lmsusername", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.addIndex).toHaveBeenCalledWith(
      "lmsusers",
      ["lmsusername"],
      expect.objectContaining({ name: "lmsusers_lmsusername_unique", unique: true, transaction: TX }),
    );
  });

  it("builds the unique index only after the guard has passed", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const guard = qi.sequelize.query.mock.invocationCallOrder[0];
    const unique = qi.addIndex.mock.invocationCallOrder[
      qi.addIndex.mock.calls.findIndex((c) => c[1][0] === "lmsusername")
    ];
    expect(guard).toBeLessThan(unique);
  });

  it("runs inside ONE transaction and hands it to every DDL call", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    for (const c of qi.addIndex.mock.calls) expect(c[2].transaction).toBe(TX);
    for (const c of qi.sequelize.query.mock.calls.filter((c) => /^\s*ALTER TABLE/.test(c[0]))) {
      expect(c[1]).toEqual({ transaction: TX });
    }
  });

  it("changes nothing else: no other table, no other column", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const touched = ddl(qi).map((s) => /ALTER TABLE `(\w+)`/.exec(s)![1]);
    expect(new Set(touched)).toEqual(new Set(["schools", "lmsusers"]));
    expect(ddl(qi)).toHaveLength(4); // two columns, two foreign keys
    expect(qi.addIndex).toHaveBeenCalledTimes(3);
  });

  it("does nothing on a re-run when columns, indexes and constraints all exist (idempotent)", async () => {
    const qi = makeQueryInterface({
      hasColumn: ["schools", "lmsusers"],
      indexes: {
        schools: [idx("schools_organisationid_idx", false, "organisationid")],
        lmsusers: [
          idx("lmsusers_organisationid_idx", false, "organisationid"),
          idx("lmsusers_lmsusername_unique", true, "lmsusername"),
        ],
      },
      constraints: ["schools.schools_organisationid_fk", "lmsusers.lmsusers_organisationid_fk"],
    });
    await migration.up(qi);
    expect(ddl(qi)).toEqual([]);
    expect(qi.addIndex).not.toHaveBeenCalled();
  });

  it("completes a half-applied run: lmsusers column exists but its index, foreign key and the unique index do not", async () => {
    const qi = makeQueryInterface({
      hasColumn: ["schools", "lmsusers"],
      indexes: { schools: [idx("schools_organisationid_idx", false, "organisationid")] },
      constraints: ["schools.schools_organisationid_fk"],
    });
    await migration.up(qi);
    expect(ddl(qi).filter((s) => /ADD COLUMN/.test(s))).toEqual([]);
    expect(ddl(qi).filter((s) => /ADD CONSTRAINT/.test(s))).toHaveLength(1);
    expect(qi.addIndex.mock.calls.map((c) => c[2].name)).toEqual([
      "lmsusers_organisationid_idx",
      "lmsusers_lmsusername_unique",
    ]);
  });

  it("does not add a second unique index when one already covers exactly lmsusername under another name", async () => {
    const qi = makeQueryInterface({
      indexes: { lmsusers: [idx("lmsusername", true, "lmsusername")] },
    });
    await migration.up(qi);
    expect(qi.addIndex.mock.calls.some((c) => c[1][0] === "lmsusername")).toBe(false);
  });

  it("does not mistake a unique index that merely CONTAINS lmsusername for one that covers it", async () => {
    const qi = makeQueryInterface({
      indexes: {
        lmsusers: [
          idx("composite", true, "lmsusername", "isverified"),
        ],
      },
    });
    await migration.up(qi);
    expect(qi.addIndex.mock.calls.some((c) => c[1][0] === "lmsusername")).toBe(true);
  });
});

describe("20261001120200 down()", () => {
  const applied = (): MockQI =>
    makeQueryInterface({
      hasColumn: ["schools", "lmsusers"],
      indexes: {
        schools: [idx("schools_organisationid_idx", false, "organisationid")],
        lmsusers: [
          idx("lmsusers_organisationid_idx", false, "organisationid"),
          idx("lmsusers_lmsusername_unique", true, "lmsusername"),
        ],
      },
      constraints: ["schools.schools_organisationid_fk", "lmsusers.lmsusers_organisationid_fk"],
    });

  it("removes the unique index, then per table the foreign key, the index and the column, in a transaction", async () => {
    const qi = applied();
    await migration.down(qi);

    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    const order: string[] = [];
    const log = (what: string, o: number) => order.push(`${o}:${what}`);
    qi.removeIndex.mock.calls.forEach((c, i) => log(`index:${c[1]}`, qi.removeIndex.mock.invocationCallOrder[i]));
    qi.sequelize.query.mock.calls.forEach((c, i) => {
      if (/DROP FOREIGN KEY/.test(c[0])) log(`fk:${/DROP FOREIGN KEY `(\w+)`/.exec(c[0])![1]}`, qi.sequelize.query.mock.invocationCallOrder[i]);
    });
    qi.removeColumn.mock.calls.forEach((c, i) => log(`col:${c[0]}`, qi.removeColumn.mock.invocationCallOrder[i]));
    expect(order.sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0])).map((e) => e.slice(e.indexOf(":") + 1))).toEqual([
      "index:lmsusers_lmsusername_unique",
      "fk:lmsusers_organisationid_fk",
      "index:lmsusers_organisationid_idx",
      "col:lmsusers",
      "fk:schools_organisationid_fk",
      "index:schools_organisationid_idx",
      "col:schools",
    ]);
    for (const c of qi.removeIndex.mock.calls) expect(c[2]).toEqual({ transaction: TX });
    for (const c of qi.removeColumn.mock.calls) expect(c[2]).toEqual({ transaction: TX });
  });

  it("is safe to run when nothing was applied: touches nothing", async () => {
    const qi = makeQueryInterface();
    await migration.down(qi);
    expect(qi.removeIndex).not.toHaveBeenCalled();
    expect(qi.removeColumn).not.toHaveBeenCalled();
    expect(ddl(qi)).toEqual([]);
  });

  it("is safe when a table is missing altogether", async () => {
    const qi = makeQueryInterface();
    qi.describeTable.mockRejectedValue(new Error("no such table"));
    await expect(migration.down(qi)).resolves.toBeUndefined();
    expect(qi.removeColumn).not.toHaveBeenCalled();
  });

  it("drops nothing else", async () => {
    const qi = applied();
    await migration.down(qi);
    expect(qi.removeColumn.mock.calls.map((c) => `${c[0]}.${c[1]}`).sort()).toEqual([
      "lmsusers.organisationid",
      "schools.organisationid",
    ]);
    expect(qi.removeIndex).toHaveBeenCalledTimes(3);
  });
});

// Makes this file a module, so its top-level names are not shared with other
// spec files when ts-jest type-checks them in the same worker.
export {};
