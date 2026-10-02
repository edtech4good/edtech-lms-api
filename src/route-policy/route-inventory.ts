import "reflect-metadata";
import { existsSync, readFileSync } from "fs";
import { join, normalize, isAbsolute } from "path";
import * as ts from "typescript";
import { Module, RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  MODULE_PATH,
  VERSION_METADATA,
} from "@nestjs/common/constants";
import { addLeadingSlash } from "@nestjs/common/utils/shared.utils";
import {
  ApplicationConfig,
  DiscoveryModule,
  ModulesContainer,
  DiscoveryService,
  MetadataScanner,
  NestFactory,
  Reflector,
} from "@nestjs/core";
import { RoutePathFactory } from "@nestjs/core/router/route-path-factory";
import { AppModule } from "src/app.module";
import {
  ACCESS_GUARD_INFO,
  AccessGuardInfo,
} from "src/guards/access.guard";
import {
  getOrgPolicy,
  ORG_POLICIES,
  ORG_POLICY_DEFINITIONS,
  ORG_POLICY_TIE_BREAK,
  OrgPolicyName,
} from "src/decorators/orgPolicy.decorator";
import { PERMISSIONS_KEY } from "src/decorators/requirePermissions.decorator";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { PlatformGuard } from "src/guards/platform.guard";
import { Role, TokenType } from "src/models/enums";

/**
 * The route inventory: every route the application registers, with the
 * organisation policy it declares (src/decorators/orgPolicy.decorator.ts) and
 * the guards it runs today. Used by route-inventory.spec.ts and by
 * scripts/route-policy-inventory.ts, so the test and the committed document
 * (docs/route-policy-inventory.md) come from the same enumeration.
 *
 * Enumeration is from the real wiring, not from a file glob: the application
 * context is built from AppModule, and the controllers are the ones Nest's own
 * DiscoveryService finds in the module graph. A controller class that no module
 * declares is not counted; one declared anywhere in the graph is. Method and
 * path come from the same metadata and the same RoutePathFactory Nest uses to
 * register the route with Express.
 *
 * No server is started and no database is opened: the application context is
 * created, read and closed.
 */

export type AuthKind = "none" | "token" | "apikey-only";

export interface RouteRecord {
  method: string;
  path: string;
  controller: string;
  handler: string;
  /** The declared policy, exactly as stored (may be undefined or invalid). */
  policy: string | undefined;
  note: string | undefined;
  /** Guards in the order Nest runs them (controller level, then handler). */
  guards: string[];
  /**
   * "none": no AccessGuard on the route. "apikey-only": an AccessGuard whose
   * only listed role is the application API key. "token": any other
   * AccessGuard.
   */
  auth: AuthKind;
  /**
   * True when EVERY AccessGuard on the route lists the application API key
   * among its roles, so the key (which carries no user) gets through all of
   * them. A route with one guard that lists it and another that does not is
   * not counted: the second one refuses the key.
   */
  admitsApiKey: boolean;
  hasPlatformGuard: boolean;
  /**
   * Permissions CheckPermissionsGuard asks for: what its own
   * `getAllAndOverride` returns for this handler and class, so handler
   * metadata wins over class metadata (it is not a union).
   */
  permissions: string[];
  /** Token types of the AccessGuards on the route (ACCESS, REFRESH, ...). */
  tokenTypes: string[];
  /**
   * True when a school-user (teacher or classroom device) access token gets
   * through every guard on the route. Derived from guard metadata alone: a
   * school-user token is an ACCESS token that carries no `lmsuserroles`, no
   * `permissions` and no `lmsuserid`, so it passes when every AccessGuard is
   * the ACCESS type with an empty role list, there is no PlatformGuard, and
   * CheckPermissionsGuard (if present) asks for no permission.
   */
  schoolUserAdmitted: boolean;
  /** The spec file an `owned` route names as proof (`@OrgPolicy("owned", { enforcedBy })`), as declared. */
  enforcedBy: string | undefined;
  /**
   * True when that spec file exists under the repository and has this route's
   * `METHOD /path` in the title of a describe, it or test (specProvesRoute).
   */
  enforcedByProven: boolean;
}

