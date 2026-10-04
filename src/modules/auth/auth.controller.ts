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
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AccessGuard } from "src/guards/access.guard";
import { PlatformGuard } from "src/guards/platform.guard";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { User } from "src/decorators/user.decorator";
import { LmsUserToken } from "src/models/token.model";
import { RejectPrototypeKeysInterceptor } from "src/interceptors/rejectprototypekeys.interceptor";
import { Logger } from "src/config";
import { signInRequiredIfUserGone } from "src/services/session.service";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";

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
  switchorganisation,
  teacherlogin,
} from "./auth.request.validator";
import { ChangePasswordBody } from "./models/ChangePasswordBody";
import { EmailResponse } from "./models/EmailResponse";
import { EmailverficationResponse } from "./models/EmailverficationResponse";
import { EmailVerificationRequestBody } from "./models/EmailVerificationRequestBody";
import { LoginRequestBody } from "./models/LoginRequestBody";
import { LoginResponseModel, LoginTokens } from "./models/LoginResponse";
import { SwitchOrganisationRequestBody } from "./models/SwitchOrganisationRequestBody";
import { LogoutResponse } from "./models/LogoutResponse";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
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

  @OrgPolicy("public", { note: "Staff sign-in." })
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
  @UseInterceptors(new SchemaValidationInterceptor(login))
  @UseGuards(ThrottlerGuard)
  @Throttle(10, 60)
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

  @OrgPolicy("platform", { note: "Platform users only: chooses the organisation the new token acts in." })
  @Post("organisation")
  @ApiBearerAuth()
  @ApiBody({ type: SwitchOrganisationRequestBody })
  @ApiResponse({
    status: 200,
    description: "A new access token and refresh token that act in the chosen organisation (or in none, for null). The previous tokens stop working.",
    schema: { $ref: getSchemaPath(LoginResponseModel) },
  })
  @ApiResponse({ status: 400, description: "Invalid input" })
  @ApiResponse({ status: 401, description: "Not signed in" })
  @ApiResponse({ status: 403, description: "Not the platform" })
  @ApiResponse({ status: 404, description: "No such organisation (also: deleted or suspended)" })
  @ApiResponse({ status: 500, description: "Server error" })
  @UseInterceptors(
    new RejectPrototypeKeysInterceptor(),
    new SchemaValidationInterceptor(switchorganisation)
  )
  // Rate limited like the sign-in routes (the throttler keys on the client IP),
  // after authentication and PlatformGuard so that unauthenticated requests do
  // not use up a caller's allowance. Each call replaces the user's tokens.
  @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard, ThrottlerGuard)
  @Throttle(20, 60)
  @ApiResponse({ status: 429, description: "Too many switches in a minute" })
  @HttpCode(HttpStatus.OK)
  async switchorganisation(
    @Body() body: SwitchOrganisationRequestBody,
    @User() user: LmsUserToken,
    @Org() org: OrgContext,
    @Request() request: IRequest
  ): Promise<LoginResponseModel> {
    return {
      data: await new AuthBusiness().switchOrganisation(
        user,
        org.organisationid,
        body.organisationid,
        request.ip
      ),
      error: false,
    };
  }

  @OrgPolicy("public", { note: "School-user (teacher and classroom device) sign-in." })
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
  @UseGuards(ThrottlerGuard)
  @Throttle(10, 60)
  @HttpCode(HttpStatus.OK)
  async teacherlogin(
    @Body() body: LoginRequestBody
  ): Promise<LoginResponseModel> {
    const userloggedinfo = await new AuthBusiness().teacherlogin(
      body.lmsusername,
      body.lmsuserpassword
    );
    // The learner or login belongs to its school by id (`schoolusers.schoolid`);
    // `schoolname` on the rows is a stored copy and is only carried in the token for
    // older clients. Look the school row up by that id here, immediately before
    // token generation, so TokenBusiness stays IO-free. Missing row ->
    // generateTeacherAuthToken defaults to uitheme 'kids' / schoolid null.
    const schoolid = userloggedinfo.schooluser?.schoolid ?? userloggedinfo.schoolid;
    const school = schoolid
      ? await new SchoolBusiness().getschoolbyid(schoolid)
      : null;

    return {
      data: await new TokenBusiness().generateTeacherAuthToken(
        userloggedinfo,
        school
      ),
      error: false,
    };
  }

  @OrgPolicy("self", { note: "Named exception: the bearer token is checked in the handler, not by a guard." })
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
      const _body = await new TokenBusiness().verifyTokenBody(
        authtoken || "",
        TokenType.ACCESS
      );
      if (_body) {
        await new AuthBusiness().logout(_body.sub);
        return {
          data: true,
          error: false,
        };
      }
    }
    throw new UnauthorizedException();
  }

  @OrgPolicy("self", { note: "Must act only on the account named by the email-verification token." })
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
    const payload = await new TokenBusiness().verifyToken(
      VERIFYEMAILTOKEN,
      TokenType.VERIFYEMAIL
    );
    if (!payload) {
      // Was a 200 with error:true.
      throw new ApiError(ErrorCode.SIGN_IN_REQUIRED);
    }
    await signInRequiredIfUserGone(() => new UserBusiness().userverifyemail(payload.lmsuserid));
    return {
      data: true,
      error: false,
    };
  }

  @OrgPolicy("self", { note: "Must act only on the session named by the refresh token." })
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
    @Query("refreshtoken") REFRESHTOKEN: string,
    @Request() request: IRequest
  ): Promise<LoginResponseModel> {
    const refreshtoken = await new AuthBusiness().refreshAuth(REFRESHTOKEN, request.ip);
    return {
      data: refreshtoken,
      error: false,
    };
  }

  @OrgPolicy("public")
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
    // The mail goes to the address stored on the account, and the request acts
    // only when the address given is that account's address.
    const user = await new UserBusiness().getuserforemailrequest(body.lmsusername);
    if (!user) {
      return {
        data: "User info not found",
        error: false,
      };
    }
    await sendverificationemail(
      user.lmsusername,
      await new TokenBusiness().generateVerifyEmailToken(user)
    );
    return {
      data: "Verification mail sent.",
      error: false,
    };
  }

  @OrgPolicy("public")
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
  @UseInterceptors(new SchemaValidationInterceptor(sendverifyemail))
  @UseGuards(ThrottlerGuard)
  @Throttle(5, 60)
  @HttpCode(HttpStatus.OK)
  async forgotpassword(
    @Body() body: EmailVerificationRequestBody
  ): Promise<EmailResponse> {
    // Same response whether or not the email exists, so the client cannot
    // enumerate accounts (edtech4good/edtech-lms-api#38). Only send the
    // email when the account is real. Token mint + send are fired without
    // awaiting them, so the response time does not itself distinguish a
    // known email (which used to await a ~2.5s SMTP round trip) from an
    // unknown one (review finding B2); failures are logged, not thrown.
    //
    // The reset link goes only to the address stored on the account, and a
    // request acts only when the address given is that account's address; any
    // other address is treated as unknown (no token, no mail).
    const user = await new UserBusiness().getuserforemailrequest(body.lmsusername);
    if (user) {
      new TokenBusiness()
        .generateChangePasswordToken(user)
        .then((token) => sendchangepasswordemail(user.lmsusername, token))
        .catch((error) => {
          Logger.error("Forgot-password email failed to send", {
            username: user.lmsusername,
            error,
          });
        });
    } else {
      Logger.info("Forgot-password requested for unknown email", {
        username: body.lmsusername,
      });
    }
    return {
      data: "Password reset mail sent.",
      error: false,
    };
  }

  @OrgPolicy("self", { note: "Must act only on the account named by the change-password token." })
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
    const payload = await new TokenBusiness().verifyToken(
      CHANGEPASSWORDTOKEN,
      TokenType.CHANGEPASSWORD
    );
    if (!payload) {
      // Was a 200 with error:true.
      throw new ApiError(ErrorCode.SIGN_IN_REQUIRED);
    }
    await signInRequiredIfUserGone(() => new UserBusiness().updatepassword(
      payload.lmsuserid,
      body.lmsuserpassword
    ));
    return {
      data: true,
      error: false,
    };
  }

  @OrgPolicy("public", { note: "The reset token in the query proves the request." })
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
      data: (await new TokenBusiness().verifyToken(
        CHANGEPASSWORDTOKEN,
        TokenType.CHANGEPASSWORD
      ))
        ? true
        : false,
      error: false,
    };
  }
}
