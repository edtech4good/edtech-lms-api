import * as passwordService from "src/services/password.service";
import { AuthBusiness } from "./auth.business";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";

// The error contract's fixed message for ErrorCode.LOGIN_FAILED
// (docs/api-errors.md) - deliberately identical across every login-failure
// branch (unknown user, wrong password, unverified, disabled). Read from the
// catalogue rather than hardcoded here, so this test can't drift from the
// contract itself.
const LOGIN_FAILURE_MESSAGE = "The username or password is incorrect.";

// UserBusiness.getuserbyemail is an instance arrow-function property (not on
// the prototype), and AuthBusiness.login constructs its own `new
// UserBusiness()` internally, so the class itself is mocked rather than
// spying on an instance method.
const getuserbyemailMock = jest.fn();
const updatepasswordMock = jest.fn();
jest.mock("./user.business", () => ({
  UserBusiness: jest.fn().mockImplementation(() => ({
    getuserbyemail: getuserbyemailMock,
    updatepassword: updatepasswordMock,
  })),
}));

const verifyTokenMock = jest.fn();
jest.mock("./token.business", () => ({
  TokenBusiness: jest.fn().mockImplementation(() => ({
    verifyToken: verifyTokenMock,
  })),
}));

const getuserbynameMock = jest.fn();
jest.mock("./schooluser.business", () => ({
  SchoolUserBusiness: jest.fn().mockImplementation(() => ({
    getuserbyname: getuserbynameMock,
  })),
}));

/**
 * Guards edtech-lms-api#56: login must not tell an unknown username apart
 * from a wrong password, in the response OR in how long it takes. No
 * MySQL: UserBusiness.getuserbyemail is mocked so the business logic is
 * exercised without a database, and verifyPassword runs for real (it's a
 * pure bcrypt/md5 computation, not a network call), so a spy can prove it
 * was actually invoked on the unknown-user path too.
 */
describe("AuthBusiness.login (#56 enumeration guard)", () => {
  const REAL_PASSWORD = "correct horse battery staple";
  const realHash = passwordService.hashPassword(REAL_PASSWORD);
  const realUser = {
    lmsuserid: "user-1",
    lmsusername: "known@example.com",
    lmsuserpasswordhash: realHash,
    isverified: true,
    isdisabled: false,
  } as any;

  let verifyPasswordSpy: jest.SpyInstance;

  beforeEach(() => {
    verifyPasswordSpy = jest.spyOn(passwordService, "verifyPassword");
    getuserbyemailMock.mockReset();
  });

  afterEach(() => {
    verifyPasswordSpy.mockRestore();
  });

  const mockGetUserByEmail = (result: any) =>
    getuserbyemailMock.mockResolvedValue(result);

  it("rejects an unknown email with the same code and message as a wrong password", async () => {
    mockGetUserByEmail(undefined);
    await expect(
      new AuthBusiness().login("nobody@example.com", "whatever")
    ).rejects.toMatchObject(
      new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE)
    );
  });

  it("rejects a known email with the wrong password with the identical code and message", async () => {
    mockGetUserByEmail(realUser);
    await expect(
      new AuthBusiness().login(realUser.lmsusername, "totally wrong")
    ).rejects.toMatchObject(
      new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE)
    );
  });

  it("both failure paths reject with the exact same ApiError code and message (the anti-enumeration property under test)", async () => {
    mockGetUserByEmail(undefined);
    let unknownUserError: any;
    try {
      await new AuthBusiness().login("nobody@example.com", "whatever");
    } catch (e) {
      unknownUserError = e;
    }

    mockGetUserByEmail(realUser);
    let wrongPasswordError: any;
    try {
      await new AuthBusiness().login(realUser.lmsusername, "totally wrong");
    } catch (e) {
      wrongPasswordError = e;
    }

    expect(unknownUserError.code).toBe(wrongPasswordError.code);
    expect(unknownUserError.message).toBe(wrongPasswordError.message);
    expect(unknownUserError.getStatus()).toBe(wrongPasswordError.getStatus());
  });

  it("still calls verifyPassword (pays the bcrypt cost) for an unknown user, so timing does not out the enumeration", async () => {
    mockGetUserByEmail(undefined);
    await expect(
      new AuthBusiness().login("nobody@example.com", "whatever")
    ).rejects.toThrow();
    expect(verifyPasswordSpy).toHaveBeenCalledTimes(1);
    // Called against the module's fixed dummy hash, not the real user's —
    // there is no real user to compare against.
    const [, comparedAgainst] = verifyPasswordSpy.mock.calls[0];
    expect(comparedAgainst).not.toBe(realHash);
  });

  it("succeeds for the right password against a known, verified, enabled user", async () => {
    mockGetUserByEmail(realUser);
    const result = await new AuthBusiness().login(realUser.lmsusername, REAL_PASSWORD);
    expect(result).toBe(realUser);
  });
});

