import { ExecutionContext, mixin, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { Config } from "src/config";
import { Role } from "src/models/enums";
import { TokenType } from "./../models/enums/tokentype.enum";
const AccessGuard = (tokentype: TokenType, ...role: Array<Role>) =>
  mixin(
    class LocalAccessGuard extends AuthGuard(`jwt-${tokentype}`) {
      _request: Request | undefined;
      canActivate(context: ExecutionContext) {
        // Add your custom authentication logic here
        // for example, call super.logIn(request) to establish a session.
        const ctx = context.switchToHttp();
        this._request = ctx.getRequest();
        return super.canActivate(context);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handleRequest(err: any, user: any, _info: any) {
        // You can throw an exception based on either "info" or "err" arguments

        if (err || !user) {
          if (
            this._request?.headers["authorization"] ===
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
            throw new UnauthorizedException();
          }
        }
        return user;
      }
    }
  );
export { AccessGuard };
