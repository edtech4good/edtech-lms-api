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
          if (!role.find((x) => x == user.lmsuserrole)) {
            throw new UnauthorizedException();
          }
        }
        return user;
      }
    }
  );
export { AccessGuard };
