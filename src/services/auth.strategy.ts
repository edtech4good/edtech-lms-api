import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";
import { TokenBusiness } from "src/business";
import { STAFF_SCHOOL_ROLES } from "src/models/enums/school.role.enum";
import { TokenType } from "./../models/enums";
import { jwtoptionsbuilder } from "./util.service";

const validateToken = async (payload: any, expectedType: TokenType) => {
  if (await new TokenBusiness().tokenExists(payload.jti, expectedType)) {
    return { ...payload };
  } else {
    throw new UnauthorizedException();
  }
};

/**
 * Does this ACCESS-token payload carry the organisation claims every staff
 * token has? `organisationid` must be present (a string, or null for "no
 * organisation": absent is not the same as null) and `isplatform` must be a
 * boolean. A staff token minted before these claims existed has neither, so it
 * is refused and its owner signs in again.
 */
export const hasOrganisationClaims = (payload: any): boolean =>
  payload !== null &&
  typeof payload === "object" &&
  (payload.organisationid === null || typeof payload.organisationid === "string") &&
  typeof payload.isplatform === "boolean";

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  `jwt-${TokenType.ACCESS}`
) {
  constructor() {
    super(jwtoptionsbuilder(TokenType.ACCESS));
  }

  async validate(payload: any) {
    const user = await validateToken(payload, TokenType.ACCESS);
    // A school-user token (has `schooluserid`) for a non-staff account must
    // be refused on every ACCESS-guarded route, not just the ones that
    // happen to check the role themselves - including read-only routes, and
    // including a token already issued before auth/school/login started
    // enforcing this (a 60-minute access token otherwise stays valid for
    // its full lifetime). An lmsuser token never carries `schooluserid`, so
    // this never touches that path. (#90.)
    if (user.schooluserid) {
      if (!STAFF_SCHOOL_ROLES.includes(user.schooluserrole)) {
        throw new UnauthorizedException();
      }
      // A school-user (teacher) token is a different shape: it has no
      // organisation claims in this package.
      return user;
    }
    // Everything else is a staff (lmsusers) access token, and fails closed: a
    // token without the organisation claims predates them (or was not issued
    // by this server) and is refused, so its owner signs in again.
    if (!hasOrganisationClaims(user)) {
      throw new UnauthorizedException();
    }
    return user;
  }
}

@Injectable()
export class JwtRPIAccessStrategy extends PassportStrategy(
  Strategy,
  `jwt-${TokenType.RPIACCESS}`
) {
  constructor() {
    super(jwtoptionsbuilder(TokenType.RPIACCESS));
  }

  async validate(payload: any) {
    return { ...payload };
  }
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  `jwt-${TokenType.REFRESH}`
) {
  constructor() {
    super(jwtoptionsbuilder(TokenType.REFRESH));
  }

  async validate(payload: any) {
    return validateToken(payload, TokenType.REFRESH);
  }
}

@Injectable()
export class JwtChangePasswordStrategy extends PassportStrategy(
  Strategy,
  `jwt-${TokenType.CHANGEPASSWORD}`
) {
  constructor() {
    super(jwtoptionsbuilder(TokenType.CHANGEPASSWORD));
  }

  async validate(payload: any) {
    return validateToken(payload, TokenType.CHANGEPASSWORD);
  }
}

@Injectable()
export class JwtVerifyEmailStrategy extends PassportStrategy(
  Strategy,
  `jwt-${TokenType.VERIFYEMAIL}`
) {
  constructor() {
    super(jwtoptionsbuilder(TokenType.VERIFYEMAIL));
  }

  async validate(payload: any) {
    return validateToken(payload, TokenType.VERIFYEMAIL);
  }
}
