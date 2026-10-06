import { SetMetadata } from "@nestjs/common";

/**
 * The organisation policy of a route (docs/admin-organisations-schema.md §8,
 * "Filtering: explicit scoping plus a route inventory"). Several organisations
 * share this API, so every route handler states which of these applies to it.
 * Declaring a policy does not enforce it: later work packages add the guards
 * and query filters. The route inventory test (src/route-policy/
 * route-inventory.spec.ts) keeps the declarations complete, and
 * docs/route-policy-inventory.md shows which routes are enforced today.
 *
 * The policies. Each is a requirement on the routes that declare it:
 *
 *  - `public`   Has no AccessGuard; reachable without authentication (rate
 *               limiting is not authentication). Returns nothing
 *               organisation-owned except what the request itself proves (for
 *               example a reset token) or what is deliberately published
 *               before sign-in (school branding).
 *  - `self`     Acts only on the account or session named by the token that
 *               authenticates the request: an access token, or a refresh,
 *               change-password or email-verification token. The token may be
 *               checked by a guard or, for named exceptions, in the handler.
 *               It never reads or writes another account's data.
 *  - `owned`    Operates on rows that belong to an organisation, directly or
 *               through a parent, or on global rows an organisation sees
 *               through a link (countries through `organisationcountry`). For
 *               an organisation's staff, and for a platform user acting as an
 *               organisation, every read, list, write and attach must be
 *               limited to that organisation; another organisation's row is
 *               not found. For a school-user (teacher) token, the organisation
 *               is the one that owns the token's school, and the route may
 *               narrow further to that school. A platform user who is not
 *               acting as an organisation may read and list across
 *               organisations; a create, or an export or push that targets one
 *               organisation, must have that organisation named explicitly: by
 *               the organisation the token acts in, or, for a platform user who
 *               is not acting, by a dedicated `organisationid` field checked
 *               against live organisations. It is never inferred from a list
 *               filter or from another row the request names, and a caller
 *               acting in an organisation cannot name a different one. A route
 *               that also admits the application API key is marked as such;
 *               that caller is treated as platform.
 *  - `platform` Must be restricted to platform users as `PlatformGuard`
 *               defines them: organisation management, writes to global
 *               reference data (countries, roles, permissions), and operations
 *               that act on every organisation at once with no scope (bulk
 *               recomputes, one-off migrations).
 *  - `server`   Authenticated only by the application API key. Carries no user
 *               and no organisation; must be served as platform until the key
 *               is retired or scoped.
 *  - `global`   Requires a staff access token. Reads global reference data
 *               that no organisation owns and that is the same for every
 *               organisation (roles, the permission catalogue). There is no
 *               organisation filter. Any rule about what a kind of caller may
 *               be offered is enforced where the data is used, not here.
 *               Writes to global data are `platform`.
 *
 * A route used by both a user token and the API key is classified by its user
 * path; the key path is recorded separately.
 *
 * Put it on the handler method, next to the other route decorators:
 *
 *     @OrgPolicy("owned")
 *     @OrgPolicy("owned", { note: "Must list only the linked countries." })
 *     @OrgPolicy("owned", { enforcedBy: "src/modules/user/user.organisation-scope.spec.ts" })
 *     @OrgPolicy("server", { enforcedBy: "src/modules/sync/sync-scope.leak.spec.ts" })
 *
 * An `owned` or `server` route counts as enforced in the inventory only when it
 * names, with `enforcedBy`, a spec file under `src/` (path from the repository
 * root) that exists and has a test that runs (not skipped, todo or focused,
 * and not inside a describe that is) with the route's `METHOD /path` (as the inventory prints
 * it, for example `PUT /user/:lmsuserid`) in its full title (enclosing describe
 * titles and its own) and a direct `expect(` call in its body. A signpost, not
 * proof. For an `owned` route the spec is what proves the route limits every
 * read and write to the caller's organisation; for a `server` route it is what
 * proves that only the application API key gets in and that the key is served
 * as the platform. A route without the option, or naming a spec that does not
 * mention it, stays pending.
 *
 * The optional `note` is a short reason where the choice is not obvious (for
 * example a route that mixes concerns). State what the route REQUIRES.
 */
