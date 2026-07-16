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
// import { permissionsAttributes } from "src/models/data-models/permissions";
import { rolesAttributes } from "src/models/data-models/roles";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
// import { IPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { RoleGetAllResponse } from "./models/RoleGetAllResponse";
import { BindUserRolesRequest, RoleRequest } from "./models/RoleRequest";
import { PermissionGetAllResponse, PermissionNodeGetAllResponse, RoleCreateResponse } from "./models/RoleResponse";
import { DeleteRole, EditRole } from "./role-perm.business.validator";
import { bindUserRoles, createsRole, deleterole, showallroles, updaterole } from "./role-perm.request.validator";
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

  // Removed 16 Jul 2026: POST/GET `create-perm/:key` and
  // POST `create-one-permission/:key`. They created permission rows guarded
  // only by AccessGuard with no role (any authenticated staff account) plus a
  // `:key` that was ADD_PERMISSIONS_KEY — a constant committed to this public
  // repo (md5("40kplus")), so no protection at all. createAllPerms is fully
  // replaced by migrations 20260407120500 + 20260716140000, which run the same
  // generator idempotently in every environment as the provisioning step.
  // Worse, createOnePerm let any staff account add an arbitrary permission row,
  // which inflates COUNT(*) of permissions and so strips the `superadmin`
  // wildcard (awarded by count) from every Super Admin. No client called any of
  // them. Removed rather than gated, like POST /auth/register — see
  // docs/authorization-model.md.

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
