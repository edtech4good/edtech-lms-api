import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Role } from "src/models/enums";
import { isPlatformUser, PlatformGuard } from "./platform.guard";

/**
 * PlatformGuard is the one place that says who "the platform" is: a staff
 * (lmsusers) token whose `isplatform` claim is true. It runs after AccessGuard
 * has authenticated, so it is driven here directly with the request
 * AccessGuard would have produced.
 */
const contextFor = (request: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext);

const run = (user: unknown) =>
  new PlatformGuard().canActivate(contextFor({ user }));

const platform = (extra: Record<string, unknown> = {}) => ({
  lmsuserid: "u1",
  lmsuserroles: [Role.superadmin],
  organisationid: null,
  isplatform: true,
  ...extra,
});

describe("PlatformGuard", () => {
  it("passes a staff token whose isplatform claim is true", () => {
    expect(run(platform())).toBe(true);
  });

  it("still passes while the platform user is acting as an organisation", () => {
    expect(run(platform({ organisationid: "11111111-1111-4111-8111-111111111111" }))).toBe(true);
  });

  it("decides on the claim alone: it does not look at lmsuserroles", () => {
    expect(run(platform({ lmsuserroles: [] }))).toBe(true);
    expect(run({ lmsuserid: "u1", isplatform: true })).toBe(true);
  });

  it("refuses an organisation's staff with 403 even when they hold Super Admin (the claim is false)", () => {
    const orgSuperAdmin = platform({ isplatform: false, organisationid: "o1" });
    expect(() => run(orgSuperAdmin)).toThrow(ForbiddenException);
    expect(() => run(orgSuperAdmin)).not.toThrow(UnauthorizedException);
  });

  it("refuses a staff user with no organisation and no Super Admin (isplatform false)", () => {
    expect(() => run(platform({ isplatform: false, lmsuserroles: [Role.admin] }))).toThrow(
      ForbiddenException
    );
  });

  it("refuses holding the Super Admin role when the claim is missing: a token minted before the claim existed", () => {
    expect(() => run({ lmsuserid: "u1", lmsuserroles: [Role.superadmin] })).toThrow(
      ForbiddenException
    );
    expect(() => run({ lmsuserid: "u1" })).toThrow(ForbiddenException);
  });

  it("requires the claim to be the boolean true: strings, numbers, objects and arrays do not count", () => {
    for (const bad of ["true", 1, "1", {}, [], null, undefined, "yes"]) {
      expect(() => run(platform({ isplatform: bad }))).toThrow(ForbiddenException);
    }
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

  it("refuses a school-user (teacher/learner) token, which carries no staff id and no claim", () => {
    expect(() =>
      run({ schooluserid: "s1", schooluserrole: 3, schoolusername: "t1" })
    ).toThrow(ForbiddenException);
  });

  it("does not trust the legacy lmsuserrole column, which is stamped superadmin on every account", () => {
    expect(() =>
      run({ lmsuserid: "u1", lmsuserrole: Role.superadmin, lmsuserroles: [Role.superadmin] })
    ).toThrow(ForbiddenException);
  });

  it("requires a staff user id: a platform action is recorded against a user", () => {
    expect(() => run({ isplatform: true })).toThrow(ForbiddenException);
    expect(() => run({ lmsuserid: "", isplatform: true })).toThrow(ForbiddenException);
    expect(() => run({ lmsuserid: 7, isplatform: true })).toThrow(ForbiddenException);
  });

  it("refuses a payload that carries a school-user id as well, even with isplatform true", () => {
    expect(() => run(platform({ schooluserid: "s1" }))).toThrow(ForbiddenException);
    expect(() => run(platform({ schooluserid: "s1", schooluserrole: 3 }))).toThrow(ForbiddenException);
    expect(isPlatformUser(platform({ schooluserid: "s1" }))).toBe(false);
  });

  it("exposes the same rule as isPlatformUser, false for anything that is not an object", () => {
    expect(isPlatformUser(platform())).toBe(true);
    expect(isPlatformUser(platform({ isplatform: false }))).toBe(false);
    expect(isPlatformUser(undefined)).toBe(false);
    expect(isPlatformUser(null)).toBe(false);
    expect(isPlatformUser("Mapyr2Pw")).toBe(false);
    expect(isPlatformUser(42)).toBe(false);
  });
});
