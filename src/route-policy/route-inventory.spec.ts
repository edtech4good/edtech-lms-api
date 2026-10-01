import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
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
  specProvesRoute,
  specTests,
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
const EXPECTED_TOTAL = 282;
const EXPECTED_BY_POLICY = {
  public: 11,
  self: 4,
  owned: 243,
  platform: 18,
  server: 1,
  global: 5,
};

// How the routes divide by enforcement, stated explicitly (they sum to the
// total):
//  - enforced: by a guard (self 4 + global 5 + platform with PlatformGuard 18
//    = 27), or, for an owned route, by the spec it names (6, listed below) = 33
//  - not applicable (public): 11
//  - pending the organisation boundary: owned without a proving spec 237 +
//    platform without PlatformGuard 0 + server 1 = 238
const EXPECTED_ENFORCED_BY_GUARD = 27;
const EXPECTED_ENFORCED_BY_SPEC = 6;
const EXPECTED_ENFORCED = EXPECTED_ENFORCED_BY_GUARD + EXPECTED_ENFORCED_BY_SPEC;
const EXPECTED_NOT_APPLICABLE = 11;
const EXPECTED_PENDING = 238;
// The owned routes that name a spec proving them, pinned by name so adding or
// removing one is a conscious edit.
const EXPECTED_OWNED_ENFORCED = [
  "DELETE /user/:lmsuserid",
  "GET /user/:lmsuserid",
  "POST /roles/user-bind-role",
  "POST /user",
  "POST /user/create",
  "PUT /user/:lmsuserid",
];
// Every `platform` route has PlatformGuard (18 routes), pinned by name so
// moving a route out of the platform set is a conscious edit.
const EXPECTED_PLATFORM = [
  "DELETE /country/:countryid",
  "DELETE /organisation/:organisationid",
  "DELETE /roles/:roleid",
  "GET /organisation",
  "GET /organisation/:organisationid",
  "POST /auth/organisation",
  "POST /country/create",
  "POST /lesson/update_reward_points",
  "POST /level/update_quiz_points",
  "POST /organisation",
  "POST /roles/create",
  "POST /standard/migrate-standardid",
  "POST /standard/remove-standardid",
  "POST /student/migrate-standardid",
  "POST /student/migrate-subject-curriculum",
  "PUT /country/:countryid",
  "PUT /organisation/:organisationid",
  "PUT /roles/:roleid",
];

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
    it("divides the routes into 33 enforced (27 by a guard, 6 by a proving spec), 11 not applicable (public) and 238 pending", () => {
      const count = (state: string) => routes.filter((r) => enforcementState(r) === state).length;
      expect(count("yes")).toBe(EXPECTED_ENFORCED);
      expect(count("n/a")).toBe(EXPECTED_NOT_APPLICABLE);
      expect(count("pending")).toBe(EXPECTED_PENDING);
      expect(EXPECTED_ENFORCED + EXPECTED_NOT_APPLICABLE + EXPECTED_PENDING).toBe(EXPECTED_TOTAL);
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

  describe("owned routes proved by a spec", () => {
    it("the enforced owned routes are exactly the six named ones", () => {
      const enforced = routes.filter((r) => r.policy === "owned" && enforcementState(r) === "yes");
      expect(enforced.map(key).sort()).toEqual([...EXPECTED_OWNED_ENFORCED].sort());
      expect(enforced).toHaveLength(EXPECTED_ENFORCED_BY_SPEC);
    });

    it("every route that names a proving spec is proven by it (the file exists and has the route in a test title)", () => {
      const declared = routes.filter((r) => r.enforcedBy !== undefined);
      expect(declared.filter((r) => !r.enforcedByProven).map(key)).toEqual([]);
      expect(declared.length).toBeGreaterThan(0);
    });

    it("only owned routes name a proving spec", () => {
      expect(routes.filter((r) => r.enforcedBy !== undefined && r.policy !== "owned").map(key)).toEqual([]);
    });

    it("the enforced routes are not in the pending snapshot, and the other owned routes still are", () => {
      const pending = new Set(pendingEnforcementLines(routes).map((l) => l.split("  ")[0]));
      for (const name of EXPECTED_OWNED_ENFORCED) expect(pending.has(name)).toBe(false);
      expect(pending.has("GET /school/all")).toBe(true);
    });
  });

  describe("policy against today's guards", () => {
    it("PlatformGuard routes are `platform`", () => {
      const wrong = routes.filter((r) => r.hasPlatformGuard && r.policy !== "platform");
      expect(wrong.map(key)).toEqual([]);
      // and the guard is actually found on every platform route
      expect(routes.filter((r) => r.hasPlatformGuard)).toHaveLength(18);
    });

    it("every `platform` route has PlatformGuard, and they are the 18 named routes", () => {
      expect(routes.filter((r) => r.policy === "platform").map(key).sort()).toEqual([...EXPECTED_PLATFORM].sort());
      expect(routes.filter((r) => r.policy === "platform" && !r.hasPlatformGuard).map(key)).toEqual([]);
    });

    it("on a PlatformGuard route the guards run in order: authentication, then PlatformGuard, then permissions", () => {
      const platform = routes.filter((r) => r.hasPlatformGuard);
      const misordered = platform.filter((r) => {
        const at = r.guards.lastIndexOf("PlatformGuard");
        const lastAuth = Math.max(...r.guards.map((g, i) => (g.startsWith("AccessGuard") ? i : -1)));
        const permission = r.guards.indexOf("CheckPermissionsGuard");
        return !(lastAuth >= 0 && lastAuth < at && (permission === -1 || at < permission));
      });
      expect(misordered.map(key)).toEqual([]);
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
    enforcedBy: undefined,
    enforcedByProven: false,
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

  it("an owned route is enforced only when its named spec is proven, else pending", () => {
    expect(enforcementState(route({ policy: "owned" }))).toBe("pending");
    expect(enforcementState(route({ policy: "owned", enforcedBy: "x.spec.ts", enforcedByProven: false }))).toBe("pending");
    expect(enforcementState(route({ policy: "owned", enforcedBy: "x.spec.ts", enforcedByProven: true }))).toBe("yes");
    expect(pendingEnforcementLines([route({ policy: "owned", enforcedBy: "x.spec.ts", enforcedByProven: true })])).toEqual([]);
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

describe("specProvesRoute (what makes an owned route count as enforced)", () => {
  let root: string;
  const write = (name: string, text: string) => {
    mkdirSync(join(root, "specs"), { recursive: true });
    writeFileSync(join(root, "specs", name), text);
    return `specs/${name}`;
  };
  const proves = (source: string, routeKey = "PUT /user/:id") => {
    const file = write(`case-${Math.random().toString(36).slice(2)}.spec.ts`, source);
    return specProvesRoute(file, routeKey, root);
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "route-proof-"));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  describe("accepted: a test that runs, names the route in its full title, and calls expect in its body", () => {
    it("a test whose own title names the route", () => {
      expect(proves(`it("PUT /user/:id is scoped", () => { expect(1).toBe(1); });`)).toBe(true);
      expect(proves(`test("PUT /user/:id is scoped", async () => { await expect(Promise.resolve(1)).resolves.toBe(1); });`)).toBe(true);
    });

    it("a test whose enclosing describe names the route (the full title is describe titles plus the test's own)", () => {
      expect(proves(`describe("PUT /user/:id", () => { describe("inner", () => { it("is scoped", () => { expect(1).toBe(1); }); }); });`)).toBe(true);
    });

    it("the .each and .concurrent forms", () => {
      expect(proves(`describe("PUT /user/:id", () => { it.each([1])("case %s", (n) => { expect(n).toBe(1); }); });`)).toBe(true);
      expect(proves(`describe.each([[1]])("PUT /user/:id %s", () => { test("t", () => { expect(1).toBe(1); }); });`)).toBe(true);
    });

    it("an expect nested inside a callback in the test body", () => {
      expect(proves(`it("PUT /user/:id", () => { [1].forEach((n) => { expect(n).toBe(1); }); });`)).toBe(true);
    });
  });

  describe("rejected", () => {
    it("a describe on its own: an empty one, or one with no test under it", () => {
      expect(proves(`describe("PUT /user/:id", () => {});`)).toBe(false);
      // a describe title alone never counts: with no test under it there is nothing to match
      expect(proves(`describe("PUT /user/:id", () => { const x = 1; });`)).toBe(false);
    });

    it("a skipped, todo, focused or x/f-prefixed test", () => {
      for (const form of ["it.skip", "it.todo", "it.only", "test.skip", "test.only", "xit", "xtest", "fit", "ftest", "it.failing"]) {
        expect(proves(`${form}("PUT /user/:id", () => { expect(1).toBe(1); });`)).toBe(false);
      }
      expect(proves(`it.skip.each([1])("PUT /user/:id", () => { expect(1).toBe(1); });`)).toBe(false);
    });

    it("a test inside a skipped, focused or x/f-prefixed describe", () => {
      for (const form of ["describe.skip", "describe.only", "xdescribe", "fdescribe", "describe.each([1]).skip"]) {
        expect(proves(`${form}("PUT /user/:id", () => { it("is scoped", () => { expect(1).toBe(1); }); });`)).toBe(false);
      }
      expect(proves(`describe.skip("outer", () => { it("PUT /user/:id", () => { expect(1).toBe(1); }); });`)).toBe(false);
      // a skipped sibling does not spoil a live test under the same describe
      expect(proves(`describe("PUT /user/:id", () => { it.skip("a", () => { expect(1).toBe(1); }); it("b", () => { expect(1).toBe(1); }); });`)).toBe(true);
    });

    it("a test with no expect in its body, or one whose assertion is only reached through a helper", () => {
      expect(proves(`it("PUT /user/:id", () => {});`)).toBe(false);
      expect(proves(`it("PUT /user/:id", () => { const x = 1; });`)).toBe(false);
      expect(proves(`const check = () => { expect(1).toBe(1); }; it("PUT /user/:id", () => { check(); });`)).toBe(false);
      expect(proves(`it("PUT /user/:id");`)).toBe(false);
    });

    it("the route only in a comment, a string, or an expect argument, not a title", () => {
      expect(proves(`// PUT /user/:id\nit("something else", () => { expect("PUT /user/:id").toBe("PUT /user/:id"); });`)).toBe(false);
    });

    it("a longer route in the title does not prove a shorter one", () => {
      expect(proves(`it("POST /user/create works", () => { expect(1).toBe(1); });`, "POST /user")).toBe(false);
      expect(proves(`it("POST /user (list) works", () => { expect(1).toBe(1); });`, "POST /user")).toBe(true);
    });

    it("a file that does not exist, is not a spec, or leaves the repository", () => {
      expect(specProvesRoute("specs/missing.spec.ts", "GET /x", root)).toBe(false);
      write("plain.ts", `it("GET /x", () => { expect(1).toBe(1); });`);
      expect(specProvesRoute("specs/plain.ts", "GET /x", root)).toBe(false);
      expect(specProvesRoute("../outside.spec.ts", "GET /x", root)).toBe(false);
      expect(specProvesRoute("/etc/hosts.spec.ts", "GET /x", root)).toBe(false);
      expect(specProvesRoute(undefined, "GET /x", root)).toBe(false);
    });
  });

  describe("specTests", () => {
    it("lists the tests that run, with full titles and whether each asserts", () => {
      const tests = specTests(`
        describe("A", () => {
          describe("B", () => {
            it("one", () => { expect(1).toBe(1); });
            test("two", () => {});
            it.each([1])("three %s", () => { expect(1).toBe(1); });
          });
          it.skip("skipped", () => { expect(1).toBe(1); });
        });
        xit("excluded", () => { expect(1).toBe(1); });
      `);
      expect(tests).toEqual([
        { title: "A B one", hasExpect: true },
        { title: "A B two", hasExpect: false },
        { title: "A B three %s", hasExpect: true },
      ]);
    });
  });
});
