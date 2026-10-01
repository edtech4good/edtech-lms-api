/**
 * C2: the four organisation permissions, granted to Super Admin IN THE SAME
 * MIGRATION. The superadmin wildcard is earned by holding as many distinct
 * permissions as there are rows in `permissions`; four new rows that are not
 * granted would silently strip it from every Super Admin
 * (docs/authorization-model.md). Mocked QueryInterface, as for C1: this proves
 * what the migration asks for and in which transaction. The real-database
 * proof (190 = 190 before, 194 = 194 after, down and up again) is in the PR
 * description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261001120100-seed-organisation-permissions");

const NAMES = [
  "view_organisation",
  "create_organisation",
  "update_organisation",
  "delete_organisation",
];
const SUPER_ADMIN = "Mapyr2Pw";
const TX = { id: "the-transaction" };

type Opts = {
  /** Existing "Organisation" title row id, if any. */
  titleId?: string;
  /** Permission names that already exist. */
  existing?: string[];
  /** [permissions, held] BEFORE, then AFTER, the migration. */
  counts?: [[number, number], [number, number]];
};

const makeQueryInterface = (o: Opts = {}) => {
  const counts = o.counts ?? [
    [190, 190],
    [194, 194],
  ];
  let countRound = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = jest.fn((sql: string, _opts?: any) => {
    if (/SELECT COUNT\(\*\) AS n FROM `permissions`/.test(sql)) {
      return Promise.resolve([[{ n: counts[Math.min(countRound, 1)][0] }]]);
    }
    if (/COUNT\(DISTINCT rp/.test(sql)) {
      const held = counts[Math.min(countRound, 1)][1];
      countRound += 1;
      return Promise.resolve([[{ n: held }]]);
    }
    if (/FROM `permissionstitle` WHERE `permissiontitle`/.test(sql)) {
      return Promise.resolve([o.titleId ? [{ permissiontitleid: o.titleId }] : []]);
    }
    if (/SELECT `permissionname` FROM `permissions`/.test(sql)) {
      return Promise.resolve([(o.existing ?? []).map((permissionname) => ({ permissionname }))]);
    }
    return Promise.resolve([[], undefined]);
  });
  return {
    bulkInsert: jest.fn().mockResolvedValue(undefined),
    sequelize: {
      query,
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)),
    },
  };
};

const sqlCalls = (qi: ReturnType<typeof makeQueryInterface>) =>
  qi.sequelize.query.mock.calls as unknown as Array<
    [string, { replacements?: any; transaction?: unknown }]
  >;

