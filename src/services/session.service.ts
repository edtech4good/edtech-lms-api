import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
/**
 * UserBusiness.getuser throws NOT_FOUND for a missing user (right for
 * admin-supplied ids). Here the id comes from the caller's own token, so a
 * missing user means the session is no longer valid: SIGN_IN_REQUIRED.
 */
export const signInRequiredIfUserGone = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.code === ErrorCode.NOT_FOUND) {
      throw new ApiError(ErrorCode.SIGN_IN_REQUIRED);
    }
    throw e;
  }
};
