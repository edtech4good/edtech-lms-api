import { createHash } from "crypto";
import { PERMISSIONS_AS_SHIPPED_20260716 } from "./frozen/permissions-20260716";

/**
 * Two OLDER migrations used to read `Object.values(Permission)` at run time:
 *
 *  - 20260716140000-seed-missing-permissions creates every enum member that is
 *    missing, under the "Report" title;
 *  - 20260716160000-grant-admin-teacher-permissions grants Admin everything but
 *    user/role administration, and Teacher every view_/download_ minus learner
 *    identity.
 *
 * So when the enum grew four organisation permissions, a FRESH database would
 * have created them under "Report" and then handed Admin create/update/delete
 * and Teacher view_organisation. Both now read a frozen literal snapshot of the
 * names as they shipped, so no later enum addition can change them. These specs
 * pin the snapshot itself (count and checksum, taken from the enum at
 * origin/main b37e19f) and what each migration does with it.
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

const sha = (names: ReadonlyArray<string>) =>
  createHash("sha256").update([...names].sort().join("\n")).digest("hex");

/** Computed once from the enum at origin/main b37e19f (167 names); see the frozen file. */
const SNAPSHOT_COUNT = 167;
const SNAPSHOT_SHA = "d4b9c92fe9cb3f160fec6a7fec469517a44cf1f551f8b35eea642d132ff11357";
/** The grant sets the old code produced on that enum, and on the real database (159 / 60). */
const ADMIN_COUNT = 159;
const ADMIN_SHA = "b5fe770675ade87a0684b46a8bb95a0b6a3485eff1b34c4d1e315713aecf2295";
const TEACHER_COUNT = 60;
const TEACHER_SHA = "4e57450e2e2cb897303d2d257ad37236c123fcfc71e02f7e12305f4ab21dbe77";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

const grantSets = async () => {
  const qi = makeQueryInterface();
  await grant.up(qi);
  const byRole: Record<string, string[]> = {};
  for (const c of qi.sequelize.query.mock.calls) {
    const r = c[1]?.replacements;
    if (r?.roleid && r?.names) byRole[r.roleid] = r.names;
  }
  return byRole;
};

describe("the frozen permission snapshot", () => {
  it("has exactly the 167 names the enum held when the older migrations shipped (count and checksum)", () => {
    expect(PERMISSIONS_AS_SHIPPED_20260716).toHaveLength(SNAPSHOT_COUNT);
    expect(new Set(PERMISSIONS_AS_SHIPPED_20260716).size).toBe(SNAPSHOT_COUNT);
    expect(sha(PERMISSIONS_AS_SHIPPED_20260716)).toBe(SNAPSHOT_SHA);
  });

  it("does not contain any of the four organisation permissions", () => {
    for (const name of ORGANISATION) {
      expect(PERMISSIONS_AS_SHIPPED_20260716).not.toContain(name);
    }
  });
});

describe("20260716140000-seed-missing-permissions uses the snapshot", () => {
  it("creates exactly the snapshot (nothing added later), never an organisation permission", async () => {
    const qi = makeQueryInterface();
    await seed.up(qi);
    const inserted = qi.bulkInsert.mock.calls
      .filter((c) => c[0] === "permissions")
      .flatMap((c) => c[1].map((p: { permissionname: string }) => p.permissionname));
    expect(inserted).toHaveLength(SNAPSHOT_COUNT);
    expect(sha(inserted)).toBe(SNAPSHOT_SHA);
    for (const name of ORGANISATION) expect(inserted).not.toContain(name);
  });

  it("removes exactly the snapshot in down()", async () => {
    const qi = makeQueryInterface();
    await seed.down(qi);
    const names = qi.sequelize.query.mock.calls
      .map((c) => c[1]?.replacements?.names)
      .filter(Boolean)
      .flat();
    expect(new Set(names).size).toBe(SNAPSHOT_COUNT);
    expect(sha([...new Set<string>(names)])).toBe(SNAPSHOT_SHA);
  });
});

describe("20260716160000-grant-admin-teacher-permissions uses the snapshot", () => {
  it("grants Admin exactly the same 159 names as before, Teacher exactly the same 60", async () => {
    const byRole = await grantSets();
    expect(Object.keys(byRole).sort()).toEqual([ADMIN, TEACHER].sort());
    expect(byRole[ADMIN]).toHaveLength(ADMIN_COUNT);
    expect(sha(byRole[ADMIN])).toBe(ADMIN_SHA);
    expect(byRole[TEACHER]).toHaveLength(TEACHER_COUNT);
    expect(sha(byRole[TEACHER])).toBe(TEACHER_SHA);
  });

  it("grants Admin and Teacher none of the organisation permissions", async () => {
    const byRole = await grantSets();
    for (const names of Object.values(byRole)) {
      for (const name of ORGANISATION) expect(names).not.toContain(name);
    }
  });
});
