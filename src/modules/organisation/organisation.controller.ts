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
import { OrganisationBusiness } from "src/business/organisation.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { PlatformGuard } from "src/guards/platform.guard";
import {
  BusinessValidationInterceptor,
  SchemaValidationInterceptor,
} from "src/interceptors";
import { RejectPrototypeKeysInterceptor } from "src/interceptors/rejectprototypekeys.interceptor";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import {
  CreateOrganisation,
  UpdateOrganisation,
} from "./organisation.business.validator";
import {
  createorganisation,
  deleteorganisation,
  showallorganisation,
  showorganisation,
  updateorganisation,
} from "./organisation.request.validator";
import { OrganisationBase } from "./models/OrganisationBase";
import {
  OrganisationCreateRequest,
  OrganisationUpdateRequest,
} from "./models/OrganisationRequest";
import {
  OrganisationCreateResponse,
  OrganisationGetAllResponse,
} from "./models/OrganisationResponse";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";

/**
 * Organisations (docs/admin-organisations-schema.md): platform-only for now.
 *
 * Every route has the same three guards, in this order:
 *  1. AccessGuard(TokenType.ACCESS) - a valid, current staff access token (no
 *     role list, so the application API key is not accepted: 401);
 *  2. PlatformGuard - the one place that says who the platform is (403 for
 *     anyone else, including a staff user without Super Admin);
 *  3. CheckPermissionsGuard with the route's permission.
 */
@ApiExtraModels(OrganisationBase)
@ApiExtraModels(OrganisationCreateResponse)
@ApiTags("Organisation")
@Controller("organisation")
@ApiBearerAuth()
export class OrganisationController {
  @OrgPolicy("platform")
  @Get("")
  @ApiResponse({
    status: 200,
    description: "Organisations fetched successfully",
    schema: { $ref: getSchemaPath(OrganisationGetAllResponse) },
  })
  @ApiResponse({ status: 400, description: "Invalid paging or filter" })
  @ApiResponse({ status: 401, description: "Not signed in" })
  @ApiResponse({ status: 403, description: "Not the platform, or no view_organisation" })
  @ApiResponse({ status: 500, description: "Server error" })
  @ApiQuery({ name: "pageindex", required: false, type: "number", description: "1-based; 0 and 1 are the first page" })
  @ApiQuery({ name: "pagesize", required: false, type: "number", description: "Default 20, at most 200" })
  @ApiQuery({ name: "organisationname", required: false, type: "string", description: "Name contains this text" })
  @UseInterceptors(new SchemaValidationInterceptor(showallorganisation))
  @RequirePermissions(Permission.VIEW_ORGANISATION)
  @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard, CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(
    @Query("pageindex") pageindex?: string,
    @Query("pagesize") pagesize?: string,
    @Query("organisationname") organisationname?: string,
  ): Promise<OrganisationGetAllResponse> {
    const result = await new OrganisationBusiness().getorganisationall({
      pageindex: Number(pageindex) || 0,
      pagesize: Number(pagesize) || 0,
      organisationname: organisationname ?? "",
    });
    return <OrganisationGetAllResponse>{
      error: false,
      data: {
        data: result.rows,
        total: result.count,
        pageindex: result.pageindex,
        pagesize: result.pagesize,
      },
    };
  }

