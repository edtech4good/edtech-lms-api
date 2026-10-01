import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

/**
 * "Platform only": the route may be used by the people who run the whole
 * platform, never by anyone acting inside one organisation as that
 * organisation's staff.
 *
 * This is the ONE place that decides what "platform" means. It means: a staff
 * (`lmsusers`) access token whose `isplatform` claim is true. The claim is set
 * when the token is minted (src/business/token.business.ts): the user has no
 * organisation AND holds Super Admin, read from the database at that moment.
 * It stays true while a platform user is acting as an organisation
 * (`POST /auth/organisation`), so the platform keeps its platform routes while
 * it looks at one organisation. A user who belongs to an organisation is never
 * platform, whatever roles they hold.
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
 *  - anyone else who is not platform: 403 NOT_ALLOWED. That covers an
 *    organisation's staff (with or without Super Admin), a staff user with no
 *    organisation and no Super Admin, a school-user (learner/teacher) token,
 *    and the application API key (`{ user: "API KEY" }`).
 *
 * It reads `isplatform`, strictly `true`. It must never read `lmsuserrole`
 * (the legacy column, stamped `superadmin` on every account), and it does not
 * read `lmsuserroles` either: holding Super Admin is necessary for the claim
 * but not sufficient, and the claim is the single answer
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
 * Exported so the rule can be asserted directly. Strict about shape: the claim
 * must be the boolean `true` (a string or a number does not count), and the
 * bearer must be a staff user (`lmsuserid`), since a platform action is
 * recorded against one.
 */
export const isPlatformUser = (user: unknown): boolean => {
  if (typeof user !== "object" || user === null) {
    return false;
  }
  const { lmsuserid, isplatform } = user as {
    lmsuserid?: unknown;
    isplatform?: unknown;
  };
  return (
    typeof lmsuserid === "string" && lmsuserid.length > 0 && isplatform === true
  );
};
