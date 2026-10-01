import { readFileSync } from "fs";
import { join } from "path";
import { mixin } from "@nestjs/common";
import { MODULE_PATH } from "@nestjs/common/constants";
import * as ts from "typescript";
import {
  ORG_POLICIES,
  ORG_POLICY_DEFINITIONS,
  ORG_POLICY_TIE_BREAK,
} from "src/decorators/orgPolicy.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { TokenType } from "src/models/enums";
import {
  countByPolicy,
  describeGuard,
  enforcementState,
  modulesWithModulePath,
  PENDING_MEANING,
  renderPendingSnapshot,
  duplicateRoutes,
  enumerateRoutes,
  globalRouteViolations,
  INVENTORY_DOC_PATH,
  parsePendingSnapshot,
  pendingEnforcementLines,
  policyLabel,
  RouteRecord,
  renderInventoryMarkdown,
  routesWithoutPolicy,
  routesWithUnknownPolicy,
  selfRouteViolations,
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
  owned: 243,
  platform: 17,
  server: 1,
  global: 5,
};

// How the routes divide by enforcement, stated explicitly (they sum to the
// total):
//  - enforced by a guard: self 4 + global 5 + platform with PlatformGuard 5 = 14
//  - not applicable (public): 11
//  - pending the organisation boundary: owned 243 + platform without
//    PlatformGuard 12 + server 1 = 256
const EXPECTED_ENFORCED_BY_GUARD = 14;
const EXPECTED_NOT_APPLICABLE = 11;
const EXPECTED_PENDING = 256;

// The `self` and `global` sets are pinned by name, so moving a route into
// either one is a conscious edit.
const EXPECTED_SELF = [
  "POST /auth/logout",
  "PUT /auth/changepassword",
  "POST /auth/refreshtoken",
  "POST /auth/verify",
];
const EXPECTED_GLOBAL = [
  "GET /roles",
  "GET /roles/:roleid",
  "GET /roles/node/permissions",
  "GET /roles/permissions",
  "POST /roles",
];

// Routes with no AccessGuard that are not `public`, because the handler itself
// authenticates the bearer token (a `self` route). Listed by name so it cannot
// grow silently.
const AUTHENTICATED_IN_HANDLER = ["POST /auth/logout"];

