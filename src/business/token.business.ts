/* eslint-disable @typescript-eslint/no-explicit-any */
import { addMinutes } from "date-fns";
import { sign, verify } from "jsonwebtoken";
import { SUPERADMIN_USERNAME } from "src/models/enums/permissions.enum";
import { LoginTokens } from "src/modules/auth";
import { v4 as uuidv4 } from "uuid";
import { Config, isLocalEnv } from "../config";
import {
  lmsusers,
  lmsusersAttributes,
  schools,
  students,
  tokens,
} from "../models/data-models/init-models";
import { TokenType } from "../models/enums";
import { RolePermissionBusiness } from "./role-permission.business";

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
  tokenExists = async (token: string) => {
    const count = await tokens.count({
      where: {
        token,
      },
    });
    return count > 0;
  };

  verifyToken = (token: string): Promise<any> =>
    new Promise((resolve) => {
      verify(
        token,
        Config.fortyk.api.applicationsecret,
        async (err, decoded: any) => {
          if (err) {
            resolve(false);
          } else {
            const tokenDoc = await tokens.findOne({
              where: { token: decoded.jti },
            });
            if (!tokenDoc) {
              resolve(false);
            }
            resolve(tokenDoc);
          }
        }
      );
    });

  verifyTokenBody = (token: string): Promise<any> =>
    new Promise((resolve) => {
      verify(
        token,
        Config.fortyk.api.applicationsecret,
        async (err, decoded: any) => {
          if (err) {
            resolve(false);
          } else {
            const tokenDoc = await tokens.findOne({
              where: { token: decoded.jti },
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

  generateAuthToken = async (
    user: lmsusers
  ): Promise<LoginTokens> => {
    // Username shortcut: being `superadmin@superadmin.com` grants every
    // permission plus the `superadmin` wildcard by email alone, bypassing RBAC.
    // Honoured only in local/dev/test. In production the seeded superadmin holds
    // the Super Admin role (migration 20260407120500 binds it, and migrations
    // 20260407120500 + 20260716140000 together grant that role all 190
    // permissions — both run in every environment), so it earns the same
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
      Config.fortyk.api.changepasswordexpirationminutes,
      TokenType.CHANGEPASSWORD,
      TokenType.CHANGEPASSWORD
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
