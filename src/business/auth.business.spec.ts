import { BadRequestException } from "@nestjs/common";
import * as passwordService from "src/services/password.service";
import { AuthBusiness } from "./auth.business";

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

  it("rejects an unknown email with the same message as a wrong password", async () => {
    mockGetUserByEmail(undefined);
    await expect(
      new AuthBusiness().login("nobody@example.com", "whatever")
    ).rejects.toMatchObject(
      new BadRequestException("User/Password not matching")
    );
  });

  it("rejects a known email with the wrong password with the identical message", async () => {
    mockGetUserByEmail(realUser);
    await expect(
      new AuthBusiness().login(realUser.lmsusername, "totally wrong")
    ).rejects.toMatchObject(
      new BadRequestException("User/Password not matching")
    );
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