export const ORG_POLICIES = [
  "public",
  "self",
  "owned",
  "platform",
  "server",
  "global",
] as const;

/**
 * The definitions above, as data, so the generated inventory document can
 * reuse them word for word. route-inventory.spec.ts checks that each one
 * still appears in the doc comment above, so the two cannot drift apart.
 */
export const ORG_POLICY_DEFINITIONS: Record<(typeof ORG_POLICIES)[number], string> = {
  public:
    "Has no AccessGuard; reachable without authentication (rate limiting is not authentication). Returns nothing organisation-owned except what the request itself proves (for example a reset token) or what is deliberately published before sign-in (school branding).",
  self:
    "Acts only on the account or session named by the token that authenticates the request: an access token, or a refresh, change-password or email-verification token. The token may be checked by a guard or, for named exceptions, in the handler. It never reads or writes another account's data.",
  owned:
    "Operates on rows that belong to an organisation, directly or through a parent, or on global rows an organisation sees through a link (countries through `organisationcountry`). For an organisation's staff, and for a platform user acting as an organisation, every read, list, write and attach must be limited to that organisation; another organisation's row is not found. For a school-user (teacher) token, the organisation is the one that owns the token's school, and the route may narrow further to that school. A platform user who is not acting as an organisation may read and list across organisations; a create, or an export or push that targets one organisation, must have that organisation named explicitly: by the organisation the token acts in, or, for a platform user who is not acting, by a dedicated `organisationid` field checked against live organisations. It is never inferred from a list filter or from another row the request names, and a caller acting in an organisation cannot name a different one. A route that also admits the application API key is marked as such; that caller is treated as platform.",
  platform:
    "Must be restricted to platform users as `PlatformGuard` defines them: organisation management, writes to global reference data (countries, roles, permissions), and operations that act on every organisation at once with no scope (bulk recomputes, one-off migrations).",
  server:
    "Authenticated only by the application API key. Carries no user and no organisation; must be served as platform until the key is retired or scoped.",
  global:
    "Requires a staff access token. Reads global reference data that no organisation owns and that is the same for every organisation (roles, the permission catalogue). There is no organisation filter. Any rule about what a kind of caller may be offered is enforced where the data is used, not here. Writes to global data are `platform`.",
};

export const ORG_POLICY_TIE_BREAK =
  "A route used by both a user token and the API key is classified by its user path; the key path is recorded separately.";

export type OrgPolicyName = (typeof ORG_POLICIES)[number];

export interface OrgPolicyOptions {
  note?: string;
  /**
   * For `owned` and `server` routes: the spec file that proves the route is limited to the caller's organisation
   * (`owned`), or admits only the application API key and serves it as the platform (`server`).
   */
  enforcedBy?: string;
}

export interface OrgPolicyMetadata {
  policy: OrgPolicyName;
  note?: string;
  enforcedBy?: string;
}

export const ORG_POLICY_KEY = "orgpolicy";

export const OrgPolicy = (
  policy: OrgPolicyName,
  options: OrgPolicyOptions = {},
): MethodDecorator =>
  SetMetadata<string, OrgPolicyMetadata>(ORG_POLICY_KEY, {
    policy,
    ...(options.note === undefined ? {} : { note: options.note }),
    ...(options.enforcedBy === undefined ? {} : { enforcedBy: options.enforcedBy }),
  });

/**
 * Reads the policy declared on a route handler. Takes the handler function
 * (`Controller.prototype.method`), so it works without a Nest execution
 * context. Returns `undefined` when the handler declares none. The value is
 * returned as stored, not validated: the inventory test checks it against
 * ORG_POLICIES.
 */
export const getOrgPolicy = (
  handler: (...args: never[]) => unknown,
): OrgPolicyMetadata | undefined =>
  Reflect.getMetadata(ORG_POLICY_KEY, handler) as OrgPolicyMetadata | undefined;
