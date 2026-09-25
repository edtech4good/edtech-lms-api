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
jest.mock("./user.business", () => ({
  UserBusiness: jest.fn().mockImplementation(() => ({
    getuserbyemail: getuserbyemailMock,
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
