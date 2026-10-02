import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "./frozen/organisation-admin-20261002";
import { PERMISSIONS_AS_SHIPPED_20260716 } from "./frozen/permissions-20260716";
import { Permission } from "../models/enums/permissions.enum";

/**
 * `convertRolesPermsToArrayOfString` hands a bearer the synthetic `superadmin`
 * wildcard, a full bypass of the permission guard, when the number of DISTINCT
 * permissions its roles hold equals the number of rows in the permissions
 * table. So no role other than Super Admin may hold every permission, and no
 * COMBINATION of the other roles may either (a person can hold several).
 *
 * Computed from the frozen lists, the grants as the migrations make them, not
 * from the database: the universe of permissions is the 167 names of the 16 July
 * snapshot, the four organisation permissions, and whatever the live enum holds
 * (which only ever grows). A role set that covered all of that would be a
 * wildcard on any database that has those rows, and a database has at least
 * those.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminTeacherGrant = require("./migrations/20260716160000-grant-admin-teacher-permissions");

const ORGANISATION = ["view_organisation", "create_organisation", "update_organisation", "delete_organisation"];
const ADMIN = "zr5ER4QD";
const TEACHER = "Q3Qs7PuD";

const universe = new Set<string>([
  ...PERMISSIONS_AS_SHIPPED_20260716,
  ...ORGANISATION,
  ...(Object.values(Permission) as string[]),
]);

const missingFrom = (held: Iterable<string>) => {
  const have = new Set(held);
  return [...universe].filter((p) => !have.has(p));
};
/** The wildcard condition: holding every permission there is. */
const holdsEverything = (held: Iterable<string>) => missingFrom(held).length === 0;

/** What the older migration grants Admin and Teacher, as the migration computes it. */
const olderGrants = async (): Promise<Record<string, string[]>> => {
  const byRole: Record<string, string[]> = {};
  await adminTeacherGrant.up({
    sequelize: {
      query: jest.fn(async (_sql: string, o?: { replacements?: { roleid: string; names: string[] } }) => {
        if (o?.replacements?.names) byRole[o.replacements.roleid] = o.replacements.names;
        return [[], undefined];
      }),
      transaction: (cb: (t: unknown) => Promise<void>) => cb({}),
    },
  });
  return byRole;
};

describe("no role other than Super Admin can reach the superadmin wildcard", () => {
  it("the check itself can fail: a role holding every permission is caught", () => {
    expect(holdsEverything([...universe])).toBe(true);
    expect(holdsEverything([...universe].slice(1))).toBe(false);
  });

  it("the universe is at least the 171 permissions known from the frozen lists", () => {
    expect(universe.size).toBeGreaterThanOrEqual(171);
  });

  it("Organisation Admin does not hold every permission, and is well short of it", () => {
    expect(holdsEverything(ORGANISATION_ADMIN_PERMISSIONS_20261002)).toBe(false);
    const missing = missingFrom(ORGANISATION_ADMIN_PERMISSIONS_20261002);
    expect(missing.length).toBeGreaterThanOrEqual(ORGANISATION.length + 3 + 3);
    for (const name of [...ORGANISATION, "create_role", "update_role", "delete_role"]) {
      expect(missing).toContain(name);
    }
  });

  it("Admin and Teacher do not hold every permission", async () => {
    const grants = await olderGrants();
    expect(holdsEverything(grants[ADMIN])).toBe(false);
    expect(holdsEverything(grants[TEACHER])).toBe(false);
  });

  it("no combination of Admin, Teacher and Organisation Admin does either: the three together are still short", async () => {
    const grants = await olderGrants();
    const together = new Set([...grants[ADMIN], ...grants[TEACHER], ...ORGANISATION_ADMIN_PERMISSIONS_20261002]);
    expect(holdsEverything(together)).toBe(false);
    // and the distinct count (what the wildcard compares) is below the universe
    expect(together.size).toBeLessThan(universe.size);
  });
});
