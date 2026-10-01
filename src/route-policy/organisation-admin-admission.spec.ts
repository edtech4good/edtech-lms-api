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

describe("Organisation Admin is admitted wherever Admin is", () => {
  let routes: RouteRecord[];
  beforeAll(async () => {
    routes = await enumerateRoutes();
  });

  it("every route that admits Admin admits Organisation Admin, and the other way round", () => {
    const admin = routes.filter((r) => admits(r, "Role.admin")).map((r) => `${r.method} ${r.path}`);
    const org = routes.filter((r) => admits(r, "Role.organisationadmin")).map((r) => `${r.method} ${r.path}`);
    expect(admin.length).toBeGreaterThan(0);
    expect(org).toEqual(admin);
  });

  it("every explicit role list that names Admin names Organisation Admin", () => {
    const lacking = routes.filter((r) => ROLE_LISTS(r).some((list) => list.includes("Role.admin") && !list.includes("Role.organisationadmin")));
    expect(lacking.map((r) => `${r.method} ${r.path}`)).toEqual([]);
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