const ROLE_NAMES = new Map<string, string>(
  Object.entries(Role).map(([name, id]) => [id as string, name]),
);
const TOKEN_NAMES = new Map<string, string>(
  Object.entries(TokenType).map(([name, id]) => [id as string, name]),
);

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.ALL]: "ALL",
  [RequestMethod.OPTIONS]: "OPTIONS",
  [RequestMethod.HEAD]: "HEAD",
};

// eslint-disable-next-line @typescript-eslint/ban-types
type GuardRef = Function | object;

const accessInfoOf = (guard: GuardRef): AccessGuardInfo | undefined =>
  (guard as { [ACCESS_GUARD_INFO]?: AccessGuardInfo })[ACCESS_GUARD_INFO];

export const describeGuard = (guard: GuardRef): string => {
  const info = accessInfoOf(guard);
  if (info) {
    const args = [
      TOKEN_NAMES.get(info.tokentype) ?? info.tokentype,
      ...info.roles.map((r) => `Role.${ROLE_NAMES.get(r) ?? r}`),
    ];
    return `AccessGuard(${args.join(", ")})`;
  }
  const name =
    typeof guard === "function" ? guard.name : (guard as object).constructor.name;
  // Nest's mixin() renames a class to a random UUID. A guard like that with no
  // ACCESS_GUARD_INFO is some other factory the inventory cannot read; say so
  // rather than print a name that changes on every run.
  if (UUID_NAME.test(name)) {
    throw new Error(
      "A mixin guard on a route has no ACCESS_GUARD_INFO, so the route inventory cannot read " +
        "its token type or roles. Expose the same descriptor from the guard factory " +
        "(see src/guards/access.guard.ts).",
    );
  }
  return name;
};

const UUID_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const pathsOf = (value: string | string[]): string[] =>
  asArray(value).map((p) => addLeadingSlash(p));

/** Builds the application context from AppModule and the discovery service. */
@Module({ imports: [AppModule, DiscoveryModule] })
class RouteInventoryRootModule {}

/**
 * Modules that carry Nest's RouterModule module-path metadata. Nest prepends
 * that path to every route of the module, which the inventory does not model.
 * RouterModule stores it on the module class under a key that starts with
 * MODULE_PATH (followed by the application id), so any such key counts.
 */
export const modulesWithModulePath = (
  modules: Array<{ name: string }>,
): string[] =>
  modules
    .filter((m) => Reflect.getMetadataKeys(m).some((k) => String(k).startsWith(MODULE_PATH)))
    .map((m) => m.name);

const REPO_ROOT = join(__dirname, "..", "..");

/** A test found in a spec: its full title (enclosing describe titles, then its own) and whether its body calls `expect(`. */
export interface SpecTest {
  title: string;
  hasExpect: boolean;
}

type BlockKind = { block: "describe" | "test"; counts: boolean };

/**
 * What a call's callee is, in jest terms. `describe` and `it`/`test` count, with
 * their `.each(table)(...)` and `.concurrent` forms. Everything that stops a
 * test from running normally does not: `.skip`, `.todo`, `.only` (a focus
 * variant: it silences the other tests), `.failing`, and the `x` and `f`
 * prefixed names (`xit`, `xtest`, `xdescribe`, `fit`, `ftest`, `fdescribe`).
 */
