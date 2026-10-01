/* eslint-disable @typescript-eslint/no-explicit-any */
import { addMinutes } from "date-fns";
import { sign, verify } from "jsonwebtoken";
import { SUPERADMIN_USERNAME } from "src/models/enums/permissions.enum";
import { LoginTokens } from "src/modules/auth";
import { v4 as uuidv4 } from "uuid";
import { Config, isLocalEnv, Logger } from "../config";
import {
  lmsusers,
  lmsusersAttributes,
  schools,
  students,
  tokens,
} from "../models/data-models/init-models";
import { Role, TokenType } from "../models/enums";
import { ApiError } from "../models/ApiError";
import { ErrorCode } from "../models/enums/errorcode.enum";
import { organisations } from "../models/data-models/organisations";
import { RolePermissionBusiness } from "./role-permission.business";

/** The two organisation claims a staff access token carries. */
export interface OrganisationClaims {
  organisationid: string | null;
  isplatform: boolean;
}

/**
 * What a staff user's token says about organisations, from the database row
 * and the roles the user holds now (never from an earlier token).
 *
 *  - Platform: the user has NO organisation AND holds Super Admin. The token
 *    acts in no organisation (`organisationid: null`) unless a platform user
 *    asks to act as one (`acting`, only for a platform user; anything else
 *    throws, because only the switcher passes it and it checks first).
 *  - A user who HAS an organisation is never platform, whatever roles they
 *    hold, and acts in that organisation.
 *  - A user with no organisation and without Super Admin gets
 *    `{ organisationid: null, isplatform: false }`. That state still signs in
 *    here. The package that assigns every staff user an organisation must make
 *    sign-in refuse it: such a token acts in no organisation and is not
 *    platform, so it must not be allowed to exist once organisations are
 *    assigned.
 */
export const organisationClaims = (
  userorganisationid: string | null | undefined,
  roleids: ReadonlyArray<string>,
  acting?: string | null,
): OrganisationClaims => {
  const own = userorganisationid ?? null;
  const isplatform = own === null && roleids.includes(Role.superadmin);
  if (acting !== undefined && acting !== null && !isplatform) {
    throw new Error("Only a platform user can act as an organisation.");
  }
  return { organisationid: isplatform ? acting ?? null : own, isplatform };
};

export class TokenBusiness {
  generateToken = (
    userId: string,
    exptime: number,
    payload: any,
    secret: string,
    claims: string,
    jti: string
  ) => {
    const newexpiery = addMinutes(new Date(), exptime);

    const localpayload = {
      sub: userId,
      iat: new Date().getTime() / 1000,
      jti,
      exp: new Date(newexpiery).getTime() / 1000,
      ...JSON.parse(JSON.stringify(payload)),
      claims,
    };
    return sign(localpayload, secret);
  };

  saveToken = async (
    token: string,
    lmsuserid: string,
    tokentype: TokenType
  ) => {
    await tokens.destroy({
      where: {
        lmsuserid,
        tokentype,
      },
    });
    const data: any = {
      token,
      lmsuserid,
      tokentype,
    };
    return tokens.create(data);
  };

  deleteToken = (lmsuserid: string, tokentype: TokenType) => {
    return tokens.destroy({
      where: {
        lmsuserid,
        tokentype,
      },
    });
  };
  tokenExists = async (token: string, tokentype: TokenType) => {
    const count = await tokens.count({
      where: {
        token,
        tokentype,
      },
    });
    return count > 0;
  };

  verifyToken = (token: string, expectedType: TokenType): Promise<any> =>
    new Promise((resolve) => {
      verify(
        token,
        Config.fortyk.api.applicationsecret,
        async (err, decoded: any) => {
          if (err) {
            resolve(false);
          } else {
            const tokenDoc = await tokens.findOne({
              where: { token: decoded.jti, tokentype: expectedType },
            });
            if (!tokenDoc) {
              resolve(false);
            }
            resolve(tokenDoc);
          }
        }
      );
    });

