/**
 * Certificates slice 1: `list_certificate`, `create_certificate` and `revoke_certificate`, granted to Super Admin IN THE SAME
 * MIGRATION (the superadmin wildcard is earned by holding as many distinct permissions as there are rows), to Organisation
 * Admin and to Admin, and to no other role (Teacher has none). Mocked QueryInterface, as for 20261027120100: this proves what
 * the migration asks for and in which transaction; it was not run on MySQL.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261112120100-seed-certificate-permissions");

const NAMES = ["list_certificate", "create_certificate", "revoke_certificate"];
const SUPER_ADMIN = "Mapyr2Pw";
const ORGANISATION_ADMIN = "unb3Fy8p";
const ADMIN = "zr5ER4QD";
const TEACHER = "Q3Qs7PuD";
const TX = { id: "the-transaction" };

type Opts = { titleId?: string; existing?: string[]; held?: Record<string, number[]>; totals?: number[] };

const makeQueryInterface = (o: Opts = {}) => {
  const held = o.held ?? { [SUPER_ADMIN]: [194, 197], [ORGANISATION_ADMIN]: [155], [ADMIN]: [160] };
  const totals = [...(o.totals ?? [194, 197, 197, 197])];
  const asked: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = jest.fn((sql: string, opts?: any) => {
    if (/SELECT COUNT\(\*\) AS n FROM `permissions`/.test(sql)) return Promise.resolve([[{ n: totals.length > 1 ? totals.shift() : totals[0] }]]);
    if (/COUNT\(DISTINCT rp/.test(sql)) {
      const role = opts.replacements.roleid as string;
      const i = asked[role] ?? 0;
      asked[role] = i + 1;
      return Promise.resolve([[{ n: held[role][Math.min(i, held[role].length - 1)] }]]);
    }
    if (/FROM `permissionstitle` WHERE `permissiontitle`/.test(sql)) return Promise.resolve([o.titleId ? [{ permissiontitleid: o.titleId }] : []]);
    if (/SELECT `permissionname` FROM `permissions`/.test(sql)) return Promise.resolve([(o.existing ?? []).includes(opts.replacements.name) ? [{ permissionname: opts.replacements.name }] : []]);
    return Promise.resolve([[], undefined]);
  });
  return { bulkInsert: jest.fn().mockResolvedValue(undefined), sequelize: { query, transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)) } };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sqlCalls = (qi: ReturnType<typeof makeQueryInterface>) => qi.sequelize.query.mock.calls as unknown as Array<[string, { replacements?: any; transaction?: unknown }]>;

describe("20261112120100-seed-certificate-permissions up()", () => {
  it("creates exactly the three permissions under the Certificate title, which it creates when missing", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const title = qi.bulkInsert.mock.calls.find((c) => c[0] === "permissionstitle")!;
    expect(title[1][0]).toMatchObject({ permissiontitle: "Certificate", type: 1, parentid: null });
    const rows = qi.bulkInsert.mock.calls.filter((c) => c[0] === "permissions").map((c) => c[1][0]);
    expect(rows.map((r) => r.permissionname)).toEqual(NAMES);
    for (const r of rows) expect(r).toMatchObject({ permissiontitleid: title[1][0].permissiontitleid, type: 0 });
  });

  it("grants each to Super Admin, Organisation Admin and Admin in one transaction, and to no other role (Teacher has none)", async () => {
    const qi = makeQueryInterface({ titleId: "t" });
    await migration.up(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    for (const c of qi.bulkInsert.mock.calls) expect(c[2]).toEqual({ transaction: TX });
    const grants = sqlCalls(qi).filter(([sql]) => /INSERT INTO `roles_permissions`/.test(sql));
    expect(grants.map(([, o]) => `${o.replacements.roleid}:${o.replacements.name}`).sort()).toEqual(
      [SUPER_ADMIN, ORGANISATION_ADMIN, ADMIN].flatMap((r) => NAMES.map((n) => `${r}:${n}`)).sort(),
    );
    expect(grants.some(([, o]) => o.replacements.roleid === TEACHER)).toBe(false);
    for (const [sql, o] of grants) {
      expect(o.transaction).toBe(TX);
      expect(sql).toMatch(/p\.`permissionname` = :name/);
      expect(sql).toMatch(/NOT EXISTS/);
    }
  });

  it("is idempotent: inserts no row that exists, but still ensures the grants", async () => {
    const qi = makeQueryInterface({ titleId: "t", existing: NAMES });
    await migration.up(qi);
    expect(qi.bulkInsert).not.toHaveBeenCalled();
    expect(sqlCalls(qi).filter(([sql]) => /INSERT INTO `roles_permissions`/.test(sql))).toHaveLength(9);
  });

  it("refuses to commit if Super Admin held every permission before and would not after", async () => {
    const qi = makeQueryInterface({ titleId: "t", held: { [SUPER_ADMIN]: [194, 194], [ORGANISATION_ADMIN]: [155], [ADMIN]: [160] } });
    await expect(migration.up(qi)).rejects.toThrow(/lose the superadmin wildcard/);
  });

  it("does not second-guess an operator who had already trimmed Super Admin", async () => {
    const qi = makeQueryInterface({ titleId: "t", held: { [SUPER_ADMIN]: [180, 181], [ORGANISATION_ADMIN]: [155], [ADMIN]: [160] } });
    await expect(migration.up(qi)).resolves.toBeUndefined();
  });

  it.each([ORGANISATION_ADMIN, ADMIN])("refuses to commit if the role %s would reach the wildcard", async (role) => {
    const held: Record<string, number[]> = { [SUPER_ADMIN]: [194, 197], [ORGANISATION_ADMIN]: [155], [ADMIN]: [160] };
    held[role] = [197];
    await expect(migration.up(makeQueryInterface({ titleId: "t", held }))).rejects.toThrow(/superadmin wildcard/);
  });
});

describe("20261112120100-seed-certificate-permissions down()", () => {
  it("removes the grants (from every role), then the rows, then the title if unused, in one transaction and in that order", async () => {
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
    expect(statements[iTitle]).toMatch(/NOT EXISTS/);
    for (const [sql, o] of sqlCalls(qi)) {
      expect(o.transaction).toBe(TX);
      if (/DELETE rp|DELETE FROM `permissions`/.test(sql)) expect(o.replacements.names).toEqual(NAMES);
    }
  });
});

export {};