const blockKind = (expr: ts.Expression): BlockKind | undefined => {
  if (ts.isIdentifier(expr)) {
    switch (expr.text) {
      case "describe":
        return { block: "describe", counts: true };
      case "it":
      case "test":
        return { block: "test", counts: true };
      case "xdescribe":
      case "fdescribe":
        return { block: "describe", counts: false };
      case "xit":
      case "xtest":
      case "fit":
      case "ftest":
        return { block: "test", counts: false };
      default:
        return undefined;
    }
  }
  if (ts.isPropertyAccessExpression(expr)) {
    const base = blockKind(expr.expression);
    if (!base) return undefined;
    if (expr.name.text === "each" || expr.name.text === "concurrent") return base;
    if (["skip", "todo", "only", "failing"].includes(expr.name.text)) return { ...base, counts: false };
    return undefined;
  }
  if (ts.isCallExpression(expr)) {
    return blockKind(expr.expression); // describe.each(table)
  }
  return undefined;
};

/** Does this function body contain a call to `expect(` written in it (not one reached through a helper)? */
const callsExpect = (node: ts.Node): boolean => {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "expect") {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
};

/**
 * The tests in a spec's source that run normally, each with its full title and
 * whether its own body calls `expect(`. Read from the syntax tree, so a route
 * string in a comment, a variable or a describe title alone is not a test. A
 * test that is skipped, todo, focused or inside a describe that is, is left out.
 */
export const specTests = (source: string): SpecTest[] => {
  const file = ts.createSourceFile("spec.ts", source, ts.ScriptTarget.ES2020, true);
  const tests: SpecTest[] = [];
  const visit = (node: ts.Node, describes: string[], live: boolean) => {
    if (ts.isCallExpression(node)) {
      const kind = blockKind(node.expression);
      if (kind) {
        const first = node.arguments[0];
        const title =
          first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) ? first.text : undefined;
        const fn = node.arguments.find(
          (a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a),
        );
        const stillLive = live && kind.counts;
        if (kind.block === "describe") {
          if (fn) visit(fn.body, title === undefined ? describes : [...describes, title], stillLive);
          return;
        }
        if (stillLive && title !== undefined) {
          tests.push({ title: [...describes, title].join(" "), hasExpect: fn ? callsExpect(fn.body) : false });
        }
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, describes, live));
  };
  visit(file, [], true);
  return tests;
};

/**
 * Does the spec at `enforcedBy` (path from the repository root) exist, and does
 * a test in it that runs normally have `routeKey` in its full title (enclosing
 * describe titles plus its own) and call `expect(` in its own body?
 *
 * This is a signpost, not proof: it shows that a test naming the route exists
 * and asserts something. Whether those assertions are enough is shown by
 * mutation (break the scoping and watch the spec fail), which the inventory
 * cannot check.
 */
export const specProvesRoute = (enforcedBy: string | undefined, routeKey: string, root = REPO_ROOT): boolean => {
  if (!enforcedBy || isAbsolute(enforcedBy) || normalize(enforcedBy).startsWith("..") || !enforcedBy.endsWith(".spec.ts")) {
    return false;
  }
  const path = join(root, enforcedBy);
  if (!existsSync(path)) {
    return false;
  }
  // The route string must stand alone in the title: `POST /user` is not
  // mentioned by a title about `POST /user/create`.
  const mention = new RegExp(`(^|[^\\w/:.-])${routeKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/:.-])`);
  return specTests(readFileSync(path, "utf8")).some((test) => test.hasExpect && mention.test(test.title));
};

