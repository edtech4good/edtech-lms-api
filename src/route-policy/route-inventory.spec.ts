import { readFileSync } from "fs";
import { join } from "path";
import {
  countByPolicy,
  duplicateRoutes,
  enumerateRoutes,
  INVENTORY_DOC_PATH,
  parsePendingSnapshot,
  pendingEnforcementLines,
  RouteRecord,
  renderInventoryMarkdown,
  routesWithoutPolicy,
  routesWithUnknownPolicy,
} from "./route-inventory";

/**
 * The organisation route inventory (docs/admin-organisations-schema.md §8).
 *
 * Several organisations share this API, so every route must declare which
 * organisation policy applies to it (`@OrgPolicy`, src/decorators/
 * orgPolicy.decorator.ts). This spec enumerates the routes the application
 * REALLY registers - AppModule's module graph, read through Nest's own
 * DiscoveryService - and fails when:
 *  - a route has no policy, or a policy that is not in the list;
 *  - two routes resolve to the same method and path;
 *  - the route total or the count per policy changes (pinned below, so adding
 *    a route is a conscious edit);
 *  - the pending-enforcement snapshot or docs/route-policy-inventory.md no
 *    longer matches what the code says;
 *  - a policy contradicts the guards the route has today.
 *
 * No server is started and no database is opened: the application context is
 * created, read and closed.
 */

// Pinned on purpose. When you add or remove a route, update these numbers AND
// run `npm run routes:policy -- --write` to refresh the committed files.
const EXPECTED_TOTAL = 281;
const EXPECTED_BY_POLICY = {
  public: 11,
  self: 4,
  owned: 248,
  platform: 17,
  server: 1,
};

// Routes that have no AccessGuard yet are not `public`, because the handler
// itself authenticates the bearer token. Listed by name so it cannot grow
// silently.
const AUTHENTICATED_IN_HANDLER = ["POST /auth/logout"];

const SNAPSHOT_FILE = join(__dirname, "pending-enforcement.snapshot.txt");
const DOC_FILE = join(__dirname, "..", "..", INVENTORY_DOC_PATH);

const key = (r: RouteRecord) => `${r.method} ${r.path}`;

describe("route inventory (real application wiring)", () => {
  let routes: RouteRecord[];

  beforeAll(async () => {
    routes = await enumerateRoutes();
  }, 180_000);

  it("finds routes in the registered controllers, including the organisation routes", () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((r) => r.controller === "OrganisationController")).toHaveLength(5);
  });

  it("gives every route an @OrgPolicy", () => {
    expect(routesWithoutPolicy(routes)).toEqual([]);
  });

  it("allows only known policy values", () => {
    expect(routesWithUnknownPolicy(routes)).toEqual([]);
  });

  it("has no two routes with the same method and path", () => {
    expect(duplicateRoutes(routes)).toEqual([]);
  });

  it("pins the total number of routes", () => {
    expect(routes).toHaveLength(EXPECTED_TOTAL);
  });

  it("pins the number of routes per policy", () => {
    expect(countByPolicy(routes)).toEqual(EXPECTED_BY_POLICY);
  });

  describe("pending enforcement", () => {
    it("matches the checked-in snapshot exactly", () => {
      const snapshot = parsePendingSnapshot(readFileSync(SNAPSHOT_FILE, "utf8"));
      expect(pendingEnforcementLines(routes)).toEqual(snapshot);
    });

    it("leaves out routes that a guard already enforces, public and self", () => {
      const listed = new Set(pendingEnforcementLines(routes).map((l) => l.split("  ")[0]));
      for (const r of routes) {
        if (r.policy === "public" || r.policy === "self" || r.hasPlatformGuard) {
          expect(listed.has(key(r))).toBe(false);
        }
      }
    });
  });

  describe("policy against today's guards", () => {
    it("PlatformGuard routes are `platform`", () => {
      const wrong = routes.filter((r) => r.hasPlatformGuard && r.policy !== "platform");
      expect(wrong.map(key)).toEqual([]);
      // and the guard is actually found on the organisation routes
      expect(routes.filter((r) => r.hasPlatformGuard)).toHaveLength(5);
    });

    it("routes with no authentication guard are `public`, and `public` routes have none", () => {
      const unguarded = routes.filter(
        (r) => r.auth === "none" && !AUTHENTICATED_IN_HANDLER.includes(key(r)),
      );
      expect(unguarded.filter((r) => r.policy !== "public").map(key)).toEqual([]);
      expect(routes.filter((r) => r.policy === "public" && r.auth !== "none").map(key)).toEqual([]);
      // the named exceptions really have no guard and really are not public
      for (const name of AUTHENTICATED_IN_HANDLER) {
        const r = routes.find((x) => key(x) === name);
        expect(r?.auth).toBe("none");
        expect(r?.policy).not.toBe("public");
      }
    });

    it("routes whose guards admit only the API key are `server`, and `server` routes admit it", () => {
      expect(routes.filter((r) => r.auth === "apikey-only" && r.policy !== "server").map(key)).toEqual([]);
      expect(routes.filter((r) => r.policy === "server" && !r.admitsApiKey).map(key)).toEqual([]);
    });

    it("routes that also admit the API key are `server` or say so in their note", () => {
      const unexplained = routes.filter(
        (r) => r.admitsApiKey && r.policy !== "server" && !/API key/.test(r.note ?? ""),
      );
      expect(unexplained.map(key)).toEqual([]);
    });
  });

  describe("committed inventory document", () => {
    it("is up to date (regenerate with `npm run routes:policy -- --write`)", () => {
      expect(readFileSync(DOC_FILE, "utf8")).toBe(renderInventoryMarkdown(routes));
    });
  });
});

describe("route inventory checks (synthetic routes, to prove they can fail)", () => {
  const route = (over: Partial<RouteRecord>): RouteRecord => ({
    method: "GET",
    path: "/x",
    controller: "C",
    handler: "h",
    policy: "owned",
    note: undefined,
    guards: [],
    auth: "token",
    admitsApiKey: false,
    hasPlatformGuard: false,
    permissions: [],
    ...over,
  });

  it("reports a route with no policy", () => {
    expect(routesWithoutPolicy([route({ policy: undefined })])).toHaveLength(1);
    expect(routesWithoutPolicy([route({})])).toHaveLength(0);
  });

  it("reports an unknown policy value", () => {
    expect(routesWithUnknownPolicy([route({ policy: "everyone" })])).toHaveLength(1);
    expect(routesWithUnknownPolicy([route({ policy: "platform" })])).toHaveLength(0);
  });

  it("reports two routes with the same method and path, but not different methods", () => {
    expect(duplicateRoutes([route({ handler: "a" }), route({ handler: "b" })])).toHaveLength(1);
    expect(duplicateRoutes([route({}), route({ method: "POST" })])).toHaveLength(0);
  });

  it("lists pending routes sorted, and leaves enforced ones out", () => {
    const lines = pendingEnforcementLines([
      route({ path: "/b", policy: "owned" }),
      route({ path: "/a", policy: "server" }),
      route({ path: "/c", policy: "platform", hasPlatformGuard: true }),
      route({ path: "/d", policy: "platform" }),
      route({ path: "/e", policy: "public" }),
      route({ path: "/f", policy: "self" }),
    ]);
    expect(lines).toEqual(["GET /a  server", "GET /b  owned", "GET /d  platform"]);
  });
});