  @OrgPolicy("platform")
  @Get(":organisationid")
  @ApiResponse({
    status: 200,
    description: "Organisation fetched successfully",
    schema: { $ref: getSchemaPath(OrganisationCreateResponse) },
  })
  @ApiResponse({ status: 401, description: "Not signed in" })
  @ApiResponse({ status: 403, description: "Not the platform, or no view_organisation" })
  @ApiResponse({ status: 404, description: "No such organisation" })
  @ApiParam({ name: "organisationid", type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(showorganisation))
  @RequirePermissions(Permission.VIEW_ORGANISATION)
  @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard, CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async get(
    @Param("organisationid") organisationid: string,
  ): Promise<OrganisationCreateResponse> {
    const data = await new OrganisationBusiness().getorganisationbyid(organisationid);
    return { error: false, data };
  }

  @OrgPolicy("platform")
  @Post("")
  @ApiResponse({
    status: 200,
    description: "Organisation created successfully",
    schema: { $ref: getSchemaPath(OrganisationCreateResponse) },
  })
  @ApiResponse({ status: 400, description: "Invalid input" })
  @ApiResponse({ status: 401, description: "Not signed in" })
  @ApiResponse({ status: 403, description: "Not the platform, or no create_organisation" })
  @ApiResponse({ status: 409, description: "That name or code is already in use" })
  @ApiResponse({ status: 500, description: "Server error" })
  @ApiBody({ type: OrganisationCreateRequest })
  @UseInterceptors(
    new RejectPrototypeKeysInterceptor(),
    new SchemaValidationInterceptor(createorganisation),
    new BusinessValidationInterceptor([CreateOrganisation]),
  )
  @RequirePermissions(Permission.CREATE_ORGANISATION)
  @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard, CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: OrganisationCreateRequest,
    @User() user: LmsUserToken,
  ): Promise<OrganisationCreateResponse> {
    const data = await new OrganisationBusiness().createorganisation(
      {
        organisationname: body.organisationname.trim(),
        organisationcode: body.organisationcode,
        organisationshortname: body.organisationshortname,
        organisationpreset: body.organisationpreset,
        uitheme: body.uitheme,
        brandingconfig: body.brandingconfig,
      },
      body.countryids,
      user,
    );
    return { error: false, data };
  }

  @OrgPolicy("platform")
  @Put(":organisationid")
  @ApiResponse({
    status: 200,
    description: "Organisation updated successfully",
    schema: { $ref: getSchemaPath(OrganisationCreateResponse) },
  })
  @ApiResponse({ status: 400, description: "Invalid input, or an attempt to change the code or preset" })
  @ApiResponse({ status: 401, description: "Not signed in" })
  @ApiResponse({ status: 403, description: "Not the platform, or no update_organisation" })
  @ApiResponse({ status: 404, description: "No such organisation" })
  @ApiResponse({ status: 409, description: "That name is already in use" })
  @ApiResponse({ status: 500, description: "Server error" })
  @ApiParam({ name: "organisationid", type: "string", required: true })
  @ApiBody({ type: OrganisationUpdateRequest })
  @UseInterceptors(
    new RejectPrototypeKeysInterceptor(),
    new SchemaValidationInterceptor(updateorganisation),
    new BusinessValidationInterceptor([UpdateOrganisation]),
  )
  @RequirePermissions(Permission.UPDATE_ORGANISATION)
  @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard, CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async update(
    @Param("organisationid") organisationid: string,
    @Body() body: OrganisationUpdateRequest,
    @User() user: LmsUserToken,
  ): Promise<OrganisationCreateResponse> {
    const data = await new OrganisationBusiness().updateorganisation(
      organisationid,
      {
        organisationname: body.organisationname.trim(),
        organisationshortname: body.organisationshortname,
        uitheme: body.uitheme,
        brandingconfig: body.brandingconfig,
        organisationstatus: body.organisationstatus,
      },
      body.countryids,
      user,
    );
    return { error: false, data };
  }

  @OrgPolicy("platform")
  @Delete(":organisationid")
  @ApiResponse({
    status: 200,
    description: "Organisation deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({ status: 401, description: "Not signed in" })
  @ApiResponse({ status: 403, description: "Not the platform, or no delete_organisation" })
  @ApiResponse({ status: 404, description: "No such organisation" })
  @ApiResponse({ status: 500, description: "Server error" })
  @ApiParam({ name: "organisationid", type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(deleteorganisation))
  @RequirePermissions(Permission.DELETE_ORGANISATION)
  @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard, CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param("organisationid") organisationid: string,
    @User() user: LmsUserToken,
  ): Promise<ResponseBoolean> {
    await new OrganisationBusiness().deleteorganisation(organisationid, user);
    return { error: false, data: true };
  }
}
