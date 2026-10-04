import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { hasOrganisationClaims, hasSchoolUserId } from "src/services/organisation-claims";

/** The organisation context of a validated staff access token. */
export interface OrgContext {
  /** The organisation the token acts in, or null for none. */
  organisationid: string | null;
  /** True for a platform user, including while acting as an organisation. */
  isplatform: boolean;
  /**
   * The permission names the validated token carries (what the caller holds
   * now), strings only. Used to bound the roles an organisation's staff may add
   * to an account; absent means none (fail closed).
   */
  permissions?: ReadonlyArray<string>;
}

/**
 * Reads the organisation context from the staff token that authenticated the
 * request. The values are exactly what `JwtAccessStrategy` validated and
 * `AccessGuard` placed on `request.user`; they never come from a header, a
 * query string or a body.
 *
 * Throws 401 when the request has no staff user: no user at all, the
 * application API key (`{ user: "API KEY" }`), a school-user token (including one that also carries staff claims), or a
 * staff-shaped value whose organisation claims are not well formed. Use it on
 * a route that has `AccessGuard(TokenType.ACCESS)`.
 */
export const orgOf = (user: unknown): OrgContext => {
  if (typeof user !== "object" || user === null || hasSchoolUserId(user)) {
    throw new UnauthorizedException();
  }
  const { lmsuserid, organisationid, isplatform, permissions } = user as {
    lmsuserid?: unknown;
    organisationid?: unknown;
    isplatform?: unknown;
    permissions?: unknown;
  };
  if (
    typeof lmsuserid !== "string" ||
    lmsuserid.length === 0 ||
    !hasOrganisationClaims(user)
  ) {
    throw new UnauthorizedException();
  }
  return {
    organisationid: organisationid as string | null,
    isplatform: isplatform as boolean,
    permissions: Array.isArray(permissions) ? permissions.filter((p): p is string => typeof p === "string") : [],
  };
};

export const Org = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext =>
    orgOf(ctx.switchToHttp().getRequest()?.user),
);

/**
 * The application API key carries no user and no organisation. The guard hands
 * the handler `{ user: "API KEY" }` (and nothing else) when the key was the
 * credential, on a route that lists the key among its roles.
 */
export const isServerCaller = (user: unknown): boolean =>
  typeof user === "object" &&
  user !== null &&
  (user as { user?: unknown }).user === "API KEY" &&
  Object.keys(user).length === 1;

/** What the application API key is served as until it has an organisation of its own: the platform, not acting as any organisation. */
export const SERVER_CALLER_CONTEXT: OrgContext = Object.freeze({
  organisationid: null,
  isplatform: true,
  permissions: [],
});

/**
 * `orgOf` for a route that also admits the application API key: the key is
 * served as the platform (see SERVER_CALLER_CONTEXT), every other caller as
 * `orgOf` says. Use it only on a route whose AccessGuard lists `Role.apikey`.
 */
export const orgOrServerOf = (user: unknown): OrgContext =>
  isServerCaller(user) ? { ...SERVER_CALLER_CONTEXT, permissions: [] } : orgOf(user);

export const OrgOrServer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext =>
    orgOrServerOf(ctx.switchToHttp().getRequest()?.user),
);

/**
 * `orgOf` for a route that also admits a school-user (teacher) token: a school-user token has no organisation
 * context here and keeps its behaviour (`undefined`: no limit), every staff token is read as `orgOf` says. Use it
 * only on a route whose guards let a school-user token through (the route inventory lists them).
 */
export const orgOrSchoolUserOf = (user: unknown): OrgContext | undefined =>
  hasSchoolUserId(user) ? undefined : orgOf(user);

export const OrgOrSchoolUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext | undefined =>
    orgOrSchoolUserOf(ctx.switchToHttp().getRequest()?.user),
);
