import { lmsusers } from "../models/data-models/init-models";
import { schoolusers } from "../models/data-models/schoolusers";
import { UserBusiness } from "./user.business";
import { SchoolUserBusiness } from "./schooluser.business";
import { EditUser, DeleteUser } from "../modules/user/user.business.validator";
import { signInRequiredIfUserGone } from "../services/session.service";
import { ApiError } from "../models/ApiError";
import { ErrorCode } from "../models/enums/errorcode.enum";

/**
 * getuser is called with ADMIN-supplied ids (EditUser/DeleteUser validators).
 * A missing user must be NOT_FOUND 404 there - SIGN_IN_REQUIRED 401 would
 * sign the admin out of lms-ui. Token-derived callers map it back to
 * SIGN_IN_REQUIRED (auth.business's catch, and signInRequiredIfUserGone in
 * auth.controller).
 */
describe("getuser for a missing user", () => {
  afterEach(() => jest.restoreAllMocks());

  it("UserBusiness.getuser throws NOT_FOUND 404, not SIGN_IN_REQUIRED", async () => {
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(null);
    const err: any = await new UserBusiness().getuser("missing").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.getStatus()).toBe(404);
  });

  it("SchoolUserBusiness.getuser throws NOT_FOUND 404, not SIGN_IN_REQUIRED", async () => {
    jest.spyOn(schoolusers, "findOne").mockResolvedValue(null);
    const err: any = await new SchoolUserBusiness().getuser("missing").catch((e) => e);
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
  });

  it.each([["EditUser", EditUser], ["DeleteUser", DeleteUser]])(
    "admin path %s: a missing user surfaces as NOT_FOUND (admin stays signed in)",
    async (_name, validator) => {
      jest.spyOn(lmsusers, "findOne").mockResolvedValue(null);
      const err: any = await validator({} as any, { lmsuserid: "missing" }).catch((e: any) => e);
      expect(err.code).toBe(ErrorCode.NOT_FOUND);
    },
  );

  it("token path (auth.controller verify-email / change-password): NOT_FOUND becomes SIGN_IN_REQUIRED", async () => {
    const err: any = await signInRequiredIfUserGone(() =>
      Promise.reject(new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist.")),
    ).catch((e) => e);
    expect(err.code).toBe(ErrorCode.SIGN_IN_REQUIRED);
  });

  it("token path passes any other error through unchanged", async () => {
    const original = new Error("db down");
    const err = await signInRequiredIfUserGone(() => Promise.reject(original)).catch((e) => e);
    expect(err).toBe(original);
  });
});
