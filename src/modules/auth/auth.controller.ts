import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { AccessGuard } from "src/guards/access.guard";
import { TokenType } from "src/models/enums";
import { AuthBusiness, TokenBusiness, UserBusiness } from "../../business";
import { SchoolBusiness } from "../../business/school.business";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import { SchemaValidationInterceptor } from "../../interceptors/schemavalidation.interceptor";
import { IRequest } from "../../models/IRequest";
import {
  sendchangepasswordemail,
  sendverificationemail,
} from "../../services/email.service";
import { replacecaseInsensitive } from "./../../services/util.service";
import {
  AuthBusinessisNotUserEmailExistsValidator,
  AuthBusinessUserEmailExistsValidator,
} from "./auth.business.validator";
import {
  changePassword,
  login,
  sendverifyemail,
  teacherlogin,
} from "./auth.request.validator";
import { ChangePasswordBody } from "./models/ChangePasswordBody";
import { EmailResponse } from "./models/EmailResponse";
import { EmailverficationResponse } from "./models/EmailverficationResponse";
import { EmailVerificationRequestBody } from "./models/EmailVerificationRequestBody";
import { LoginRequestBody } from "./models/LoginRequestBody";
import { LoginResponseModel, LoginTokens } from "./models/LoginResponse";
import { LogoutResponse } from "./models/LogoutResponse";
@ApiExtraModels(LoginTokens)
@ApiExtraModels(LoginResponseModel)
@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  // POST /auth/register is deliberately absent. It was public and
  // unauthenticated, its validator accepted Role.superadmin from the request
  // body, and UserBusiness.createUser stamps every account superadmin whatever
  // role is asked for — so a working version of it was a public superadmin
  // faucet. It never worked (createUser threw on an undefined roles list and
  // the transaction rolled back), no client ever called it, and the fix that
  // would have made it "work" was a one-line change anybody might make.
  //
  // Learner self-registration is wanted, but it needs designing rather than
  // reviving: see docs/authorization-model.md.

  @Post("login")
  @ApiExtraModels(LoginTokens)
  @ApiExtraModels(LoginResponseModel)
  @ApiResponse({
    status: 200,
    schema: { $ref: getSchemaPath(LoginResponseModel) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while login",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(login),
    new BusinessValidationInterceptor([
      AuthBusinessisNotUserEmailExistsValidator,
    ])
  )
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginRequestBody): Promise<LoginResponseModel> {
    const userloggedinfo = await new AuthBusiness().login(
      body.lmsusername,
      body.lmsuserpassword
    );
    return {
      data: await new TokenBusiness().generateAuthToken(userloggedinfo),
      error: false,
    };
  }

  @Post("school/login")
  @ApiExtraModels(LoginTokens)
  @ApiExtraModels(LoginResponseModel)
  @ApiResponse({
    status: 200,
    schema: { $ref: getSchemaPath(LoginResponseModel) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while login",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(teacherlogin))
  @HttpCode(HttpStatus.OK)
  async teacherlogin(
    @Body() body: LoginRequestBody
  ): Promise<LoginResponseModel> {
    const userloggedinfo = await new AuthBusiness().teacherlogin(
      body.lmsusername,
      body.lmsuserpassword
    );
    // schoolname on `students` is denormalized (no join in the login path);
    // look the school row up here, immediately before token generation, so
    // TokenBusiness stays IO-free. Missing row -> generateTeacherAuthToken
    // defaults to uitheme 'kids' / schoolid null.
    const school = userloggedinfo.schoolname
      ? await new SchoolBusiness().getschoolbyname(userloggedinfo.schoolname)
      : null;

    return {
      data: await new TokenBusiness().generateTeacherAuthToken(
        userloggedinfo,
        school
      ),
      error: false,
    };
  }

  @Post("logout")
  @ApiResponse({
    status: 200,
    description: "user logged successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while logout",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  //@UseGuards(AccessGuard(TokenType.ACCESS))
  async logout(
    @Request() request: IRequest,
    @Headers("Authorization") auth?: string
  ): Promise<LogoutResponse> {
    if ((auth || "").trim().length > 0) {
      const authtoken = replacecaseInsensitive(auth || "", "bearer").trim();
      const _body = await new TokenBusiness().verifyTokenBody(authtoken || "");
      if (_body) {
        await new AuthBusiness().logout(_body.sub);
        return {
          data: true,
          error: false,
        };
      }
    }
    return {
      data: false,
      error: true,
    };
  }

  @Post("verify")
  @ApiResponse({
    status: 200,
    description: "Verification email sent successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while sending verification email",
  })
  @ApiResponse({
    status: 202,
    description: "Verification email token accepted",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AccessGuard(TokenType.VERIFYEMAIL))
  @ApiQuery({ name: `verifyemailtoken`, type: "string", required: true })
  async verifyuserbyemailtoken(
    @Query(`verifyemailtoken`) VERIFYEMAILTOKEN: string
  ): Promise<EmailverficationResponse> {
    const payload = await new TokenBusiness().verifyToken(VERIFYEMAILTOKEN);
    if (!payload) {
      return {
        data: false,
        error: true,
      };
    }
    await new UserBusiness().userverifyemail(payload.lmsuserid);
    return {
      data: true,
      error: false,
    };
  }

  @Post(`refreshtoken`)
  @ApiResponse({
    status: 200,
    description: "New access and refreshtoken generated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while generating access and refreshtoken",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessGuard(TokenType.REFRESH))
  @ApiQuery({ name: "refreshtoken", type: "string", required: true })
  async createrefreshtoken(
    @Query("refreshtoken") REFRESHTOKEN: string
  ): Promise<LoginResponseModel> {
    const refreshtoken = await new AuthBusiness().refreshAuth(REFRESHTOKEN);
    return {
      data: refreshtoken,
      error: false,
    };
  }

  @Put("sendverificationemail")
  @ApiResponse({
    status: 200,
    description: "verification mail sent successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while seding verification email",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(sendverifyemail),
    new BusinessValidationInterceptor([
      AuthBusinessisNotUserEmailExistsValidator,
    ])
  )
  @HttpCode(HttpStatus.OK)
  async verifyemail(
    @Body() body: EmailVerificationRequestBody
  ): Promise<EmailResponse> {
    const user = await new UserBusiness().getuserbyemail(body.lmsusername);
    if (!user) {
      return {
        data: "User info not found",
        error: false,
      };
    }
    await sendverificationemail(
      body.lmsusername,
      await new TokenBusiness().generateVerifyEmailToken(user)
    );
    return {
      data: "Verification mail sent.",
      error: false,
    };
  }

  @Post("forgotpassword")
  @ApiResponse({
    status: 200,
    description: "Password reset mail sent successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while sending password reset email",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(sendverifyemail),
    new BusinessValidationInterceptor([
      AuthBusinessisNotUserEmailExistsValidator,
    ])
  )
  @HttpCode(HttpStatus.OK)
  async forgotpassword(
    @Body() body: EmailVerificationRequestBody
  ): Promise<EmailResponse> {
    const user = await new UserBusiness().getuserbyemail(body.lmsusername);
    if (!user) {
      return {
        data: "User info not found",
        error: false,
      };
    }
    await sendchangepasswordemail(
      body.lmsusername,
      await new TokenBusiness().generateChangePasswordToken(user)
    );
    return {
      data: "Password reset mail sent.",
      error: false,
    };
  }

  @Put("changepassword")
  @ApiQuery({ name: "changepasswordtoken", type: "string", required: true })
  @ApiResponse({
    status: 200,
    description: "Reset successfull",
  })
  @ApiResponse({
    status: 400,
    description: "Error while reset password",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(changePassword),
    new BusinessValidationInterceptor([AuthBusinessUserEmailExistsValidator])
  )
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessGuard(TokenType.CHANGEPASSWORD))
  async changepassword(
    @Body() body: ChangePasswordBody,
    @Query("changepasswordtoken") CHANGEPASSWORDTOKEN: string
  ): Promise<EmailverficationResponse> {
    const payload = await new TokenBusiness().verifyToken(CHANGEPASSWORDTOKEN);
    if (!payload) {
      return {
        data: false,
        error: true,
      };
    }
    await new UserBusiness().updatepassword(
      payload.lmsuserid,
      body.lmsuserpassword
    );
    return {
      data: true,
      error: false,
    };
  }

  @Post("token/validate/changepassword")
  @ApiQuery({ name: "changepasswordtoken", type: "string", required: true })
  @ApiResponse({
    status: 200,
    description: "verified successfull",
  })
  @ApiResponse({
    status: 400,
    description: "Error while validate",
  })
  @ApiResponse({
    status: 404,
    description: "Not found",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  async changepasswordvalidate(
    @Query("changepasswordtoken") CHANGEPASSWORDTOKEN: string
  ): Promise<EmailverficationResponse> {
    return {
      data: (await new TokenBusiness().verifyToken(CHANGEPASSWORDTOKEN))
        ? true
        : false,
      error: false,
    };
  }
}
