/**
 * A4 step 1: the permission `publish_curriculum`, granted to Super Admin IN THE SAME MIGRATION (the superadmin wildcard
 * is earned by holding as many distinct permissions as there are rows in `permissions`), to Organisation Admin
 * (decision 3) and to Admin. Mocked QueryInterface, as for 20261001120100: this proves what the migration asks for and
 * in which transaction. The real-database proof (194 = 194 before, 195 = 195 after, down and up again) is in the change
 * description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261027120100-seed-publish-curriculum-permission");

const NAME = "publish_curriculum";
const SUPER_ADMIN = "Mapyr2Pw";
const ORGANISATION_ADMIN = "unb3Fy8p";
const ADMIN = "zr5ER4QD";
const TX = { id: "the-transaction" };

type Opts = {
  titleId?: string;
  exists?: boolean;
  /** Distinct permissions each role holds when asked, in the order asked: Super Admin before and after, then each of the two others after. */
  held?: Record<string, number[]>;
  /** The number of rows in `permissions` each time it is asked: before, then after Super Admin, then after each of the two others. */
  totals?: number[];
};

const makeQueryInterface = (o: Opts = {}) => {
  const held = o.held ?? { [SUPER_ADMIN]: [194, 195], [ORGANISATION_ADMIN]: [155], [ADMIN]: [160] };
  const totals = [...(o.totals ?? [194, 195, 195, 195])];
  const asked: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = jest.fn((sql: string, opts?: any) => {
    if (/SELECT COUNT\(\*\) AS n FROM `permissions`/.test(sql)) {
      return Promise.resolve([[{ n: totals.length > 1 ? totals.shift() : totals[0] }]]);
    }
    if (/COUNT\(DISTINCT rp/.test(sql)) {
      const role = opts.replacements.roleid as string;
      const i = asked[role] ?? 0;
      asked[role] = i + 1;
      return Promise.resolve([[{ n: held[role][Math.min(i, held[role].length - 1)] }]]);
    }
    if (/FROM `permissionstitle` WHERE `permissiontitle`/.test(sql)) {
      return Promise.resolve([o.titleId ? [{ permissiontitleid: o.titleId }] : []]);
    }
    if (/SELECT `permissionname` FROM `permissions`/.test(sql)) {
      return Promise.resolve([o.exists ? [{ permissionname: NAME }] : []]);
    }
    return Promise.resolve([[], undefined]);
  });
  return {
    bulkInsert: jest.fn().mockResolvedValue(undefined),
    sequelize: { query, transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)) },
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sqlCalls = (qi: ReturnType<typeof makeQueryInterface>) => qi.sequelize.query.mock.calls as unknown as Array<[string, { replacements?: any; transaction?: unknown }]>;

describe("20261027120100-seed-publish-curriculum-permission up()", () => {
  it("creates exactly the one permission, under the existing Curriculum title", async () => {
    const qi = makeQueryInterface({ titleId: "curriculum-title" });
    await migration.up(qi);
    expect(qi.bulkInsert.mock.calls.find((c) => c[0] === "permissionstitle")).toBeUndefined();
    const insert = qi.bulkInsert.mock.calls.find((c) => c[0] === "permissions")!;
    expect(insert[1]).toHaveLength(1);
    expect(insert[1][0]).toMatchObject({ permissionname: NAME, permissiondesc: "Publish Curriculum", permissiontitleid: "curriculum-title", type: 0 });
  });

  it("creates the Curriculum title when a database has none", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const title = qi.bulkInsert.mock.calls.find((c) => c[0] === "permissionstitle")!;
    expect(title[1][0]).toMatchObject({ permissiontitle: "Curriculum", type: 1, parentid: null });
    expect(qi.bulkInsert.mock.calls.find((c) => c[0] === "permissions")![1][0].permissiontitleid).toBe(title[1][0].permissiontitleid);
  });

  it("grants it to Super Admin, Organisation Admin and Admin, in the same transaction as the row, and to no other role", async () => {
    const qi = makeQueryInterface({ titleId: "t" });
    await migration.up(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    for (const c of qi.bulkInsert.mock.calls) expect(c[2]).toEqual({ transaction: TX });
    const grants = sqlCalls(qi).filter(([sql]) => /INSERT INTO `roles_permissions`/.test(sql));
    expect(grants.map(([, o]) => o.replacements.roleid)).toEqual([SUPER_ADMIN, ORGANISATION_ADMIN, ADMIN]);
    for (const [sql, o] of grants) {
      expect(o.transaction).toBe(TX);
      expect(o.replacements.name).toBe(NAME);
      // the one named permission, and never twice
      expect(sql).toMatch(/p\.`permissionname` = :name/);
      expect(sql).toMatch(/NOT EXISTS/);
    }
  });

  it("is idempotent: inserts no permission row when it exists, but still ensures the grants", async () => {
    const qi = makeQueryInterface({ titleId: "t", exists: true });
    await migration.up(qi);
    expect(qi.bulkInsert).not.toHaveBeenCalled();
    expect(sqlCalls(qi).filter(([sql]) => /INSERT INTO `roles_permissions`/.test(sql))).toHaveLength(3);
  });

  it("refuses to commit if Super Admin held every permission before and would not after (the wildcard guard)", async () => {
    const qi = makeQueryInterface({ titleId: "t", held: { [SUPER_ADMIN]: [194, 194], [ORGANISATION_ADMIN]: [155], [ADMIN]: [160] } });
    await expect(migration.up(qi)).rejects.toThrow(/lose the superadmin wildcard/);
  });

  it("does not second-guess an operator who had already trimmed Super Admin", async () => {
    const qi = makeQueryInterface({ titleId: "t", held: { [SUPER_ADMIN]: [180, 181], [ORGANISATION_ADMIN]: [155], [ADMIN]: [160] } });
    await expect(migration.up(qi)).resolves.toBeUndefined();
  });

  it.each([ORGANISATION_ADMIN, ADMIN])("refuses to commit if the role %s would reach the wildcard", async (role) => {
    const held: Record<string, number[]> = { [SUPER_ADMIN]: [194, 195], [ORGANISATION_ADMIN]: [155], [ADMIN]: [160] };
    held[role] = [195];
    const qi = makeQueryInterface({ titleId: "t", held });
    await expect(migration.up(qi)).rejects.toThrow(/superadmin wildcard/);
  });
});

describe("20261027120100-seed-publish-curriculum-permission down()", () => {
  it("removes the grants (from every role), then the row, then the title if nothing else uses it, in one transaction and in that order", async () => {
    const qi = makeQueryInterface();
    await migration.down(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    const statements = sqlCalls(qi).map(([sql]) => sql);
    const iGrants = statements.findIndex((s) => /DELETE rp FROM `roles_permissions`/.test(s));
    const iRow = statements.findIndex((s) => /DELETE FROM `permissions`/.test(s));
    const iTitle = statements.findIndex((s) => /DELETE t FROM `permissionstitle`/.test(s));
    expect(iGrants).toBeGreaterThanOrEqual(0);
    expect(iRow).toBeGreaterThan(iGrants);
    expect(iTitle).toBeGreaterThan(iRow);
    expect(statements[iTitle]).toMatch(/NOT EXISTS/);
    for (const [sql, o] of sqlCalls(qi)) {
      expect(o.transaction).toBe(TX);
      if (/DELETE rp|DELETE FROM `permissions`/.test(sql)) {
        expect(o.replacements.name).toBe(NAME);
        expect(sql).toMatch(/= :name/);
      }
    }
  });
});

// Makes this file a module, so its top-level names are not shared with other
// spec files when ts-jest type-checks them in the same worker.
export {};
