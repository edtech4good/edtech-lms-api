import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Role } from "src/models/enums";

/**
 * "Platform only": the route may be used by the people who run the whole
 * platform, never by anyone acting inside one organisation.
 *
 * This is the ONE place that decides what "platform" means, so the next
 * packages (docs/admin-organisations-schema.md §8) change it here and nowhere
 * else. For now it means: a staff (`lmsusers`) access token whose roles include
 * Super Admin. Later it becomes the `isplatform` token claim.
 *
 * Use it AFTER `AccessGuard(TokenType.ACCESS)` - that guard authenticates and
 * sets `request.user`; this one only authorises - and before
 * `CheckPermissionsGuard`, so the answer is "platform or not" before it is
 * "which permission":
 *
 *     @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard, CheckPermissionsGuard)
 *
 * Fails closed, and says which kind of failure it is (docs/api-errors.md):
 *  - no user on the request (guard ordering mistake, or no authentication):
 *    401 SIGN_IN_REQUIRED;
 *  - anyone else who is not platform: 403 NOT_ALLOWED. That covers a staff user
 *    without Super Admin, a school-user (learner/teacher) token, the
 *    application API key (`{ user: "API KEY" }`), and a token minted before
 *    roles were carried (`lmsuserroles` missing).
 *
 * It reads `lmsuserroles` - the roleids the bearer holds, from `lmsusers_roles`
 * at login. It must never read `lmsuserrole`: that legacy column is stamped
 * `superadmin` on every account, so a check on it would pass for everyone
 * (docs/authorization-model.md, "The gap").
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest()?.user;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (isPlatformUser(user)) {
      return true;
    }
    throw new ForbiddenException();
  }
}

/**
 * Exported so the rule can be asserted directly. Strict about shape: the roles
 * must be a real array (a string would satisfy `.includes` by substring), and
 * the bearer must be a staff user (`lmsuserid`), since a platform action is
 * recorded against one.
 */
export const isPlatformUser = (user: unknown): boolean => {
  if (typeof user !== "object" || user === null) {
    return false;
  }
  const { lmsuserid, lmsuserroles } = user as {
    lmsuserid?: unknown;
    lmsuserroles?: unknown;
  };
  return (
    typeof lmsuserid === "string" &&
    lmsuserid.length > 0 &&
    Array.isArray(lmsuserroles) &&
    lmsuserroles.includes(Role.superadmin)
  );
};
