import { lmsusers, students } from "../models/data-models/init-models";
import { LmsUserToken } from "src/models/token.model";
import { decode } from "jsonwebtoken";
import { isUuidShaped } from "src/services/organisation-claims";
import { OrganisationBusiness } from "./organisation.business";
import { organisationClaims } from "./token.business";
import { hashPassword, verifyPassword } from "src/services/password.service";
import { TokenType } from "src/models/enums";
import { TokenBusiness, UserBusiness } from ".";
import { sendverificationemail } from "src/services/email.service";
import { StudentBusiness } from "./student.business";
import { SchoolUserBusiness } from "./schooluser.business";
import { Logger } from "src/config";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { STAFF_SCHOOL_ROLES } from "src/models/enums/school.role.enum";

// Client-facing message for any login failure. Kept identical across
// unknown user, wrong password, unverified and disabled so the client
// cannot enumerate which accounts exist (edtech4good/edtech-lms-api#38).
// The real reason is always logged server-side with the username. This is
// also the ErrorCode.LOGIN_FAILED default message in docs/api-errors.md -
// kept as one literal so a future edit to either can't silently drift the
// two apart and reintroduce a distinguishable message on one code path.
const LOGIN_FAILURE_MESSAGE = "The username or password is incorrect.";

// Computed once at module load so the "unknown user" branch can still pay
// the bcrypt cost below: skipping it made unknown-user responses land in a
// few ms against ~75ms for a real account, which is its own enumeration
// oracle even with an identical response body (review finding B1).
const DUMMY_PASSWORD_HASH = hashPassword("dummy-not-a-real-password");

