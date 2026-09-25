import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AccessGuard } from "./access.guard";
import { Role } from "src/models/enums";
import { TokenType } from "src/models/enums/tokentype.enum";
import { Config } from "src/config";

/**
 * Unit tests for LocalAccessGuard.handleRequest, the class the AccessGuard
 * mixin factory returns. This guards edtech-lms-api#54 (403 vs 401 on a role
 * failure) and edtech-lms-api#32 (reading the request from handleRequest's
 * own context argument instead of instance state shared across requests).
 *
 * handleRequest is exercised directly on the class prototype rather than
 * through a constructed instance, so nothing here touches passport's real
 * strategy machinery, a JWT secret, or a network call — this is the
 * boundary passport itself calls after it has already verified (or failed
 * to verify) the token.
 */
const buildContext = (headers: Record<string, string> = {}): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext);

const handleRequestOf = (...role: Array<Role>) => {
  const GuardClass = AccessGuard(TokenType.ACCESS, ...role);
  return (err: any, user: any, info: any, context: ExecutionContext) =>
    (GuardClass.prototype as any).handleRequest(err, user, info, context);
};

describe("AccessGuard.handleRequest", () => {
  it("throws UnauthorizedException (401) when there is no user and no token error to report", () => {
    const handleRequest = handleRequestOf(Role.superadmin);
    const context = buildContext();
    expect(() => handleRequest(undefined, undefined, {}, context)).toThrow(
      UnauthorizedException
    );
  });

  it("throws UnauthorizedException (401) when passport reports an error (invalid/expired token)", () => {
    const handleRequest = handleRequestOf(Role.superadmin);
    const context = buildContext();
    const passportErr = new Error("jwt malformed");
    expect(() => handleRequest(passportErr, undefined, {}, context)).toThrow(
      passportErr
    );
  });

  it("throws ForbiddenException (403), not UnauthorizedException, when a valid token lacks the required role (#54)", () => {
    const handleRequest = handleRequestOf(Role.superadmin);
    const context = buildContext();
    const user = { lmsuserid: "u1", lmsuserroles: [Role.teacher] };
    expect(() => handleRequest(undefined, user, {}, context)).toThrow(
      ForbiddenException
    );
  });

  it("does not throw ForbiddenException as an UnauthorizedException in disguise", () => {
    const handleRequest = handleRequestOf(Role.superadmin);
    const context = buildContext();
    const user = { lmsuserid: "u1", lmsuserroles: [Role.teacher] };
    try {
      handleRequest(undefined, user, {}, context);
      fail("expected handleRequest to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e).not.toBeInstanceOf(UnauthorizedException);
      expect((e as ForbiddenException).getStatus()).toBe(403);
    }
  });

  it("allows the request through when the token's role matches", () => {
    const handleRequest = handleRequestOf(Role.superadmin);
    const context = buildContext();
    const user = { lmsuserid: "u1", lmsuserroles: [Role.superadmin] };
    expect(handleRequest(undefined, user, {}, context)).toBe(user);
  });

  it("treats a token with no lmsuserroles as holding none, and fails closed with 403", () => {
    const handleRequest = handleRequestOf(Role.superadmin);
    const context = buildContext();
    const user = { lmsuserid: "u1" }; // token minted before roles existed
    expect(() => handleRequest(undefined, user, {}, context)).toThrow(
      ForbiddenException
    );
  });

  it("reads the request from handleRequest's own context argument, not shared instance state (#32)", () => {
    // Two concurrent "requests" against the SAME guard instance. Before #32,
    // the guard cached the request from canActivate on `this._request` and
    // handleRequest read it back from there; a second call's context could
    // stomp the field before the first call's handleRequest ran. Calling
    // handleRequest twice on one instance with two different contexts, in
    // reverse order, proves each call is judged on its OWN context.
    const GuardClass = AccessGuard(TokenType.ACCESS, Role.apikey);
    const guard: any = Object.create(GuardClass.prototype);

    const apiKeyHeader = `Bearer ${Config.fortyk.api.applicationapikey}`;
    const apiKeyContext = buildContext({ authorization: apiKeyHeader });
    const strangerContext = buildContext({ authorization: "Bearer not-the-api-key" });

    // Simulate the stranger's canActivate having already run and (in the
    // old, buggy code) overwritten instance state, THEN the api-key
    // request's handleRequest firing.
    const apiKeyResult = guard.handleRequest(undefined, undefined, {}, apiKeyContext);
    expect(apiKeyResult).toEqual({ user: "API KEY" });

    // The stranger's own handleRequest, using its own context, must still
    // be rejected — it must not inherit the api-key identity from the call
    // above just because they share a guard instance.
    expect(() =>
      guard.handleRequest(undefined, undefined, {}, strangerContext)
    ).toThrow(UnauthorizedException);
  });
});