export async function enumerateRoutes(): Promise<RouteRecord[]> {
  const app = await NestFactory.createApplicationContext(
    RouteInventoryRootModule,
    { logger: false },
  );
  try {
    // The inventory rebuilds each path from the metadata alone, which is only
    // right with no global prefix and no versioning. A context built here has
    // no HTTP application config to ask, so versioning metadata is refused
    // below and src/server.ts (where a prefix would be set) is checked by the
    // spec.
    const prefixed = modulesWithModulePath(
      [...app.get(ModulesContainer).values()].map((m) => m.metatype as { name: string }),
    );
    if (prefixed.length > 0) {
      throw new Error(
        `Module-path metadata (RouterModule) is set on ${prefixed.join(", ")}; ` +
          "its paths are prefixed, which the route inventory does not model.",
      );
    }

    const discovery = app.get(DiscoveryService);
    const reflector = new Reflector();
    const scanner = new MetadataScanner();
    const pathFactory = new RoutePathFactory(new ApplicationConfig());
    const routes: RouteRecord[] = [];

    for (const wrapper of discovery.getControllers()) {
      const metatype = wrapper.metatype as { name: string; prototype: object };
      if (!metatype || !wrapper.instance) {
        throw new Error(
          `Controller ${wrapper.name ?? "(unnamed)"} has no ${
            metatype ? "instance (request-scoped or transient?)" : "class"
          }; the route inventory would skip its routes.`,
        );
      }
      if (Reflect.getMetadata(VERSION_METADATA, metatype) !== undefined) {
        throw new Error(`${metatype.name} uses versioning; the route inventory does not model it.`);
      }
      const controllerPaths = pathsOf(
        Reflect.getMetadata(PATH_METADATA, metatype),
      );
      const classGuards: GuardRef[] =
        Reflect.getMetadata(GUARDS_METADATA, metatype) ?? [];

      scanner.scanFromPrototype(wrapper.instance, metatype.prototype, (name) => {
        const handlerFn = (metatype.prototype as Record<string, unknown>)[
          name
        ] as (...args: never[]) => unknown;
        const methodPath = Reflect.getMetadata(PATH_METADATA, handlerFn);
        if (methodPath === undefined) {
          return null; // a plain method, not a route
        }
        if (Reflect.getMetadata(VERSION_METADATA, handlerFn) !== undefined) {
          throw new Error(
            `${metatype.name}.${name} uses versioning; the route inventory does not model it.`,
          );
        }
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handlerFn);
        const handlerGuards: GuardRef[] =
          Reflect.getMetadata(GUARDS_METADATA, handlerFn) ?? [];
        const guards = [...classGuards, ...handlerGuards];
        const access = guards
          .map(accessInfoOf)
          .filter((i): i is AccessGuardInfo => i !== undefined);
        const policy = getOrgPolicy(handlerFn);
        // Exactly what CheckPermissionsGuard asks for.
        const permissions = asArray<string>(
          reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            handlerFn,
            metatype as never,
          ]),
        );
        const hasPlatformGuard = guards.some((g) => g === PlatformGuard);
        const schoolUserAdmitted =
          access.length > 0 &&
          access.every(
            (i) => i.tokentype === TokenType.ACCESS && i.roles.length === 0,
          ) &&
          !hasPlatformGuard &&
          !(guards.some((g) => g === CheckPermissionsGuard) && permissions.length > 0);

        const auth: AuthKind =
          access.length === 0
            ? "none"
            : access.some(
                (i) => i.roles.length > 0 && i.roles.every((r) => r === Role.apikey),
              )
            ? "apikey-only"
            : "token";

        for (const ctrlPath of controllerPaths) {
          for (const mPath of pathsOf(methodPath)) {
            const paths = pathFactory.create(
              {
                ctrlPath,
                methodPath: mPath,
                methodVersion: undefined,
                controllerVersion: undefined,
              } as never,
              requestMethod,
            );
            for (const path of paths) {
              const method = METHOD_NAMES[requestMethod] ?? String(requestMethod);
              routes.push({
                method,
                path,
                controller: metatype.name,
                handler: name,
                policy: policy?.policy,
                note: policy?.note,
                guards: guards.map(describeGuard),
                auth,
                admitsApiKey:
                  access.length > 0 &&
                  access.every((i) => i.roles.includes(Role.apikey)),
                hasPlatformGuard,
                permissions,
                tokenTypes: access.map((i) => TOKEN_NAMES.get(i.tokentype) ?? i.tokentype),
                schoolUserAdmitted,
                enforcedBy: policy?.enforcedBy,
                enforcedByProven:
                  policy?.policy === "owned" && specProvesRoute(policy.enforcedBy, `${method} ${path}`),
              });
            }
          }
        }
        return null;
      });
    }
    return routes.sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        a.method.localeCompare(b.method) ||
        a.controller.localeCompare(b.controller) ||
        a.handler.localeCompare(b.handler),
    );
  } finally {
    await app.close();
  }
}

