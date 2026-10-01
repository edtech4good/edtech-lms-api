import "reflect-metadata";
import { Module, RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { addLeadingSlash } from "@nestjs/common/utils/shared.utils";
import {
  ApplicationConfig,
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
  NestFactory,
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
  OrgPolicyName,
} from "src/decorators/orgPolicy.decorator";
import { PERMISSIONS_KEY } from "src/decorators/requirePermissions.decorator";
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
  permissions: string[];
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

const describeGuard = (guard: GuardRef): string => {
  const info = accessInfoOf(guard);
  if (info) {
    const args = [
      TOKEN_NAMES.get(info.tokentype) ?? info.tokentype,
      ...info.roles.map((r) => `Role.${ROLE_NAMES.get(r) ?? r}`),
    ];
    return `AccessGuard(${args.join(", ")})`;
  }
  if (typeof guard === "function") {
    return guard.name;
  }
  return (guard as object).constructor.name;
};

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const pathsOf = (value: string | string[]): string[] =>
  asArray(value).map((p) => addLeadingSlash(p));

/** Builds the application context from AppModule and the discovery service. */
@Module({ imports: [AppModule, DiscoveryModule] })
class RouteInventoryRootModule {}

export async function enumerateRoutes(): Promise<RouteRecord[]> {
  const app = await NestFactory.createApplicationContext(
    RouteInventoryRootModule,
    { logger: false },
  );
  try {
    const discovery = app.get(DiscoveryService);
    const scanner = new MetadataScanner();
    const pathFactory = new RoutePathFactory(new ApplicationConfig());
    const routes: RouteRecord[] = [];

    for (const wrapper of discovery.getControllers()) {
      const metatype = wrapper.metatype as { name: string; prototype: object };
      if (!metatype || !wrapper.instance) {
        continue;
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
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handlerFn);
        const handlerGuards: GuardRef[] =
          Reflect.getMetadata(GUARDS_METADATA, handlerFn) ?? [];
        const guards = [...classGuards, ...handlerGuards];
        const access = guards
          .map(accessInfoOf)
          .filter((i): i is AccessGuardInfo => i !== undefined);
        const policy = getOrgPolicy(handlerFn);
        const permissions: string[] = [];
        for (const target of [handlerFn, metatype]) {
          permissions.push(
            ...asArray<string>(Reflect.getMetadata(PERMISSIONS_KEY, target)),
          );
        }

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
              routes.push({
                method: METHOD_NAMES[requestMethod] ?? String(requestMethod),
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
                hasPlatformGuard: guards.some((g) => g === PlatformGuard),
                permissions: [...new Set(permissions)],
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
 * without PlatformGuard, every `owned` route, every `server` route. `public`
 * and `self` have nothing further to enforce. As later work packages add the
 * guards and query filters, routes leave this list (and the snapshot that
 * pins it, pending-enforcement.snapshot.txt).
 */
export const isPendingEnforcement = (route: RouteRecord): boolean =>
  (route.policy === "platform" && !route.hasPlatformGuard) ||
  route.policy === "owned" ||
  route.policy === "server";

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const PENDING_SNAPSHOT_HEADER = [
  "# Routes whose organisation policy is declared but not yet enforced by a guard.",
  "# Enforcement arrives in a later package; entries are removed as it does.",
  "# One route per line, sorted by path then method: METHOD /path  policy",
  "# Generated: `npm run routes:policy -- --write`. Checked by route-inventory.spec.ts.",
];

/** The snapshot body, sorted, one `METHOD /path  policy` per line. */
export const pendingEnforcementLines = (routes: RouteRecord[]): string[] =>
  routes
    .filter(isPendingEnforcement)
    .map((r) => ({ key: `${r.path}\u0000${r.method}`, line: `${r.method} ${r.path}  ${r.policy}` }))
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
  const counts = countByPolicy(routes);
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
    "date, and when a route has no policy. A policy states what a route REQUIRES;",
    "enforcement of each policy arrives in later packages, tracked by",
    "`src/route-policy/pending-enforcement.snapshot.txt`.",
    "",
    "Policies:",
    "",
    "- `public`: reachable without authentication.",
    "- `self`: requires authentication; acts only on the caller's own account or session.",
    "- `owned`: operates on organisation-owned data; limited to the caller's organisation.",
    "- `platform`: platform staff only.",
    "- `server`: server-to-server (application API key or sync key), no user; needs an explicit organisation scope or platform-only use.",
    "",
    `Total: **${routes.length}** routes. ` +
      POLICY_NAMES.map((p) => `${p} ${counts[p]}`).join(", ") +
      ".",
    "",
    "| Method | Path | Handler | Policy | Guards | Note |",
    "|---|---|---|---|---|---|",
    ...ordered.map(
      (r) =>
        `| ${r.method} | \`${cell(r.path)}\` | ${r.controller}.${r.handler} | ${r.policy ?? "(none)"} | ${cell(
          guardsCell(r),
        )} | ${cell(r.note ?? "")} |`,
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
