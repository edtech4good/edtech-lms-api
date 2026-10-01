import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";
import { TokenBusiness } from "src/business";
import { STAFF_SCHOOL_ROLES } from "src/models/enums/school.role.enum";
import { TokenType } from "./../models/enums";
import { jwtoptionsbuilder } from "./util.service";
import {
  hasOrganisationClaims,
  hasSchoolUserId,
  isMixedShape,
} from "./organisation-claims";

const validateToken = async (payload: any, expectedType: TokenType) => {
  if (await new TokenBusiness().tokenExists(payload.jti, expectedType)) {
    return { ...payload };
  } else {
    throw new UnauthorizedException();
  }
};

export { hasOrganisationClaims };

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  `jwt-${TokenType.ACCESS}`
) {
  constructor() {
    super(jwtoptionsbuilder(TokenType.ACCESS));
  }

  async validate(payload: any) {
    // A payload that mixes the two shapes is neither: refused outright.
    if (isMixedShape(payload)) {
      throw new UnauthorizedException();
    }
    if (hasSchoolUserId(payload)) {
      const user = await validateToken(payload, TokenType.ACCESS);
      // A school-user token (has `schooluserid`) for a non-staff account must
      // be refused on every ACCESS-guarded route, not just the ones that
      // happen to check the role themselves - including read-only routes, and
      // including a token already issued before auth/school/login started
      // enforcing this (a 60-minute access token otherwise stays valid for
      // its full lifetime). (#90.)
      if (!STAFF_SCHOOL_ROLES.includes(user.schooluserrole)) {
        throw new UnauthorizedException();
      }
      // A school-user (teacher) token is a different shape: it has no
      // organisation claims in this package, and keeps the plain token lookup.
      return user;
    }
    // Everything else is a staff (lmsusers) access token, and fails closed: a
    // token without the organisation claims predates them (or was not issued
    // by this server) and is refused, so its owner signs in again.
    if (!hasOrganisationClaims(payload)) {
      throw new UnauthorizedException();
    }
    // One query decides whether the token is still good: its row exists, the
    // user is enabled, the organisation it acts in is live and active, and the
    // claims still match the user as the database has them now.
    if (!(await new TokenBusiness().validateStaffAccessToken(payload))) {
      throw new UnauthorizedException();
    }
    return { ...payload };
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
