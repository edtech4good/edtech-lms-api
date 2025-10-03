import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { UserBusiness } from "src/business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { lmsusersAttributes } from "src/models/data-models/lmsusers";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import { StandardBase, UserCreateResponse } from "./models/UserBase";
import { UserGetAllResponse } from "./models/UserGetAllResponse";
import { UserRequest } from "./models/UserRequest";
import { StandardResponse } from "./models/UserResponse";
import {
  CreateUser,
  DeleteUser,
  EditUser,
} from "./user.business.validator";
import {
  createuser,
  showalluser,
  updateuser,
} from "./user.request.validator";

@ApiExtraModels(StandardBase)
@ApiExtraModels(UserCreateResponse)
@ApiExtraModels(StandardResponse)
@ApiExtraModels(UserGetAllResponse)
@ApiTags("User")
@Controller("user")
@ApiBearerAuth()
export class UserController {
  @Post("create")
  @ApiResponse({
    status: 200,
    description: "User created successfully",
    schema: { $ref: getSchemaPath(UserCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating user",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createuser),
    new BusinessValidationInterceptor([CreateUser])
  )
  @RequirePermissions(Permission.CREATE_USER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: UserRequest,
    @User() user: LmsUserToken
  ): Promise<UserCreateResponse> {
    const temp: lmsusersAttributes = {
      lmsuserid: '',
      lmsusername: body.lmsusername,
      lmsuserpasswordhash: body.lmsuserpasswordhash,
      isverified: true,
      isdisabled: false,
      lmsuserrole: 'Mapyr2Pw',
      firstname: '',
      countries: body.countryids,
      schools: body.schoolids
    };

    const data = await new UserBusiness().createUser(temp, body.lmsuserroles, user);
    return {
      error: false,
      data: data,
    };
  }

  // @Delete(":standardid")
  // @ApiResponse({
  //   status: 200,
  //   description: "standard deleted successfully",
  //   schema: { $ref: getSchemaPath(ResponseBoolean) },
  // })
  // @ApiResponse({
  //   status: 400,
  //   description: "Error while deleting standard",
  // })
  // @ApiResponse({
  //   status: 500,
  //   description: "Server error",
  // })
  // @UseInterceptors(
  //   new SchemaValidationInterceptor(deletestandard),
  //   new BusinessValidationInterceptor([DeleteStandard])
  // )
  // @RequirePermissions(Permission.DELETE_USER)
  // @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  // @HttpCode(HttpStatus.OK)
  // @ApiParam({ name: `standardid`, type: "string", required: true })
  // async delete(
  //   @Param("standardid") standardid: string,
  //   @User() user: LmsUserToken
  // ): Promise<ResponseBoolean> {
  //   await new StandardBusiness().deletestandard(standardid, user);
  //   return {
  //     error: false,
  //     data: true,
  //   };
  // }

  // @Get(":standardid")
  // @ApiResponse({
  //   status: 200,
  //   description: "standard fetch successfully",
  //   schema: { $ref: getSchemaPath(UserCreateResponse) },
  // })
  // @ApiResponse({
  //   status: 400,
  //   description: "Error while fetching standard",
  // })
  // @ApiResponse({
  //   status: 500,
  //   description: "Server error",
  // })
  // @UseInterceptors(
  //   new SchemaValidationInterceptor(showstandard),
  //   new BusinessValidationInterceptor([DeleteStandard])
  // )
  // @HttpCode(HttpStatus.OK)
  // @ApiParam({ name: `standardid`, type: "string", required: true })
  // async get(
  //   @Param("standardid") standardid: string
  // ): Promise<UserCreateResponse> {
  //   const data = await new StandardBusiness().getstandardbyid(standardid);
  //   return {
  //     error: false,
  //     data: data ? data : undefined,
  //   };
  // }

  @Put(":lmsuserid")
  @ApiResponse({
    status: 200,
    description: "User update successfully",
    schema: { $ref: getSchemaPath(UserCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching user",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updateuser),
    new BusinessValidationInterceptor([EditUser])
  )
  @RequirePermissions(Permission.UPDATE_USER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lmsuserid`, type: "string", required: true })
  async update(
    @Param("lmsuserid") lmsuserid: string,
    @Body() body: UserRequest,
    @User() user: LmsUserToken
  ): Promise<UserCreateResponse> {
    const data = await new UserBusiness().updateUser(<
      lmsusersAttributes
    >{
      lmsuserid,
      lmsusername: body.lmsusername,
      lmsuserpasswordhash: body.lmsuserpasswordhash,
      countries: body.countryids,
      schools: body.schoolids,
    }, body.lmsuserroles, user);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Delete(":lmsuserid")
  @ApiResponse({
    status: 200,
    description: "User update successfully",
    schema: { $ref: getSchemaPath(UserCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching user",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updateuser),
    new BusinessValidationInterceptor([EditUser, DeleteUser])
  )
  @RequirePermissions(Permission.DELETE_USER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lmsuserid`, type: "string", required: true })
  async deleteuser(
    @Param("lmsuserid") lmsuserid: string,
    @User() user: LmsUserToken
  ): Promise<any> {
    if(user.lmsuserid === lmsuserid) {
      return {
        error: true,
        errormessage: 'Can not delete current user!',
      }  
    }
    await new UserBusiness().disableuserbyid(lmsuserid);
    return {
      error: false,
      data: "User is deleted successfully!",
    };
  }

  @Post("")
  @ApiResponse({
    status: 200,
    description: "user fetch successfully",
    schema: { $ref: getSchemaPath(UserGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching user",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showalluser))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_USER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging): Promise<UserGetAllResponse> {
    const tempresult = await new UserBusiness().getusersall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return <UserGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @Get(":lmsuserid")
  @ApiResponse({
    status: 200,
    description: "User fetched sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching role",
  })
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lmsuserid`, type: "string", required: true })
  @RequirePermissions(Permission.VIEW_USER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiBearerAuth()
  async get(
    @Param("lmsuserid") lmsuserid: string
  ): Promise<any> {
    return {
      error: false,
      data: await new UserBusiness().getlmsuserbyid(lmsuserid),
    };
  }

  // @Put(":lmsuserid")
  // @ApiResponse({
  //   status: 200,
  //   description: "User fetched sucesfully",
  // })
  // @ApiResponse({
  //   status: 400,
  //   description: "Error while fetching role",
  // })
  // @HttpCode(HttpStatus.OK)
  // // @RequirePermissions(Permission.VIEW_STUDENT)
  // // @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  // @ApiParam({ name: `lmsuserid`, type: "string", required: true })
  // @UseGuards(AccessGuard(TokenType.ACCESS))
  // @ApiBearerAuth()
  // async updateUser(
  //   @Param("lmsuserid") lmsuserid: string
  // ): Promise<any> {
  //   return {
  //     error: false,
  //     data: await new UserBusiness().updateUser(lmsuserid),
  //   };
  // }
}
