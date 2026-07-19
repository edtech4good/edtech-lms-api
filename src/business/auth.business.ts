import { lmsusers, students } from "../models/data-models/init-models";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import md5 from "crypto-js/md5";
import { TokenBusiness, UserBusiness } from ".";
import { sendverificationemail } from "src/services/email.service";
import { StudentBusiness } from "./student.business";
import { SchoolUserBusiness } from "./schooluser.business";

export class AuthBusiness {
  verifyuser = async (user: lmsusers) => {
    if (!user.isverified) {
      await sendverificationemail(
        user.lmsusername,
        await new TokenBusiness().generateVerifyEmailToken(user)
      );
      throw new BadRequestException(
        "User not verified, Please verify with the link sent to your email"
      );
    }
    if (user.isdisabled) {
      throw new BadRequestException("User disabled, Contact administrator");
    }
  };

  login = async (email: string, password: string) => {
    const user = await new UserBusiness().getuserbyemail(email);
    if (!user) {
      throw new BadRequestException("User/Password not matching");
    }
    if (user.lmsuserpasswordhash !== md5(password).toString()) {
      throw new BadRequestException("User/Password not matching");
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
      const tokenpayload = await tokenbusiness.verifyToken(refreshToken);
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
        changePasswordToken
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
        verifyEmailToken
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
      throw new BadRequestException("User/Password not matching");
    }
    if (
      user.schooluserpasswordhash !== md5(password).toString() ||
      user.isdisabled ||
      user.isdeleted ||
      !user.schooluserstatus
    ) {
      throw new BadRequestException("User/Password not matching");
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
