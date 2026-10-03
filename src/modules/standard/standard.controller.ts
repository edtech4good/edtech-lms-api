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
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { StandardBusiness } from "src/business/standard.business";
import { findOwnedStandard, resolveOwnedSchoolRef } from "src/business/school-scope";
import { Org, OrgContext, OrgOrServer } from "src/decorators/org.decorator";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { PlatformGuard } from "src/guards/platform.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { standardsAttributes } from "src/models/data-models/standard";
import { Role, TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import { CreateResponseSchoolStandard, StandardBase, StandardCreateResponse } from "./models/StandardBase";
import { StandardGetAllResponse } from "./models/StandardGetAllResponse";
import { StandardRequest } from "./models/StandardRequest";
import { StandardResponse } from "./models/StandardResponse";
import { IMultiPaging } from '../../models/IPaging';

import {
  CreateStandard,
  DeleteStandard,
  EditStandard,
} from "./standard.business.validator";
import {
  createstandard,
  deletestandard,
  showallstandard,
  showstandard,
  updatestandard,
  showschoolid
} from "./standard.request.validator";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";

@ApiExtraModels(StandardBase)
@ApiExtraModels(StandardCreateResponse)
@ApiExtraModels(StandardResponse)
@ApiExtraModels(StandardGetAllResponse)
@ApiTags("Standard")
@Controller("standard")
@ApiBearerAuth()
export class StandardController {

  @OrgPolicy("owned")
  @Get('all')
  @ApiResponse({
    status: 200,
    description: "Fetched standards successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching standards",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  // Role.teacher reads: feeds the standard filter on the report screens.
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.organisationadmin, Role.teacher))
  @ApiQuery({ name: "standardname", required: false, type: 'string' })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @ApiQuery({ name: "schoolid", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getAllSchoolsWithFilter(
    @Query("standardname") standardname: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("schoolid") schoolid: string = '',
    @OrgOrServer() org: OrgContext,
  ): Promise<any> {
    // The school is named by id or by name; resolved once, here, among the caller's schools (unknown or not theirs: 404).
    const school = await resolveOwnedSchoolRef(org, { schoolid, schoolname });
    const data = await new StandardBusiness().getStandardsWithFilter(standardname, school?.schoolid, org);
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned")
  @Post("create")
  @ApiResponse({
    status: 200,
    description: "standard created successfully",
    schema: { $ref: getSchemaPath(StandardCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating standard",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createstandard),
    new BusinessValidationInterceptor([CreateStandard])
  )
  @RequirePermissions(Permission.CREATE_STANDARD)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: StandardRequest,
    @User() user: LmsUserToken,
    @Org() org: OrgContext,
  ): Promise<StandardCreateResponse> {
    const temp: standardsAttributes = {
      standardname: body.standardname,
      schoolid: body.schoolid,
      standardid: "",
      schoolname: '',
      isdeleted: false,
    };

    const data = await new StandardBusiness().createstandard(temp, user, org);
    return {
      error: false,
      data: data,
    };
  }

  @OrgPolicy("owned")
  @Delete(":standardid")
  @ApiResponse({
    status: 200,
    description: "standard deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting standard",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletestandard),
    new BusinessValidationInterceptor([DeleteStandard])
  )
  @RequirePermissions(Permission.DELETE_STANDARD)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `standardid`, type: "string", required: true })
  async delete(
    @Param("standardid") standardid: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext,
  ): Promise<ResponseBoolean> {
    await new StandardBusiness().deletestandard(standardid, user, org);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
  @Get(":standardid")
  @ApiResponse({
    status: 200,
    description: "standard fetch successfully",
    schema: { $ref: getSchemaPath(StandardCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching standard",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showstandard),
  )
  @RequirePermissions(Permission.VIEW_STANDARD)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `standardid`, type: "string", required: true })
  async get(
    @Param("standardid") standardid: string,
    @Org() org: OrgContext,
  ): Promise<StandardCreateResponse> {
    return {
      error: false,
      data: await findOwnedStandard(org, standardid),
    };
  }

  @OrgPolicy("owned")
  @Put(":standardid")
  @ApiResponse({
    status: 200,
    description: "standard update successfully",
    schema: { $ref: getSchemaPath(StandardCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching standard",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestandard),
    new BusinessValidationInterceptor([EditStandard])
  )
  @RequirePermissions(Permission.UPDATE_STANDARD)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `standardid`, type: "string", required: true })
  async update(
    @Param("standardid") standardid: string,
    @Body() body: StandardRequest,
    @User() user: LmsUserToken,
    @Org() org: OrgContext,
  ): Promise<StandardCreateResponse> {
    const data = await new StandardBusiness().updatestandardName(<standardsAttributes>{
      standardid: standardid,
      standardname: body.standardname,
      schoolid: body.schoolid,
      schoolname: '',
    }, user, org);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @OrgPolicy("owned")
  @Post("")
  @ApiResponse({
    status: 200,
    description: "standards fetch successfully",
    schema: { $ref: getSchemaPath(StandardGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching standard",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallstandard))
  @ApiBody({ required: false, type: IMultiPaging })
  @RequirePermissions(Permission.VIEW_STANDARD)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IMultiPaging, @Org() org: OrgContext): Promise<StandardGetAllResponse> {
    const tempresult = await new StandardBusiness().getstandardall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    }, org);
    return <StandardGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  // Super Admin only: a destructive one-off data migration. Was guarded by a
  // `:key` matching ADD_PERMISSIONS_KEY, a constant committed to this public
  // repo, so any authenticated staff account could run it. See
  // docs/authorization-model.md.
  @OrgPolicy("platform", { note: "One-off migration across all organisations; platform only." })
  @Post("migrate-standardid")
  @ApiResponse({
    status: 200,
    description: "migrated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while migrating",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.superadmin), PlatformGuard)
  @HttpCode(HttpStatus.OK)
  async migrateStandards(): Promise<any> {
    await new StandardBusiness().migrateStandards();
    return {
      error: false,
      data: "Migrated successfully!",
    }
  }

  // Super Admin only: hard-deletes standards with no students (same public-key
  // history as migrate-standardid above).
  @OrgPolicy("platform", { note: "One-off migration across all organisations; platform only." })
  @Post("remove-standardid")
  @ApiResponse({
    status: 200,
    description: "migrated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while migrating",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.superadmin), PlatformGuard)
  @HttpCode(HttpStatus.OK)
  async removeStandards(): Promise<any> {
    await new StandardBusiness().removeStandards();
    return {
      error: false,
      data: "Removed class successfully!",
    }
  }
  
  @OrgPolicy("owned")
  @Get("school/:schoolid")
  @ApiResponse({
    status: 200,
    description: "standard fetch successfully",
    schema: { $ref: getSchemaPath(CreateResponseSchoolStandard) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching standard",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showschoolid),
  )
  @RequirePermissions(Permission.VIEW_STANDARD)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `schoolid`, type: "string", required: true })
  async getSchoolid(
    @Param("schoolid") schoolid: string,
    @Org() org: OrgContext,
  ): Promise <CreateResponseSchoolStandard> {
    const data = await new StandardBusiness().getSchoolidStandard(schoolid, org);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }
}
