import { enumerateRoutes, RouteRecord } from "./route-inventory";

/**
 * Wherever Admin is admitted by an AccessGuard, Organisation Admin is too: the
 * role holds everything Admin holds (bar the platform-only writes), so a route
 * that listed Admin and not Organisation Admin would let Admin in and refuse
 * the role for no reason anyone chose. Read from the compiled route metadata
 * (the guards each handler really carries), not from the source text.
 *
 * "Admits" means every AccessGuard on the route either lists no role (any
 * valid staff token) or lists the role.
 */
const ROLE_LISTS = (r: RouteRecord): string[][] =>
  r.guards
    .map((g) => /^AccessGuard\((.*)\)$/.exec(g))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1].split(",").map((x) => x.trim()).slice(1)); // drop the token type

const admits = (r: RouteRecord, role: string) => ROLE_LISTS(r).every((list) => list.length === 0 || list.includes(role));

/**
 * The routes where Admin is admitted and the role is deliberately NOT: none. The two pushes to the cloud server
 * (POST /sync/cloud, POST /sync/cloud/:schoolname/students) were the exceptions until 31 Oct 2026; they ask for the
 * `sync_content` / `sync_students` permission now (no role list), and a sync is one organisation's.
 */
const PLATFORM_WIDE: string[] = [];
/** The pushes, and the permission each asks for through CheckPermissionsGuard. */
const SYNC_PUSHES: Array<[string, string]> = [
  ["POST /sync/cloud", "sync_content"],
  ["POST /sync/cloud/:schoolname/students", "sync_students"],
];
const keyOf = (r: RouteRecord) => `${r.method} ${r.path}`;

describe("Organisation Admin is admitted wherever Admin is", () => {
  let routes: RouteRecord[];
  beforeAll(async () => {
    routes = await enumerateRoutes();
  });

  it("every route that admits Admin admits Organisation Admin; and never the other way round", () => {
    const admin = routes.filter((r) => admits(r, "Role.admin")).map(keyOf);
    const org = routes.filter((r) => admits(r, "Role.organisationadmin")).map(keyOf);
    expect(admin.length).toBeGreaterThan(0);
    expect(admin.filter((k) => !org.includes(k)).sort()).toEqual([...PLATFORM_WIDE].sort());
    expect(org.filter((k) => !admin.includes(k))).toEqual([]);
  });

  it("every explicit role list that names Admin names Organisation Admin", () => {
    const lacking = routes.filter((r) => ROLE_LISTS(r).some((list) => list.includes("Role.admin") && !list.includes("Role.organisationadmin")));
    expect(lacking.map(keyOf).sort()).toEqual([...PLATFORM_WIDE].sort());
  });

  it("the two sync pushes name no role at all: each asks for its permission (and the guards that read it), so Admin, Organisation Admin and the platform pass the same check", () => {
    for (const [key, permission] of SYNC_PUSHES) {
      const r = routes.find((x) => keyOf(x) === key)!;
      expect(r).toBeDefined();
      expect(ROLE_LISTS(r)).toEqual([[]]);
      expect(r.guards).toContain("CheckPermissionsGuard");
      expect(r.permissions).toEqual([permission]);
    }
  });

  it("no role list names Organisation Admin without Admin (it is not wider than Admin anywhere)", () => {
    const wider = routes.filter((r) => ROLE_LISTS(r).some((list) => list.includes("Role.organisationadmin") && !list.includes("Role.admin")));
    expect(wider.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it("the Organisation Admin reaches the six staff routes and the role-list reads through permissions alone (no role list on them)", () => {
    const staff = [
      "POST /user",
      "GET /user/:lmsuserid",
      "POST /user/create",
      "PUT /user/:lmsuserid",
      "DELETE /user/:lmsuserid",
      "POST /roles/user-bind-role",
      "GET /roles",
      "POST /roles",
    ];
    for (const key of staff) {
      const r = routes.find((x) => `${x.method} ${x.path}` === key)!;
      expect(r).toBeDefined();
      expect(ROLE_LISTS(r).every((list) => list.length === 0)).toBe(true);
      expect(admits(r, "Role.organisationadmin")).toBe(true);
    }
  });
});
