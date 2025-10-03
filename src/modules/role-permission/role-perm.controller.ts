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
import { RolePermissionBusiness } from "src/business/role-permission.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { BusinessValidationInterceptor, SchemaValidationInterceptor } from "src/interceptors";
import { permissionsTitleAttributes } from "src/models/data-models/permissionstitle";
// import { permissionsAttributes } from "src/models/data-models/permissions";
import { rolesAttributes } from "src/models/data-models/roles";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
// import { IPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { RoleGetAllResponse } from "./models/RoleGetAllResponse";
import { BindUserRolesRequest, OnePermissionRequest, PermissionRequest, RoleRequest } from "./models/RoleRequest";
import { PermCreateResponse, PermissionGetAllResponse, PermissionNodeGetAllResponse, RoleCreateResponse } from "./models/RoleResponse";
import { CheckKey, DeleteRole, EditRole } from "./role-perm.business.validator";
import { bindUserRoles, createsPerm, createsRole, deleterole, showallroles, updaterole } from "./role-perm.request.validator";
import { IMultiPaging } from '../../models/IPaging';

@ApiTags("Role-Permission")
@Controller("roles")
// @ApiExtraModels(FeedbackResponse)
@ApiExtraModels(RoleGetAllResponse)
// @ApiExtraModels(FeedbackCreateResponse)
@ApiResponse({
  status: 500,
  description: "Server error",
})
@ApiBearerAuth()
export class RolePermissionController {
  @Get(":roleid")
  @ApiResponse({
    status: 200,
    description: "Role fetched sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching role",
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_ROLE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiParam({ name: `roleid`, type: "string", required: true })
  async get(
    @Param("roleid") roleid: string
  ): Promise<any> {
    return {
      error: false,
      data: await new RolePermissionBusiness().getRolebyid(roleid),
    };
  }

  @Get("permissions")
  @ApiResponse({
    status: 200,
    description: "Permissions fetched sucesfully",
    schema: { $ref: getSchemaPath(PermissionGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching permissions",
  })
  @RequirePermissions(Permission.VIEW_ROLE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getPerms(): Promise<PermissionGetAllResponse> {
    return {
      error: false,
      data: await new RolePermissionBusiness().getallPerms(),
    };
  }

  @Get("node/permissions")
  @ApiResponse({
    status: 200,
    description: "Permissions fetched sucesfully",
    schema: { $ref: getSchemaPath(PermissionNodeGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching permissions",
  })
  @RequirePermissions(Permission.VIEW_ROLE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getPermsNode(): Promise<PermissionNodeGetAllResponse> {
    return {
      error: false,
      data: await new RolePermissionBusiness().getallPermsNode(),
    };
  }

  @Post("")
  @ApiResponse({
      status: 200,
      description: "Countries fetch successfully",
      schema: { $ref: getSchemaPath(RoleGetAllResponse) },
  })
  @ApiResponse({
      status: 400,
      description: "Error while fetching country",
  })
  @ApiResponse({
      status: 500,
      description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallroles))
  @ApiBody({ required: false, type: IMultiPaging })
  @RequirePermissions(Permission.VIEW_ROLE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IMultiPaging): Promise<RoleGetAllResponse> {
      const tempresult = await new RolePermissionBusiness().getallRoles({
          pageindex: body?.pageindex || 0,
          pagesize: body?.pagesize || 0,
          filter: body?.filter || []
      });
      return <RoleGetAllResponse>{
          error: false,
          data: {
              data: tempresult.rows,
              total: tempresult.count,
              pageindex: body?.pageindex || 0,
              pagesize: body?.pagesize || 0,
          },
      };
  }

  @Post("create")
  @ApiResponse({
    status: 200,
    description: "role created successfully",
    schema: { $ref: getSchemaPath(RoleCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating role",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createsRole),
    // new BusinessValidationInterceptor([CreateFeedback])
  )
  @RequirePermissions(Permission.CREATE_ROLE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: RoleRequest,
    @User() user: LmsUserToken
  ): Promise<RoleCreateResponse> {
    const temp: rolesAttributes = {
      roleid: "",
      rolename: body.rolename,
      perms: body.permissionsid
    };
    const data = await new RolePermissionBusiness().createRole(temp, user);
    return {
      error: false,
      data: data,
    };
  }

  @Post("create-perm/:key")
  @ApiResponse({
    status: 200,
    description: "permission created successfully",
    schema: { $ref: getSchemaPath(PermCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating permission",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createsPerm),
    new BusinessValidationInterceptor([CheckKey])
  )
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `key`, type: "string", required: true })
  async createpermission(
    @Param("key") key: string,
    @Body() body: PermissionRequest
  ): Promise<PermCreateResponse> {
    const temp: permissionsTitleAttributes = {
      permissiontitleid: "",
      permissiontitle: body.permissiontitle,
      permissiondesc: body.permissiondesc
    };
    const data = await new RolePermissionBusiness().createPerm(temp);
    return {
      error: false,
      data: data,
    };
  }

  @Get("create-perm/:key")
  @ApiResponse({
    status: 200,
    description: "permissions created successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating permissions",
  })
  @UseInterceptors(
    new BusinessValidationInterceptor([CheckKey])
  )
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `key`, type: "string", required: true })
  async createpermissions(): Promise<any> {
    const data = await new RolePermissionBusiness().createAllPerms();
    return {
      error: false,
      data: data,
    };
  }

  @Post("create-one-permission/:key")
  @ApiResponse({
    status: 200,
    description: "permission created successfully",
    schema: { $ref: getSchemaPath(PermCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating permission",
  })
  @UseInterceptors(
    new BusinessValidationInterceptor([CheckKey])
  )
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `key`, type: "string", required: true })
  async createonepermission(
    @Param("key") key: string,
    @Body() body: OnePermissionRequest
  ): Promise<PermCreateResponse> {
    const temp: permissionsTitleAttributes = {
      permissiontitleid: "",
      permissiontitle: body.permissiontitle,
      permissiondesc: body.permissiontitledesc
    };
    const data = await new RolePermissionBusiness().createOnePerm(temp, body.permissionname, body.permissiondesc);
    return {
      error: false,
      data: data,
    };
  }

  // @Post("bind-perm")
  // @ApiResponse({
  //   status: 200,
  //   description: "role-permission binded successfully",
  //   schema: { $ref: getSchemaPath(RolePermCreateResponse) },
  // })
  // @ApiResponse({
  //   status: 400,
  //   description: "Error while binding role-permission",
  // })
  // @UseInterceptors(
  //   new SchemaValidationInterceptor(bindRolesPerms),
  //   // new BusinessValidationInterceptor([CreateFeedback])
  // )
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(AccessGuard(TokenType.ACCESS))
  // @ApiBearerAuth()
  // async bindrolepermission(
  //   @Body() body: BindRolePermissionRequest
  // ): Promise<RolePermCreateResponse> {
  //   // const temp: permissionsAttributes = {
  //   //   permissionid: "",
  //   //   permissionname: body.permissionname
  //   // };
  //   const data = await new RolePermissionBusiness().bindRolePerms(body);
  //   return {
  //     error: false,
  //     data: data,
  //   };
  // }

  @Post("user-bind-role")
  @ApiResponse({
    status: 200,
    description: "user-role binded successfully",
    // schema: { $ref: getSchemaPath(PermCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while binding user-role",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(bindUserRoles),
    // new BusinessValidationInterceptor([CreateFeedback])
  )
  @RequirePermissions(Permission.UPDATE_USER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async binduserrole(
    @Body() body: BindUserRolesRequest
  ) {
    // const temp: permissionsAttributes = {
    //   permissionid: "",
    //   permissionname: body.permissionname
    // };
    const data = await new RolePermissionBusiness().bindUserRoles(body);
    return {
      error: false,
      data: data,
    };
  }

  @Put(":roleid")
  @ApiResponse({
      status: 200,
      description: "Role fetch successfully",
      // schema: { $ref: getSchemaPath(CountryCreateResponse) },
  })
  @ApiResponse({
      status: 400,
      description: "Error while fetching country",
  })
  @UseInterceptors(
      new SchemaValidationInterceptor(updaterole),
      new BusinessValidationInterceptor([EditRole])
  )
  @RequirePermissions(Permission.UPDATE_ROLE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `roleid`, type: "string", required: true })
  async update(
      @Param("roleid") roleid: string,
      @Body() body: RoleRequest,
      @User() user: LmsUserToken
  ): Promise<any> {
      const data = await new RolePermissionBusiness().updateRole(<rolesAttributes>{
          roleid: roleid,
          rolename: body.rolename,
          perms: body.permissionsid
      }, user);
      return {
          error: false,
          data: data ? data : undefined,
      };
  }

  @Get("")
  @ApiResponse({
    status: 200,
    description: "Role fetched sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching role",
  })
  @RequirePermissions(Permission.VIEW_ROLE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getAllRoles(): Promise<any> {
    return {
      error: false,
      data: await new RolePermissionBusiness().getallroles(),
    };
  }

  @Delete(":roleid")
  @ApiResponse({
      status: 200,
      description: "Role deleted successfully",
      schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
      status: 400,
      description: "Error while deleting role",
  })
  @ApiResponse({
      status: 500,
      description: "Server error",
  })
  @UseInterceptors(
      new SchemaValidationInterceptor(deleterole),
      new BusinessValidationInterceptor([DeleteRole])
  )
  @RequirePermissions(Permission.DELETE_ROLE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `roleid`, type: "string", required: true })
  async delete(
      @Param("roleid") roleid: string,
      // @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
      await new RolePermissionBusiness().deleterole(roleid);
      return {
          error: false,
          data: true,
      };
  }
}
