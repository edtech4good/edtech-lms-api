import { lmsusers, students } from "../models/data-models/init-models";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { hashPassword, verifyPassword } from "src/services/password.service";
import { TokenType } from "src/models/enums";
import { TokenBusiness, UserBusiness } from ".";
import { sendverificationemail } from "src/services/email.service";
import { StudentBusiness } from "./student.business";
import { SchoolUserBusiness } from "./schooluser.business";
import { Logger } from "src/config";

// Client-facing message for any login failure. Kept identical across
// unknown user, wrong password, unverified and disabled so the client
// cannot enumerate which accounts exist (edtech4good/edtech-lms-api#38).
// The real reason is always logged server-side with the username.
const LOGIN_FAILURE_MESSAGE = "User/Password not matching";

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
      throw new BadRequestException(LOGIN_FAILURE_MESSAGE);
    }
    if (user.isdisabled) {
      Logger.info("Login blocked: user disabled", {
        username: user.lmsusername,
      });
      throw new BadRequestException(LOGIN_FAILURE_MESSAGE);
    }
  };

  login = async (email: string, password: string) => {
    const user = await new UserBusiness().getuserbyemail(email);
    if (!user) {
      verifyPassword(password, DUMMY_PASSWORD_HASH);
      Logger.info("Login blocked: unknown user", { username: email });
      throw new BadRequestException(LOGIN_FAILURE_MESSAGE);
    }
    if (!verifyPassword(password, user.lmsuserpasswordhash)) {
      Logger.info("Login blocked: wrong password", { username: email });
      throw new BadRequestException(LOGIN_FAILURE_MESSAGE);
    }
    await this.verifyuser(user);
    return user;
  };

  logout = async (lmsuserid: string) => {
    const tb = new TokenBusiness();
    await tb.clearAccessToken(lmsuserid);
    await tb.clearRefreshToken(lmsuserid);
  };

  refreshAuth = async (refreshToken: string) => {
    try {
      const tokenbusiness = new TokenBusiness();
      const tokenpayload = await tokenbusiness.verifyToken(
        refreshToken,
        TokenType.REFRESH
      );
      if (!tokenpayload) {
        throw new BadRequestException("");
      }
      const user = await new UserBusiness().getuserbyid(tokenpayload.lmsuserid);
      if (!user) {
        throw new BadRequestException("");
      }
      await this.verifyuser(user);
      return await tokenbusiness.generateAuthToken(user);
    } catch (error) {
      throw new UnauthorizedException("Please authenticate");
    }
  };

  changePassword = async (changePasswordToken: string, newPassword: string) => {
    try {
      const tokenpayload = await new TokenBusiness().verifyToken(
        changePasswordToken,
        TokenType.CHANGEPASSWORD
      );
      if (!tokenpayload) {
        throw new BadRequestException("");
      }
      return await new UserBusiness().updatepassword(
        tokenpayload.sub,
        newPassword
      );
    } catch (error) {
      throw new UnauthorizedException("Please authenticate");
    }
  };

  verifyEmail = async (verifyEmailToken: string) => {
    try {
      const tokenpayload = await new TokenBusiness().verifyToken(
        verifyEmailToken,
        TokenType.VERIFYEMAIL
      );
      if (!tokenpayload) {
        throw new BadRequestException("");
      }
      return await new UserBusiness().userverifyemail(tokenpayload.sub);
    } catch (error) {
      throw new UnauthorizedException("Please authenticate");
    }
  };

  teacherlogin = async (email: string, password: string) => {
    const user = await new SchoolUserBusiness().getuserbyname(email);
    if (!user) {
      verifyPassword(password, DUMMY_PASSWORD_HASH);
      Logger.info("Teacher login blocked: unknown user", { username: email });
      throw new BadRequestException(LOGIN_FAILURE_MESSAGE);
    }
    if (!verifyPassword(password, user.schooluserpasswordhash)) {
      Logger.info("Teacher login blocked: wrong password", { username: email });
      throw new BadRequestException(LOGIN_FAILURE_MESSAGE);
    }
    if (user.isdisabled || user.isdeleted || !user.schooluserstatus) {
      Logger.info("Teacher login blocked: disabled/deleted/inactive user", {
        username: email,
      });
      throw new BadRequestException(LOGIN_FAILURE_MESSAGE);
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
