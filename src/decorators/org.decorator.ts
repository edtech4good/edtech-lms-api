import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";

/** The organisation context of a validated staff access token. */
export interface OrgContext {
  /** The organisation the token acts in, or null for none. */
  organisationid: string | null;
  /** True for a platform user, including while acting as an organisation. */
  isplatform: boolean;
}

/**
 * Reads the organisation context from the staff token that authenticated the
 * request. The values are exactly what `JwtAccessStrategy` validated and
 * `AccessGuard` placed on `request.user`; they never come from a header, a
 * query string or a body.
 *
 * Throws 401 when the request has no staff user: no user at all, the
 * application API key (`{ user: "API KEY" }`), a school-user token, or a
 * staff-shaped value whose organisation claims are not well formed. Use it on
 * a route that has `AccessGuard(TokenType.ACCESS)`.
 */
export const orgOf = (user: unknown): OrgContext => {
  if (typeof user !== "object" || user === null) {
    throw new UnauthorizedException();
  }
  const { lmsuserid, organisationid, isplatform } = user as {
    lmsuserid?: unknown;
    organisationid?: unknown;
    isplatform?: unknown;
  };
  if (
    typeof lmsuserid !== "string" ||
    lmsuserid.length === 0 ||
    !(organisationid === null || typeof organisationid === "string") ||
    typeof isplatform !== "boolean"
  ) {
    throw new UnauthorizedException();
  }
  return { organisationid, isplatform };
};

export const Org = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext =>
    orgOf(ctx.switchToHttp().getRequest()?.user),
);
