import { SetMetadata } from "@nestjs/common";

/**
 * The organisation policy of a route (docs/admin-organisations-schema.md §8,
 * "Filtering: explicit scoping plus a route inventory"). Several organisations
 * share this API, so every route handler states which of these applies to it.
 * Declaring a policy does not enforce it: later work packages add the guards
 * and query filters, and the route inventory test
 * (src/route-policy/route-inventory.spec.ts) keeps the list honest.
 *
 * The policies, and exactly what each one means:
 *
 *  - `public`   Reachable without authentication (sign-in, password reset,
 *               health, public verification). Handles no organisation-owned
 *               data beyond what the caller proves by the request itself.
 *  - `self`     Requires authentication and acts only on the caller's own
 *               account or session (profile, change password, refresh, sign
 *               out).
 *  - `owned`    Operates on organisation-owned data (schools, classes,
 *               learners, teachers, staff accounts, curricula and everything
 *               under them, questions, documents, tags, subjects, baselines,
 *               feedback, reports, sync records). Must be limited to the
 *               caller's organisation; a platform caller acting as an
 *               organisation is limited the same way.
 *  - `platform` Only platform staff: organisation management, creating or
 *               editing countries and other global reference data, roles and
 *               permissions administration, platform-wide operations.
 *  - `server`   Server-to-server routes authenticated by the application API
 *               key or a sync key, carrying no user. They must be given an
 *               organisation by an explicit scope or be restricted to platform
 *               use.
 *
 * Put it on the handler method, next to the other route decorators:
 *
 *     @OrgPolicy("owned")
 *     @OrgPolicy("owned", { note: "lists global data, filtered per organisation" })
 *
 * The optional `note` is a short reason where the choice is not obvious (for
 * example a route that mixes concerns, classified by its most restrictive
 * need).
 */
export const ORG_POLICIES = [
  "public",
  "self",
  "owned",
  "platform",
  "server",
] as const;

export type OrgPolicyName = (typeof ORG_POLICIES)[number];

export interface OrgPolicyOptions {
  note?: string;
}

export interface OrgPolicyMetadata {
  policy: OrgPolicyName;
  note?: string;
}

export const ORG_POLICY_KEY = "orgpolicy";

export const OrgPolicy = (
  policy: OrgPolicyName,
  options: OrgPolicyOptions = {},
): MethodDecorator =>
  SetMetadata<string, OrgPolicyMetadata>(
    ORG_POLICY_KEY,
    options.note === undefined ? { policy } : { policy, note: options.note },
  );

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