  verifyTokenBody = (token: string, expectedType: TokenType): Promise<any> =>
    new Promise((resolve) => {
      verify(
        token,
        Config.fortyk.api.applicationsecret,
        async (err, decoded: any) => {
          if (err) {
            resolve(false);
          } else {
            const tokenDoc = await tokens.findOne({
              where: { token: decoded.jti, tokentype: expectedType },
            });
            if (!tokenDoc) {
              resolve(false);
            }
            resolve(decoded);
          }
        }
      );
    });

  clearRefreshToken = (userid: string) =>
    this.deleteToken(userid, TokenType.REFRESH);
  clearAccessToken = (userid: string) =>
    this.deleteToken(userid, TokenType.ACCESS);

  /**
   * Mints a staff access token (and a new refresh token), replacing the user's
   * previous ones. Every staff token comes from here: sign-in, refresh and
   * `POST /auth/organisation` (`options.actingorganisationid`, which the
   * caller has already validated). `user` must be freshly read from the
   * database with its roles: the claims are derived from it, never copied from
   * an earlier token.
   *
   * Refuses (the same LOGIN_FAILED answer as a bad password, so the reason is
   * not revealed; refresh maps any failure to SIGN_IN_REQUIRED) when the user's
   * organisation is deleted or suspended, before any token is touched.
   */
  generateAuthToken = async (
    user: lmsusers,
    options: { actingorganisationid?: string | null } = {}
  ): Promise<LoginTokens> => {
    if (user.organisationid) {
      const usable = await organisations.count({
        where: {
          organisationid: user.organisationid,
          isdeleted: false,
          organisationstatus: true,
        },
      });
      if (usable === 0) {
        Logger.info("Sign-in blocked: organisation suspended or deleted", {
          username: user.lmsusername,
        });
        throw new ApiError(ErrorCode.LOGIN_FAILED);
      }
    }
    // Username shortcut: being `superadmin@superadmin.com` grants every
    // permission plus the `superadmin` wildcard by email alone, bypassing RBAC.
    // Honoured only in local/dev/test. In production the seeded superadmin holds
    // the Super Admin role (migration 20260407120500 binds it, and migrations
    // 20260407120500 + 20260716140000 grant that role every permission that
    // existed then, and each later migration that adds permissions, such as
    // 20261001120100 for the organisation ones, grants its own to Super Admin
    // in the same migration — all run in every environment), so it earns the same
    // wildcard through the RBAC path — the shortcut is redundant there, and a
    // liability: any production account renamed to this address would get
    // everything.
    const isSuperAdmin =
      isLocalEnv && user.lmsusername === SUPERADMIN_USERNAME;
    const permissions = await new RolePermissionBusiness().convertRolesPermsToArrayOfString(user.roles ?? [], isSuperAdmin) ?? [];
    // The roles this user actually holds. `roleid` is what the Role enum is
    // built from, so these are directly comparable to the lists AccessGuard is
    // given. lmsuserrole below is NOT: createUser stamps it superadmin for
    // everyone, so it says nothing about who the bearer is. It stays in the
    // payload because clients read it, but nothing authorizes on it.
    const lmsuserroles = (user.roles ?? []).map((role) => role.roleid);
    const { organisationid, isplatform } = organisationClaims(
      user.organisationid,
      lmsuserroles,
      options.actingorganisationid,
    );
    const userpayload = {
      lmsusername: user.lmsusername,
      lmsuserrole: user.lmsuserrole,
      lmsuserroles: lmsuserroles,
      lmsuserid: user.lmsuserid,
      firstname: user.firstname,
      lastname: user.lastname,
      permissions: permissions,
      countries: user.countries,
      schools: user.schools,
      organisationid,
      isplatform,
    };
    const accessid = uuidv4();
    const accessToken = this.generateToken(
      user.lmsuserid,
      Config.fortyk.api.accessexpirationminutes,
      userpayload,
      Config.fortyk.api.applicationsecret,
      TokenType.ACCESS,
      accessid
    );
    await this.clearRefreshToken(user.lmsuserid);
    await this.clearAccessToken(user.lmsuserid);
    const userdata = await user;
    await this.saveToken(accessid, user.lmsuserid, TokenType.ACCESS);
    const refreshToken = await this.generateMiscToken(
      userdata,
      Config.fortyk.api.refreshexpirationminutes,
      TokenType.REFRESH,
      TokenType.REFRESH
    );

    return {
      accessToken,
      refreshToken,
    };
  };