export const POLICY_NAMES: readonly string[] = ORG_POLICIES;

export const isKnownPolicy = (policy: unknown): policy is OrgPolicyName =>
  typeof policy === "string" && POLICY_NAMES.includes(policy);

/** Total routes and routes per policy, with undeclared ones under "(none)". */
export const countByPolicy = (routes: RouteRecord[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const name of POLICY_NAMES) {
    counts[name] = 0;
  }
  for (const route of routes) {
    const key = route.policy ?? "(none)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

/**
 * Declaring a policy does not enforce it. A route is "pending enforcement"
 * while its policy is declared but no guard backs it: every `platform` route
 * without PlatformGuard, every `owned` route, every `server` route. `public`,
 * `self` and `global` have nothing further to enforce here (their guards are
 * the access guard they already have). As later work packages add the guards
 * and query filters, routes leave this list (and the snapshot that pins it,
 * pending-enforcement.snapshot.txt).
 */
export const isPendingEnforcement = (route: RouteRecord): boolean =>
  (route.policy === "platform" && !route.hasPlatformGuard) ||
  (route.policy === "owned" && !route.enforcedByProven) ||
  route.policy === "server";

/**
 * `yes`: a guard backs the policy (self and global routes, and platform routes
 * with PlatformGuard), or an `owned` route names a spec that proves it
 * (`enforcedBy`, see specProvesRoute). `n/a`: public routes, which no guard
 * backs and none is needed. `pending`: see isPendingEnforcement.
 */
export type EnforcementState = "yes" | "n/a" | "pending";
export const enforcementState = (r: RouteRecord): EnforcementState =>
  isPendingEnforcement(r) ? "pending" : r.policy === "public" ? "n/a" : "yes";

/** Said in the generated document and in the snapshot header. */
export const PENDING_MEANING =
  "Pending refers only to the organisation boundary; every route keeps the authentication and permission guards shown in the Guards column.";

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The policy as written in the snapshot: `owned`, or `owned+apikey`. */
export const policyLabel = (r: RouteRecord): string =>
  `${r.policy ?? "(none)"}${r.admitsApiKey ? "+apikey" : ""}`;

export const PENDING_SNAPSHOT_HEADER = [
  "# Routes whose organisation policy is declared but not yet enforced by a guard.",
  "# Enforcement arrives in a later package; entries are removed as it does.",
  `# ${PENDING_MEANING}`,
  "# One route per line, sorted by path then method: METHOD /path  policy",
  "# `+apikey` marks a route whose guards also admit the application API key.",
  "# Generated: `npm run routes:policy -- --write`. Checked by route-inventory.spec.ts.",
];

/** The snapshot body, sorted, one `METHOD /path  policy` per line. */
export const pendingEnforcementLines = (routes: RouteRecord[]): string[] =>
  routes
    .filter(isPendingEnforcement)
    .map((r) => ({ key: `${r.path}\u0000${r.method}`, line: `${r.method} ${r.path}  ${policyLabel(r)}` }))
    .sort((a, b) => byCodeUnits(a.key, b.key))
    .map((x) => x.line);

export const renderPendingSnapshot = (routes: RouteRecord[]): string =>
  [...PENDING_SNAPSHOT_HEADER, ...pendingEnforcementLines(routes)].join("\n") + "\n";

/** Parses a snapshot file back to its lines, ignoring comments and blanks. */
export const parsePendingSnapshot = (text: string): string[] =>
  text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));

const cell = (value: string): string => value.replace(/\|/g, "\\|").replace(/\n/g, " ");

const guardsCell = (r: RouteRecord): string => {
  const guards = r.guards.map((g) =>
    g === "CheckPermissionsGuard" && r.permissions.length > 0
      ? `CheckPermissionsGuard[${r.permissions.join(", ")}]`
      : g,
  );
  return guards.length > 0 ? guards.join(", ") : "none";
};