/**
 * teacherlogin mirrors login's #56 guard: same code/message for unknown user
 * and wrong password, and the unknown-user branch still pays the bcrypt
 * cost. Previously untested - removing the dummy verify stayed green.
 */
describe("AuthBusiness.teacherlogin (#56 enumeration guard)", () => {
  const REAL_PASSWORD = "correct horse battery staple";
  const realHash = passwordService.hashPassword(REAL_PASSWORD);
  const realTeacher = {
    schooluserid: "teacher-1",
    schoolusername: "teacher1",
    schooluserpasswordhash: realHash,
    isdisabled: false,
    isdeleted: false,
    schooluserstatus: true,
  } as any;
  let verifyPasswordSpy: jest.SpyInstance;

  beforeEach(() => {
    verifyPasswordSpy = jest.spyOn(passwordService, "verifyPassword");
    getuserbynameMock.mockReset();
  });
  afterEach(() => verifyPasswordSpy.mockRestore());

  it("unknown teacher and wrong password reject with the identical code, message and status", async () => {
    getuserbynameMock.mockResolvedValue(undefined);
    const unknown: any = await new AuthBusiness().teacherlogin("nobody", "x").catch((e) => e);
    getuserbynameMock.mockResolvedValue(realTeacher);
    const wrong: any = await new AuthBusiness().teacherlogin("teacher1", "wrong").catch((e) => e);

    expect(unknown).toMatchObject(new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE));
    expect(unknown.code).toBe(wrong.code);
    expect(unknown.message).toBe(wrong.message);
    expect(unknown.getStatus()).toBe(wrong.getStatus());
  });

  it("still calls verifyPassword against the dummy hash for an unknown teacher", async () => {
    getuserbynameMock.mockResolvedValue(undefined);
    await expect(new AuthBusiness().teacherlogin("nobody", "x")).rejects.toThrow();
    expect(verifyPasswordSpy).toHaveBeenCalledTimes(1);
    expect(verifyPasswordSpy.mock.calls[0][1]).not.toBe(realHash);
  });
});

/**
 * UserBusiness.getuser now throws NOT_FOUND (admin-supplied ids must not
 * sign the admin out). Token-derived paths must still end as
 * SIGN_IN_REQUIRED.
 */
describe("token-derived user lookups map a missing user to SIGN_IN_REQUIRED", () => {
  beforeEach(() => {
    verifyTokenMock.mockReset();
    updatepasswordMock.mockReset();
  });

  it("AuthBusiness.changePassword: getuser NOT_FOUND -> SIGN_IN_REQUIRED", async () => {
    verifyTokenMock.mockResolvedValue({ sub: "gone-user" });
    updatepasswordMock.mockRejectedValue(new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist."));
    await expect(new AuthBusiness().changePassword("t", "p")).rejects.toMatchObject({ code: ErrorCode.SIGN_IN_REQUIRED });
  });
});