describe("20261001120100-seed-organisation-permissions up()", () => {
  it("creates exactly the four organisation permissions, under one new 'Organisation' title", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);

    const titleInsert = qi.bulkInsert.mock.calls.find((c) => c[0] === "permissionstitle")!;
    expect(titleInsert[1]).toHaveLength(1);
    expect(titleInsert[1][0]).toMatchObject({ permissiontitle: "Organisation", type: 1, parentid: null });

    const permInsert = qi.bulkInsert.mock.calls.find((c) => c[0] === "permissions")!;
    expect(permInsert[1].map((p: any) => p.permissionname).sort()).toEqual([...NAMES].sort());
    for (const p of permInsert[1]) {
      expect(p.permissiontitleid).toBe(titleInsert[1][0].permissiontitleid);
      expect(p.type).toBe(0);
      expect(p.permissiondesc).toMatch(/^(View|Create|Update|Delete) Organisation$/);
    }
  });

  it("GRANTS them to Super Admin in the same transaction as the rows (the wildcard is earned by count)", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);

    // One transaction for everything.
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    for (const c of qi.bulkInsert.mock.calls) expect(c[2]).toEqual({ transaction: TX });

    const grants = sqlCalls(qi).filter(([sql]) => /INSERT INTO `roles_permissions`/.test(sql));
    expect(grants).toHaveLength(1);
    const [sql, opts] = grants[0];
    expect(opts.transaction).toBe(TX);
    expect(opts.replacements.roleid).toBe(SUPER_ADMIN);
    expect([...opts.replacements.names].sort()).toEqual([...NAMES].sort());
    // Only the named permissions - never everything - and never twice.
    expect(sql).toMatch(/p\.`permissionname` IN \(:names\)/);
    expect(sql).toMatch(/NOT EXISTS/);
  });

  it("grants to Super Admin ONLY: no other role receives an organisation permission", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const grants = sqlCalls(qi).filter(([sql]) => /roles_permissions/.test(sql) && /INSERT/.test(sql));
    for (const [, opts] of grants) expect(opts.replacements.roleid).toBe(SUPER_ADMIN);
  });

  it("is idempotent: reuses an existing title and inserts only the permissions that are missing", async () => {
    const qi = makeQueryInterface({
      titleId: "existing-title",
      existing: ["view_organisation", "create_organisation"],
    });
    await migration.up(qi);

    expect(qi.bulkInsert.mock.calls.find((c) => c[0] === "permissionstitle")).toBeUndefined();
    const permInsert = qi.bulkInsert.mock.calls.find((c) => c[0] === "permissions")!;
    expect(permInsert[1].map((p: any) => p.permissionname).sort()).toEqual([
      "delete_organisation",
      "update_organisation",
    ]);
    expect(permInsert[1][0].permissiontitleid).toBe("existing-title");
  });

  it("inserts no permission rows at all when all four already exist (but still ensures the grants)", async () => {
    const qi = makeQueryInterface({ titleId: "t", existing: NAMES });
    await migration.up(qi);
    expect(qi.bulkInsert).not.toHaveBeenCalled();
    expect(sqlCalls(qi).some(([sql]) => /INSERT INTO `roles_permissions`/.test(sql))).toBe(true);
  });

  it("refuses to commit if Super Admin held every permission before and would not after (the wildcard guard)", async () => {
    // 190 of 190 before; after, 194 rows exist but only 190 are held.
    const qi = makeQueryInterface({
      counts: [
        [190, 190],
        [194, 190],
      ],
    });
    await expect(migration.up(qi)).rejects.toThrow(/lose the superadmin wildcard/);
  });

  it("does not second-guess an operator who had already trimmed Super Admin (held < total before)", async () => {
    const qi = makeQueryInterface({
      counts: [
        [190, 180],
        [194, 184],
      ],
    });
    await expect(migration.up(qi)).resolves.toBeUndefined();
  });
});

describe("20261001120100-seed-organisation-permissions down()", () => {
  it("removes the grants (from every role), then the rows, then the title, in one transaction and in that order", async () => {
    const qi = makeQueryInterface();
    await migration.down(qi);

    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    const statements = sqlCalls(qi).map(([sql]) => sql);
    const iGrants = statements.findIndex((s) => /DELETE rp FROM `roles_permissions`/.test(s));
    const iRows = statements.findIndex((s) => /DELETE FROM `permissions`/.test(s));
    const iTitle = statements.findIndex((s) => /DELETE t FROM `permissionstitle`/.test(s));
    expect(iGrants).toBeGreaterThanOrEqual(0);
    expect(iRows).toBeGreaterThan(iGrants);
    expect(iTitle).toBeGreaterThan(iRows);

    for (const [sql, opts] of sqlCalls(qi)) {
      expect(opts.transaction).toBe(TX);
      if (/DELETE rp|DELETE FROM `permissions`/.test(sql)) {
        expect([...opts.replacements.names].sort()).toEqual([...NAMES].sort());
        // Names only: never "all grants of a role".
        expect(sql).toMatch(/IN \(:names\)/);
      }
    }
  });

  it("only deletes the title when nothing else uses it", async () => {
    const qi = makeQueryInterface();
    await migration.down(qi);
    const titleDelete = sqlCalls(qi).find(([sql]) => /DELETE t FROM `permissionstitle`/.test(sql))!;
    expect(titleDelete[0]).toMatch(/NOT EXISTS/);
    expect(titleDelete[1].replacements.title).toBe("Organisation");
  });
});
