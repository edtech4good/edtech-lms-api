import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Role } from "src/models/enums";
import { isPlatformUser, PlatformGuard } from "./platform.guard";

/**
 * PlatformGuard is the one place that says who "the platform" is. For now: a
 * staff (lmsusers) token whose lmsuserroles include Super Admin. It runs after
 * AccessGuard has authenticated, so it is driven here directly with the
 * request AccessGuard would have produced.
 */
const contextFor = (request: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext);

const run = (user: unknown) =>
  new PlatformGuard().canActivate(contextFor({ user }));

const staff = (roles: unknown) => ({ lmsuserid: "u1", lmsuserroles: roles });

describe("PlatformGuard", () => {
  it("passes a staff user holding the Super Admin role", () => {
    expect(run(staff([Role.superadmin]))).toBe(true);
  });

  it("passes when Super Admin is one of several roles", () => {
    expect(run(staff([Role.teacher, Role.superadmin, Role.admin]))).toBe(true);
  });

  it("refuses an Admin with 403, not 401", () => {
    expect(() => run(staff([Role.admin]))).toThrow(ForbiddenException);
    expect(() => run(staff([Role.admin]))).not.toThrow(UnauthorizedException);
  });

  it("refuses a Teacher with 403", () => {
    expect(() => run(staff([Role.teacher]))).toThrow(ForbiddenException);
  });

  it("refuses the User and API Key roles with 403", () => {
    expect(() => run(staff([Role.user]))).toThrow(ForbiddenException);
    expect(() => run(staff([Role.apikey]))).toThrow(ForbiddenException);
  });

  it("refuses a user with no roles, an empty list, or a token minted before roles existed", () => {
    expect(() => run(staff([]))).toThrow(ForbiddenException);
    expect(() => run({ lmsuserid: "u1" })).toThrow(ForbiddenException);
    expect(() => run(staff(undefined))).toThrow(ForbiddenException);
    expect(() => run(staff(null))).toThrow(ForbiddenException);
  });

  it("answers 401 when there is no user on the request at all", () => {
    expect(() => run(undefined)).toThrow(UnauthorizedException);
    expect(() => run(null)).toThrow(UnauthorizedException);
    expect(() => new PlatformGuard().canActivate(contextFor(undefined))).toThrow(
      UnauthorizedException
    );
    expect(() => new PlatformGuard().canActivate(contextFor({}))).toThrow(
      UnauthorizedException
    );
  });

  it("refuses the application API key identity, which AccessGuard produces as { user: 'API KEY' }", () => {
    expect(() => run({ user: "API KEY" })).toThrow(ForbiddenException);
    // ...and the bare string, in case it ever arrives that way.
    expect(() => run("API KEY")).toThrow(ForbiddenException);
  });

  it("refuses a school-user (teacher/learner) token, which never carries lmsuserroles", () => {
    expect(() =>
      run({ schooluserid: "s1", schooluserrole: 3, schoolusername: "t1" })
    ).toThrow(ForbiddenException);
  });

  it("does not trust the legacy lmsuserrole column, which is stamped superadmin on every account", () => {
    expect(() =>
      run({ lmsuserid: "u1", lmsuserrole: Role.superadmin, lmsuserroles: [Role.teacher] })
    ).toThrow(ForbiddenException);
    expect(() =>
      run({ lmsuserid: "u1", lmsuserrole: Role.superadmin })
    ).toThrow(ForbiddenException);
  });

  it("requires lmsuserroles to be a real array: a string containing the roleid does not count", () => {
    expect(() => run(staff(Role.superadmin))).toThrow(ForbiddenException);
    expect(() => run(staff(`x${Role.superadmin}x`))).toThrow(ForbiddenException);
    expect(() => run(staff({ includes: () => true }))).toThrow(ForbiddenException);
  });

  it("requires a staff user id: a platform action is recorded against a user", () => {
    expect(() => run({ lmsuserroles: [Role.superadmin] })).toThrow(ForbiddenException);
    expect(() => run({ lmsuserid: "", lmsuserroles: [Role.superadmin] })).toThrow(
      ForbiddenException
    );
    expect(() => run({ lmsuserid: 7, lmsuserroles: [Role.superadmin] })).toThrow(
      ForbiddenException
    );
  });

  it("exposes the same rule as isPlatformUser, false for anything that is not an object", () => {
    expect(isPlatformUser(staff([Role.superadmin]))).toBe(true);
    expect(isPlatformUser(staff([Role.admin]))).toBe(false);
    expect(isPlatformUser(undefined)).toBe(false);
    expect(isPlatformUser(null)).toBe(false);
    expect(isPlatformUser("Mapyr2Pw")).toBe(false);
    expect(isPlatformUser(42)).toBe(false);
  });
});
