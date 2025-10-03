import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";
import { TokenBusiness } from "src/business";
import { TokenType } from "./../models/enums";
import { jwtoptionsbuilder } from "./util.service";

const validateToken = async (payload: any) => {
  if (await new TokenBusiness().tokenExists(payload.jti)) {
    return { ...payload };
  } else {
    throw new UnauthorizedException();
  }
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  `jwt-${TokenType.ACCESS}`
) {
  constructor() {
    super(jwtoptionsbuilder(TokenType.ACCESS));
  }

  async validate(payload: any) {
    return validateToken(payload);
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
    return validateToken(payload);
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
    return validateToken(payload);
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
    return validateToken(payload);
  }
}