  generateTeacherAuthToken = async (
    user: students,
    school?: schools | null
  ): Promise<LoginTokens> => {
    const userpayload = {
      studentfirstname: user.studentfirstname,
      studentlastname: user.studentlastname,
      studentid: user.studentid,
      schooluserid: user.schooluserid,
      city: user.city,
      contact: user.contact,
      country: user.country,
      dateofbirth: user.dateofbirth,
      curriculumid: user.curriculumid,
      dateofjoin: user.dateofjoin,
      fathername: user.fathername,
      genderid: user.genderid,
      mothername: user.mothername,
      schoolname: user.schoolname,
      schooltype: user.schooltype,
      standard: user.standard,
      state: user.state,
      startinglevelid: user.startinglevelid,
      studentcurrentlessonid: user.studentcurrentlessonid,
      studentcurrentlevelid: user.studentcurrentlevelid,
      schoolusername: user.schooluser.schoolusername,
      schooluserrole: user.schooluser.schooluserrole,
      // `schools` is looked up by the caller (schoolname is a denormalized
      // column here, not a join) and passed in so this stays pure of IO.
      // Missing school row -> default theme, no schoolid.
      // `uitheme`/`schoolid` are display/theming claims only, derived from a
      // denormalized name match (not a foreign key) — nothing must ever
      // authorize on them.
      uitheme: school?.uitheme ?? "kids",
      schoolid: school?.schoolid ?? null,
    };
    const accessid = uuidv4();
    const accessToken = this.generateToken(
      user.schooluserid,
      Config.fortyk.api.accessexpirationminutes,
      userpayload,
      Config.fortyk.api.applicationsecret,
      TokenType.ACCESS,
      accessid
    );
    await this.clearAccessToken(user.schooluserid);
    await this.saveToken(accessid, user.schooluserid, TokenType.ACCESS);
    return {
      accessToken,
      refreshToken: "",
    };
  };

  generateMiscToken = async (
    user: lmsusersAttributes,
    expiry: number,
    tokentype: TokenType,
    claim: string
  ) => {
    const misctokenid = uuidv4();
    const miscToken = this.generateToken(
      user.lmsuserid,
      expiry,
      {},
      Config.fortyk.api.applicationsecret,
      claim,
      misctokenid
    );
    await this.saveToken(misctokenid, user.lmsuserid, tokentype);
    return miscToken;
  };

  generateChangePasswordToken = (user: lmsusersAttributes) =>
    this.generateMiscToken(
      user,
      Config.fortyk.api.changepasswordexpirationminutes,
      TokenType.CHANGEPASSWORD,
      TokenType.CHANGEPASSWORD
    );

  generateVerifyEmailToken = (user: lmsusersAttributes) =>
    this.generateMiscToken(
      user,
      Config.fortyk.api.changepasswordexpirationminutes,
      TokenType.VERIFYEMAIL,
      TokenType.VERIFYEMAIL
    );

  clearChangePasswordToken = (userid: string) =>
    this.deleteToken(userid, TokenType.CHANGEPASSWORD);

  clearVerifyEmailToken = (userid: string) =>
    this.deleteToken(userid, TokenType.VERIFYEMAIL);
}