export const INVENTORY_DOC_PATH = "docs/route-policy-inventory.md";

/**
 * The committed inventory document. Deterministic (no dates, no counts that
 * are not derived from the routes), so route-inventory.spec.ts can compare it
 * byte for byte with what is committed.
 */
export const renderInventoryMarkdown = (routes: RouteRecord[]): string => {
  const pending = routes.filter(isPendingEnforcement).length;
  const notApplicable = routes.filter((r) => enforcementState(r) === "n/a").length;
  const enforced = routes.length - pending - notApplicable;
  const apiKey = routes.filter((r) => r.admitsApiKey);
  const schoolUser = routes.filter((r) => r.schoolUserAdmitted);
  const ordered = [...routes].sort(
    (a, b) =>
      byCodeUnits(a.controller, b.controller) ||
      byCodeUnits(a.path, b.path) ||
      byCodeUnits(a.method, b.method),
  );
  const lines: string[] = [
    "# Route policy inventory",
    "",
    "<!-- GENERATED FILE. Do not edit by hand. -->",
    "",
    "**Generated file.** It lists every route the application registers and the",
    "organisation policy each one declares with `@OrgPolicy`",
    "(`src/decorators/orgPolicy.decorator.ts`). Regenerate it with:",
    "",
    "```",
    "npm run routes:policy -- --write",
    "```",
    "",
    "`src/route-policy/route-inventory.spec.ts` fails when this file is out of",
    "date, and when a route has no policy.",
    "",
    "## Enforced and pending",
    "",
    "A policy is a requirement on the routes that declare it. Declaring one does",
    "not enforce it: enforcement arrives in later packages. The **Enforced**",
    "column says which routes are already backed (`yes`) and which are not yet",
    "(`pending`); `public` routes show `n/a`, because nothing backs them. A guard",
    "backs a route; an `owned` route counts as enforced only when it names, with",
    "`@OrgPolicy(\"owned\", { enforcedBy })`, a spec file that exists and has the",
    "route's `METHOD /path` in the title of a test that runs and calls `expect(`",
    "(the **Proved by** column). That is a signpost: it shows that a test naming",
    "the route exists and asserts something; whether its assertions are",
    "sufficient is shown by mutation, not by the inventory. The",
    "pending routes are pinned in",
    "`src/route-policy/pending-enforcement.snapshot.txt`.",
    "",
    PENDING_MEANING,
    "",
    `Of **${routes.length}** routes, **${enforced}** are enforced (by a guard: self, global, and platform routes with \`PlatformGuard\`; or, for an owned route, by the spec it names), **${notApplicable}** are not applicable (public) and **${pending}** are pending.`,
    "",
    "| Policy | Routes | Enforced | Not applicable | Pending |",
    "|---|---|---|---|---|",
    ...POLICY_NAMES.map((p) => {
      const n = routes.filter((r) => r.policy === p);
      const count = (s: EnforcementState) => n.filter((r) => enforcementState(r) === s).length;
      return `| ${p} | ${n.length} | ${count("yes")} | ${count("n/a")} | ${count("pending")} |`;
    }),
    `| **all** | **${routes.length}** | **${enforced}** | **${notApplicable}** | **${pending}** |`,
    "",
    "## Policies",
    "",
    "Each policy states what a route that declares it must satisfy.",
    "",
    ...POLICY_NAMES.map((p) => `- \`${p}\`: ${ORG_POLICY_DEFINITIONS[p as OrgPolicyName]}`),
    "",
    ORG_POLICY_TIE_BREAK,
    "",
    "## Columns",
    "",
    "- **Enforced**: `yes` when a guard already backs the policy, or an `owned` route has a spec that proves it; `n/a` for `public` routes (nothing backs them); `pending` otherwise.",
    "- **Proved by**: for an `owned` route that is enforced, the spec file named by `enforcedBy`.",
    "- **API key**: `yes` when every `AccessGuard` on the route lists the application API key, so a caller with no user gets through.",
    "- **School-user token**: `yes` when a school-user (teacher or classroom device) access token gets through every guard on the route, derived from the guard metadata: every `AccessGuard` is the access token type with no role list, there is no `PlatformGuard`, and no permission is required. Feature switches such as `LogImportGuard` aside.",
    "",
    `Routes admitting the API key: ${apiKey.length}. Routes admitting a school-user token: ${schoolUser.length}.`,
    "",
    "## Routes",
    "",
    "| Method | Path | Handler | Policy | Enforced | Proved by | API key | School-user token | Guards | Note |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...ordered.map(
      (r) =>
        `| ${r.method} | \`${cell(r.path)}\` | ${r.controller}.${r.handler} | ${r.policy ?? "(none)"} | ${enforcementState(r)} | ${r.enforcedByProven ? `\`${r.enforcedBy}\`` : ""} | ${r.admitsApiKey ? "yes" : ""} | ${r.schoolUserAdmitted ? "yes" : ""} | ${cell(guardsCell(r))} | ${cell(
          r.note ?? "",
        )} |`,
    ),
    "",
  ];
  return lines.join("\n");
};

const label = (r: RouteRecord): string =>
  `${r.method} ${r.path} (${r.controller}.${r.handler})`;

/** Routes with no @OrgPolicy at all. */
export const routesWithoutPolicy = (routes: RouteRecord[]): string[] =>
  routes.filter((r) => r.policy === undefined).map(label);

/** Routes whose declared policy is not one of ORG_POLICIES. */
export const routesWithUnknownPolicy = (routes: RouteRecord[]): string[] =>
  routes
    .filter((r) => r.policy !== undefined && !isKnownPolicy(r.policy))
    .map((r) => `${label(r)} declares ${JSON.stringify(r.policy)}`);

/** Method + path pairs that more than one handler resolves to. */
export const duplicateRoutes = (routes: RouteRecord[]): string[] => {
  const seen = new Map<string, RouteRecord[]>();
  for (const r of routes) {
    const key = `${r.method} ${r.path}`;
    seen.set(key, [...(seen.get(key) ?? []), r]);
  }
  return [...seen.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => `${key}: ${list.map((r) => `${r.controller}.${r.handler}`).join(", ")}`);
};

const key = (r: RouteRecord): string => `${r.method} ${r.path}`;

/**
 * `global` routes read data no organisation owns, for staff. They must admit
 * only staff access tokens: every AccessGuard is the ACCESS type, no school-user
 * token and no API key gets through, and they are not PlatformGuard routes
 * (that would make them `platform`).
 */
export const globalRouteViolations = (routes: RouteRecord[]): string[] =>
  routes
    .filter((r) => r.policy === "global")
    .flatMap((r) => {
      const why: string[] = [];
      if (r.tokenTypes.length === 0) why.push("has no AccessGuard");
      if (r.tokenTypes.some((t) => t !== "ACCESS")) why.push("accepts a non-ACCESS token type");
      if (r.hasPlatformGuard) why.push("has PlatformGuard (should be `platform`)");
      if (r.admitsApiKey) why.push("admits the API key");
      if (r.schoolUserAdmitted) why.push("admits a school-user token");
      return why.map((w) => `${key(r)}: ${w}`);
    });

/**
 * `self` must not become a place to park routes that need no real check: every
 * `self` route authenticates with a refresh, change-password or email-
 * verification token through its guard, or is a named exception that checks the
 * token in the handler.
 */
export const selfRouteViolations = (
  routes: RouteRecord[],
  authenticatedInHandler: readonly string[],
): string[] =>
  routes
    .filter((r) => r.policy === "self")
    .filter(
      (r) =>
        !(
          (r.tokenTypes.length > 0 && r.tokenTypes.every((t) => t !== "ACCESS")) ||
          authenticatedInHandler.includes(key(r))
        ),
    )
    .map((r) => `${key(r)}: neither a non-ACCESS token guard nor a named handler-authenticated exception`);
