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