const SNAPSHOT_FILE = join(__dirname, "pending-enforcement.snapshot.txt");
const DOC_FILE = join(__dirname, "..", "..", INVENTORY_DOC_PATH);
const DECORATOR_FILE = join(__dirname, "..", "decorators", "orgPolicy.decorator.ts");
const SERVER_FILE = join(__dirname, "..", "server.ts");

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
    it("divides the routes into 14 enforced by a guard, 11 not applicable (public) and 256 pending", () => {
      const count = (state: string) => routes.filter((r) => enforcementState(r) === state).length;
      expect(count("yes")).toBe(EXPECTED_ENFORCED_BY_GUARD);
      expect(count("n/a")).toBe(EXPECTED_NOT_APPLICABLE);
      expect(count("pending")).toBe(EXPECTED_PENDING);
      expect(EXPECTED_ENFORCED_BY_GUARD + EXPECTED_NOT_APPLICABLE + EXPECTED_PENDING).toBe(EXPECTED_TOTAL);
      expect(pendingEnforcementLines(routes)).toHaveLength(EXPECTED_PENDING);
      expect(routes.filter((r) => r.policy === "public").every((r) => enforcementState(r) === "n/a")).toBe(true);
    });

    it("the snapshot file, header included, is exactly what the generator writes", () => {
      const text = readFileSync(SNAPSHOT_FILE, "utf8");
      expect(text).toBe(renderPendingSnapshot(routes));
      expect(text).toContain(PENDING_MEANING);
    });

    it("matches the checked-in snapshot exactly", () => {
      const snapshot = parsePendingSnapshot(readFileSync(SNAPSHOT_FILE, "utf8"));
      expect(pendingEnforcementLines(routes)).toEqual(snapshot);
    });

    it("leaves out routes that a guard already enforces, public, self and global", () => {
      const listed = new Set(pendingEnforcementLines(routes).map((l) => l.split("  ")[0]));
      for (const r of routes) {
        if (r.policy === "public" || r.policy === "self" || r.policy === "global" || r.hasPlatformGuard) {
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
    });

    it("the handler-authenticated exceptions really have no guard and are exactly `self`", () => {
      for (const name of AUTHENTICATED_IN_HANDLER) {
        const r = routes.find((x) => key(x) === name);
        expect(r?.auth).toBe("none");
        expect(r?.policy).toBe("self");
      }
    });

    it("routes whose guards admit only the API key are `server`, and `server` routes admit it", () => {
      expect(routes.filter((r) => r.auth === "apikey-only" && r.policy !== "server").map(key)).toEqual([]);
      expect(routes.filter((r) => r.policy === "server" && !r.admitsApiKey).map(key)).toEqual([]);
    });

    it("only `owned`, `platform` and `server` routes admit the API key (a route that does is marked in the snapshot)", () => {
      const wrong = routes.filter(
        (r) => r.admitsApiKey && !["owned", "platform", "server"].includes(r.policy ?? ""),
      );
      expect(wrong.map(key)).toEqual([]);
      const marked = pendingEnforcementLines(routes).filter((l) => l.endsWith("+apikey"));
      expect(marked).toHaveLength(routes.filter((r) => r.admitsApiKey && r.policy !== "global").length);
    });

    it("`self` is the four named routes, each using a non-ACCESS token guard or a named exception", () => {
      expect(routes.filter((r) => r.policy === "self").map(key).sort()).toEqual([...EXPECTED_SELF].sort());
      expect(selfRouteViolations(routes, AUTHENTICATED_IN_HANDLER)).toEqual([]);
    });

    it("`global` is the five named role and permission reads, staff access token only", () => {
      expect(routes.filter((r) => r.policy === "global").map(key).sort()).toEqual([...EXPECTED_GLOBAL].sort());
      expect(globalRouteViolations(routes)).toEqual([]);
    });

    it("`global` routes are not pending enforcement", () => {
      const pending = new Set(pendingEnforcementLines(routes).map((l) => l.split("  ")[0]));
      for (const r of routes.filter((x) => x.policy === "global")) {
        expect(pending.has(key(r))).toBe(false);
      }
    });
  });

  describe("what the inventory cannot see", () => {
    it("the bootstrap (src/server.ts) sets no global prefix and enables no versioning", () => {
      const source = ts.createSourceFile(SERVER_FILE, readFileSync(SERVER_FILE, "utf8"), ts.ScriptTarget.ES2020, true);
      const calls: string[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const name = node.expression.name.text;
          if (name === "setGlobalPrefix" || name === "enableVersioning") calls.push(name);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      expect(calls).toEqual([]);
    });

    it("the policy definitions in the decorator's doc comment match the data the document uses", () => {
      const source = readFileSync(DECORATOR_FILE, "utf8");
      // Only the doc comment: the same text also sits in ORG_POLICY_DEFINITIONS
      // further down, which would satisfy the check by itself.
      const comment = source
        .slice(source.indexOf("The policies."), source.indexOf("Put it on the handler method"))
        .replace(/\s*\n\s*\*\s*/g, " ")
        .replace(/\s+/g, " ");
      for (const policy of ORG_POLICIES) {
        expect(comment).toContain(ORG_POLICY_DEFINITIONS[policy]);
      }
      expect(comment).toContain(ORG_POLICY_TIE_BREAK);
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
    tokenTypes: ["ACCESS"],
    schoolUserAdmitted: false,
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

  it("reports a module that carries RouterModule module-path metadata, and no other", () => {
    class Plain {}
    class Prefixed {}
    Reflect.defineMetadata(`${MODULE_PATH}some-application-id`, "/api", Prefixed);
    expect(modulesWithModulePath([Plain])).toEqual([]);
    expect(modulesWithModulePath([Plain, Prefixed])).toEqual(["Prefixed"]);
  });

  it("shows `n/a` for public routes, `yes` for guard-backed ones and `pending` for the rest", () => {
    expect(enforcementState(route({ policy: "public" }))).toBe("n/a");
    expect(enforcementState(route({ policy: "self" }))).toBe("yes");
    expect(enforcementState(route({ policy: "global" }))).toBe("yes");
    expect(enforcementState(route({ policy: "platform", hasPlatformGuard: true }))).toBe("yes");
    expect(enforcementState(route({ policy: "platform" }))).toBe("pending");
    expect(enforcementState(route({ policy: "owned" }))).toBe("pending");
    expect(enforcementState(route({ policy: "server" }))).toBe("pending");
  });

  it("marks an API-key route in the snapshot line", () => {
    expect(pendingEnforcementLines([route({ path: "/k", admitsApiKey: true })])).toEqual(["GET /k  owned+apikey"]);
    expect(policyLabel(route({}))).toBe("owned");
  });

  it("flags a `global` route that admits a school-user token, the API key, PlatformGuard, a non-ACCESS token, or no guard", () => {
    const ok = route({ policy: "global" });
    expect(globalRouteViolations([ok])).toEqual([]);
    for (const bad of [
      { schoolUserAdmitted: true },
      { admitsApiKey: true },
      { hasPlatformGuard: true },
      { tokenTypes: ["REFRESH"] },
      { tokenTypes: [] },
    ]) {
      expect(globalRouteViolations([route({ policy: "global", ...bad })])).toHaveLength(1);
    }
  });

  it("flags a `self` route that uses an ACCESS guard or no guard, unless it is a named exception", () => {
    expect(selfRouteViolations([route({ policy: "self", tokenTypes: ["REFRESH"] })], [])).toEqual([]);
    expect(selfRouteViolations([route({ policy: "self", tokenTypes: ["ACCESS"] })], [])).toHaveLength(1);
    expect(selfRouteViolations([route({ policy: "self", tokenTypes: [] })], [])).toHaveLength(1);
    expect(selfRouteViolations([route({ policy: "self", tokenTypes: [] })], ["GET /x"])).toEqual([]);
  });

  it("refuses to describe a mixin guard that has no ACCESS_GUARD_INFO, and describes an AccessGuard", () => {
    const stranger = mixin(class SomeOtherGuard {});
    expect(() => describeGuard(stranger)).toThrow(/ACCESS_GUARD_INFO/);
    expect(describeGuard(AccessGuard(TokenType.ACCESS))).toBe("AccessGuard(ACCESS)");
  });

  it("lists pending routes sorted, and leaves enforced ones out", () => {
    const lines = pendingEnforcementLines([
      route({ path: "/b", policy: "owned" }),
      route({ path: "/a", policy: "server" }),
      route({ path: "/c", policy: "platform", hasPlatformGuard: true }),
      route({ path: "/d", policy: "platform" }),
      route({ path: "/e", policy: "public" }),
      route({ path: "/f", policy: "self" }),
      route({ path: "/g", policy: "global" }),
    ]);
    expect(lines).toEqual(["GET /a  server", "GET /b  owned", "GET /d  platform"]);
  });
});
