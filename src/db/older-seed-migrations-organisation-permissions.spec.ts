/**
 * The Permission enum grew four members (the organisation permissions). Two
 * OLDER migrations read the enum at run time:
 *
 *  - 20260716140000-seed-missing-permissions creates every enum member that is
 *    missing, under the "Report" title;
 *  - 20260716160000-grant-admin-teacher-permissions grants Admin everything but
 *    user/role administration, and Teacher every view_/download_.
 *
 * Without a guard, a FRESH database would have created the organisation
 * permissions under "Report" and then handed Admin create/update/delete and
 * Teacher view_organisation - platform-only permissions in the wrong hands,
 * before their own migration ran. These specs pin that the older migrations
 * leave them alone. On a database where they already ran, nothing changes.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require("./migrations/20260716140000-seed-missing-permissions");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const grant = require("./migrations/20260716160000-grant-admin-teacher-permissions");

const ORGANISATION = [
  "view_organisation",
  "create_organisation",
  "update_organisation",
  "delete_organisation",
];
const ADMIN = "zr5ER4QD";
const TEACHER = "Q3Qs7PuD";

const makeQueryInterface = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = jest.fn((sql: string, _opts?: any) => {
    if (/FROM `permissionstitle`$/.test(sql.trim())) {
      return Promise.resolve([[{ permissiontitleid: "report-title", permissiontitle: "Report" }]]);
    }
    if (/SELECT `permissionname` FROM `permissions`/.test(sql)) {
      return Promise.resolve([[]]); // a database that has none of them yet
    }
    return Promise.resolve([[], undefined]);
  });
  return {
    bulkInsert: jest.fn().mockResolvedValue(undefined),
    sequelize: {
      query,
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb({})),
    },
  };
};

describe("older permission migrations and the organisation permissions", () => {
  it("20260716140000 does not create them (up)", async () => {
    const qi = makeQueryInterface();
    await seed.up(qi);
    const inserted = qi.bulkInsert.mock.calls
      .filter((c) => c[0] === "permissions")
      .flatMap((c) => c[1].map((p: any) => p.permissionname));
    expect(inserted.length).toBeGreaterThan(50); // it still seeds its own rows
    for (const name of ORGANISATION) expect(inserted).not.toContain(name);
  });

  it("20260716140000 does not claim them in down() either", async () => {
    const qi = makeQueryInterface();
    await seed.down(qi);
    const names = qi.sequelize.query.mock.calls
      .map((c) => c[1]?.replacements?.names)
      .filter(Boolean)
      .flat();
    expect(names.length).toBeGreaterThan(50);
    for (const name of ORGANISATION) expect(names).not.toContain(name);
  });

  it("20260716160000 grants Admin and Teacher none of them", async () => {
    const qi = makeQueryInterface();
    await grant.up(qi);
    const byRole = new Map<string, string[]>();
    for (const c of qi.sequelize.query.mock.calls) {
      const r = c[1]?.replacements;
      if (r?.roleid && r?.names) byRole.set(r.roleid, r.names);
    }
    expect([...byRole.keys()].sort()).toEqual([ADMIN, TEACHER].sort());
    for (const names of byRole.values()) {
      for (const name of ORGANISATION) expect(names).not.toContain(name);
    }
  });

  it("20260716160000 still grants Admin 159 and Teacher 60, as it always did", async () => {
    // The organisation permissions are excluded from the enum read, so the
    // counts the wildcard arithmetic in docs/authorization-model.md depends on
    // are exactly what they were before the enum grew.
    const qi = makeQueryInterface();
    await grant.up(qi);
    const sizes: Record<string, number> = {};
    for (const c of qi.sequelize.query.mock.calls) {
      const r = c[1]?.replacements;
      if (r?.roleid && r?.names) sizes[r.roleid] = r.names.length;
    }
    expect(sizes[ADMIN]).toBe(159);
    expect(sizes[TEACHER]).toBe(60);
  });
});