export class AuthBusiness {
  verifyuser = async (user: lmsusers) => {
    if (!user.isverified) {
      await sendverificationemail(
        user.lmsusername,
        await new TokenBusiness().generateVerifyEmailToken(user)
      );
      Logger.info("Login blocked: user not verified", {
        username: user.lmsusername,
      });
      throw new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE);
    }
    if (user.isdisabled) {
      Logger.info("Login blocked: user disabled", {
        username: user.lmsusername,
      });
      throw new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE);
    }
  };

  login = async (email: string, password: string) => {
    const user = await new UserBusiness().getuserbyemail(email);
    if (!user) {
      verifyPassword(password, DUMMY_PASSWORD_HASH);
      Logger.info("Login blocked: unknown user", { username: email });
      throw new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE);
    }
    if (!verifyPassword(password, user.lmsuserpasswordhash)) {
      Logger.info("Login blocked: wrong password", { username: email });
      throw new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE);
    }
    await this.verifyuser(user);
    return user;
  };

  logout = async (lmsuserid: string) => {
    const tb = new TokenBusiness();
    await tb.clearAccessToken(lmsuserid);
    await tb.clearRefreshToken(lmsuserid);
  };

  refreshAuth = async (refreshToken: string, clientip?: string) => {
    try {
      const tokenbusiness = new TokenBusiness();
      // Signature and token row are checked HERE, before anything in the token is
      // read: the route guard checks them too, but this must not depend on it.
      const tokenpayload = await tokenbusiness.verifyToken(
        refreshToken,
        TokenType.REFRESH
      );
      if (!tokenpayload) {
        throw new Error('Token payload missing or invalid');
      }
      const user = await new UserBusiness().getuserbyid(tokenpayload.lmsuserid);
      if (!user) {
        throw new Error('Token payload missing or invalid');
      }
      await this.verifyuser(user);
      const ended = await this.stillActingOrganisation(user, refreshToken);
      const tokens = await tokenbusiness.generateAuthToken(user, {
        actingorganisationid: ended.organisationid,
      });
      if (ended.endedfrom !== null) {
        // The end of an acting session, in the shape of the switch's line (who, which
        // organisation it stopped acting as, where it went, why, the client address),
        // written once, after the new token exists. No token is logged.
        Logger.info("Platform user's acting session ended", {
          audit: "organisation-switch-end",
          lmsuserid: user.lmsuserid,
          username: user.lmsusername,
          fromorganisationid: ended.endedfrom,
          // where the session went: the platform view, or (a user given an organisation) its own
          toorganisationid: ended.reason === "no-longer-platform" ? user.organisationid ?? null : null,
          reason: ended.reason,
          ip: clientip,
        });
      }
      return tokens;
    } catch (error) {
      throw new ApiError(ErrorCode.SIGN_IN_REQUIRED);
    }
  };

  /**
   * The organisation a refresh keeps acting in (`organisationid`, null for the
   * platform view). The refresh token carries it (`actingorganisationid`, written
   * when the switcher issued it; the signature was checked before this is called).
   * It is kept only while the database still agrees: the user is still a platform
   * account (no organisation, Super Admin) and the organisation exists, is not
   * deleted and is not suspended. Otherwise the session returns to the platform
   * view, exactly as a refresh did before, and `endedfrom` names the organisation
   * it stopped acting as, with the `reason`, for the audit line. Sign-in never
   * passes one.
   */
  private stillActingOrganisation = async (
    user: lmsusers,
    refreshToken: string,
  ): Promise<{ organisationid: string | null; endedfrom: string | null; reason?: "organisation-unavailable" | "no-longer-platform" }> => {
    const claimed = (decode(refreshToken) as { actingorganisationid?: unknown } | null)?.actingorganisationid;
    if (!isUuidShaped(claimed)) {
      return { organisationid: null, endedfrom: null };
    }
    const roleids = (user.roles ?? []).map((role) => role.roleid);
    if (!organisationClaims(user.organisationid, roleids).isplatform) {
      // Not (or no longer) a platform account: the claim means nothing. Only a user who
      // really was acting has one, so this is the end of an acting session.
      return { organisationid: null, endedfrom: claimed, reason: "no-longer-platform" };
    }
    if (await new OrganisationBusiness().getactiveorganisation(claimed)) {
      return { organisationid: claimed, endedfrom: null };
    }
    return { organisationid: null, endedfrom: claimed, reason: "organisation-unavailable" };
  };

  /**
   * `POST /auth/organisation`: a platform user starts acting as one
   * organisation, or (`null`) returns to "all organisations". Issues a fresh
   * access token, which replaces the old one (one access token per user), and
   * a new refresh token, exactly as sign-in does.
   *
   * PlatformGuard has already checked the caller's token; the database decides
   * again here, because the user is re-read and the claims are rebuilt from it:
   * a user who is no longer platform (an organisation assigned, Super Admin
   * removed) is refused with 403, a disabled one must sign in again. A target
   * organisation that does not exist, is deleted or is suspended is one 404
   * for all three, so the answer does not reveal which.
   *
   * The token's own organisation ("from") is written to the audit line with
   * the target ("to") and the client IP, once, after the new token exists. No
   * token is logged. (The project's logger has no request id on success paths.)
   */
  switchOrganisation = async (
    caller: LmsUserToken,
    fromorganisationid: string | null,
    organisationid: string | null,
    clientip?: string
  ) => {
    const user = await new UserBusiness().getuserbyid(caller.lmsuserid);
    if (!user || user.isdisabled) {
      throw new ApiError(ErrorCode.SIGN_IN_REQUIRED);
    }
    const roleids = (user.roles ?? []).map((role) => role.roleid);
    if (!organisationClaims(user.organisationid, roleids).isplatform) {
      throw new ApiError(ErrorCode.NOT_ALLOWED);
    }
    if (
      organisationid !== null &&
      !(await new OrganisationBusiness().getactiveorganisation(organisationid))
    ) {
      throw new ApiError(ErrorCode.NOT_FOUND, "That organisation doesn't exist.");
    }
    const tokens = await new TokenBusiness().generateAuthToken(user, {
      actingorganisationid: organisationid,
    });
    Logger.info("Platform user switched organisation", {
      audit: "organisation-switch",
      lmsuserid: user.lmsuserid,
      username: user.lmsusername,
      fromorganisationid,
      toorganisationid: organisationid,
      ip: clientip,
    });
    return tokens;
  };

  changePassword = async (changePasswordToken: string, newPassword: string) => {
    try {
      const tokenpayload = await new TokenBusiness().verifyToken(
        changePasswordToken,
        TokenType.CHANGEPASSWORD
      );
      if (!tokenpayload) {
        throw new Error('Token payload missing or invalid');
      }
      return await new UserBusiness().updatepassword(
        tokenpayload.sub,
        newPassword
      );
    } catch (error) {
      throw new ApiError(ErrorCode.SIGN_IN_REQUIRED);
    }
  };

  verifyEmail = async (verifyEmailToken: string) => {
    try {
      const tokenpayload = await new TokenBusiness().verifyToken(
        verifyEmailToken,
        TokenType.VERIFYEMAIL
      );
      if (!tokenpayload) {
        throw new Error('Token payload missing or invalid');
      }
      return await new UserBusiness().userverifyemail(tokenpayload.sub);
    } catch (error) {
      throw new ApiError(ErrorCode.SIGN_IN_REQUIRED);
    }
  };

  teacherlogin = async (email: string, password: string) => {
    const user = await new SchoolUserBusiness().getuserbyname(email);
    if (!user) {
      verifyPassword(password, DUMMY_PASSWORD_HASH);
      Logger.info("Teacher login blocked: unknown user", { username: email });
      throw new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE);
    }
    if (!verifyPassword(password, user.schooluserpasswordhash)) {
      Logger.info("Teacher login blocked: wrong password", { username: email });
      throw new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE);
    }
    if (user.isdisabled || user.isdeleted || !user.schooluserstatus) {
      Logger.info("Teacher login blocked: disabled/deleted/inactive user", {
        username: email,
      });
      throw new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE);
    }
    // This endpoint issues a token meant only for staff (superadmin/admin/
    // teacher) accounts - see #90. No shipped client logs
    // a student in here (edtech-expo's lmsLogin call is dead code; the
    // archived edtech-android app is a read-only reference, never released),
    // so any non-staff account is refused with the same
    // response as a wrong password, same as the other branches above,
    // rather than revealing the account exists or its role. Allow-list, not
    // `!== SchoolRole.STUDENT`: an unmapped role value must also be refused.
    if (!STAFF_SCHOOL_ROLES.includes(user.schooluserrole)) {
      Logger.info("Teacher login blocked: non-staff account", {
        username: email,
      });
      throw new ApiError(ErrorCode.LOGIN_FAILED, LOGIN_FAILURE_MESSAGE);
    }

    const schooluser = await new StudentBusiness().getstudentbyschooluserid(
      user.schooluserid
    );
    if (schooluser) {
      schooluser.schooluser = user;
      return schooluser;
    } else {
      const tempst = new students();
      tempst.schooluser = user;
      tempst.schooluserid = user.schooluserid;
      tempst.schoolname = user.schoolname;
      return tempst;
    }
  };
}
