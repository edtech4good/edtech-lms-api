import {
  ExecutionContext,
  ForbiddenException,
  mixin,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { Config } from "src/config";
import { Role } from "src/models/enums";
import { TokenType } from "./../models/enums/tokentype.enum";
/**
 * What an AccessGuard was built with, readable from the class it returns
 * (`AccessGuard(...)[ACCESS_GUARD_INFO]`). The factory keeps both arguments in
 * a closure, so without this nothing can tell, from outside, which token type a
 * route accepts or whether the application API key is among the roles. The
 * route inventory (src/route-policy) reads it. It changes nothing at runtime.
 */
export const ACCESS_GUARD_INFO = "accessGuardInfo";
export interface AccessGuardInfo {
  tokentype: TokenType;
  roles: Array<Role>;
}

const AccessGuard = (tokentype: TokenType, ...role: Array<Role>) => {
  const guard = mixin(
    class LocalAccessGuard extends AuthGuard(`jwt-${tokentype}`) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
        // You can throw an exception based on either "info" or "err" arguments

        const request: Request = context.switchToHttp().getRequest();
        if (err || !user) {
          if (
            request?.headers["authorization"] ===
              `Bearer ${Config.fortyk.api.applicationapikey}` &&
            role.find((x) => x === Role.apikey)
          ) {
            return {
              user: "API KEY",
            };
          }
          throw err || new UnauthorizedException();
        }
        if (role && role.length > 0) {
          // The roles the bearer actually holds, from lmsusers_roles at login.
          //
          // This used to compare against `user.lmsuserrole`, a single column
          // that UserBusiness.createUser stamps `superadmin` on for every
          // account. So the check passed for anyone who could log in: it read
          // like enforcement and enforced nothing, and every endpoint guarded
          // by roles alone was open to any account. See
          // docs/authorization-model.md.
          //
          // Role enum values are roleids, so these compare directly. A token
          // issued before this change has no lmsuserroles and is treated as
          // holding none — it fails closed, and the bearer logs in again.
          const userroles: Array<string> = user.lmsuserroles ?? [];
          if (!role.find((x) => userroles.includes(x))) {
            throw new ForbiddenException();
          }
        }
        return user;
      }
    }
  );
  Object.defineProperty(guard, ACCESS_GUARD_INFO, {
    value: <AccessGuardInfo>{ tokentype, roles: [...role] },
  });
  return guard;
};
export { AccessGuard };
