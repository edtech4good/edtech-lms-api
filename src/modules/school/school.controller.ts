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
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import {
  BusinessValidationInterceptor,
  SchemaValidationInterceptor,
} from "src/interceptors";
import { schoolsAttributes } from "src/models/data-models/school";
import { Role, TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { IMultiPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { SchoolBusiness } from "../../business/school.business";
import { SchoolCreateResponse } from "./models/SchoolBase";
import { SchoolGetAllByCountry, SchoolGetAllByCurriculum, SchoolGetAllResponse } from "./models/SchoolGetAllResponse";
import { SchoolGetAllTeacherResponse } from "./models/SchoolGetAllTeacherResponse";
import { SchoolRequest } from "./models/SchoolRequest";
import { SchoolCurriculumResponse } from "./models/SchoolResponse";
import { CreateSchool, DeleteSchool, EditSchool } from "./school.business.validator";
import {
  createschool,
  deleteschool,
  showallschool,
  showschool,
  showschoolscurriculum,
  updateschool,
} from "./school.request.validator";

@ApiTags("School")
@Controller("school")
@ApiExtraModels(
  SchoolGetAllResponse,
  SchoolGetAllTeacherResponse,
  SchoolGetAllByCountry,
  SchoolCurriculumResponse
)
@ApiResponse({
  status: 500,
  description: "Server error",
})
@ApiBearerAuth()
export class SchoolController {

  // Unguarded on purpose: the mobile app needs branding (logo, display name,
  // kids/corporate theme) before a user has logged in, to paint the login
  // screen itself. No guard, no permission check. Declared before every
  // ":param" GET route below (Nest/Express match in declaration order) so
  // `/school/branding` isn't swallowed by `@Get(":schoolid")`. Always
  // resolving to 200 (never 404) isn't an anti-enumeration measure — a
  // 'corporate' vs 'kids' response already distinguishes real schools from
  // unknown ones — it exists so the app never has to special-case a 404 and
  // so any lookup failure fails open to the safe 'kids' default.
  @Get("branding")
  @ApiResponse({
    status: 200,
    description: "School branding fetched successfully",
  })
  @ApiQuery({ name: "schoolname", required: false, type: "string" })
  @HttpCode(HttpStatus.OK)
  async getBranding(
    @Query("schoolname") schoolname: unknown
  ): Promise<any> {
    const defaultBranding = { uitheme: "kids", brandingconfig: null };
    // Express parses `?schoolname[x]=1` into an object, not a string; that
    // would reach Sequelize's `where` and throw. Anything that isn't a
    // non-empty string skips the query entirely and fails open to the
    // default rather than surfacing a 500.
    if (typeof schoolname !== "string" || !schoolname) {
      return { error: false, data: defaultBranding };
    }
    const school = await new SchoolBusiness().getschoolbyname(schoolname);
    if (!school) {
      return { error: false, data: defaultBranding };
    }
    return {
      error: false,
      data: {
        uitheme: school.uitheme ?? "kids",
        brandingconfig: school.brandingconfig ?? null,
      },
    };
  }

  @Get('all')
  @ApiResponse({
    status: 200,
    description: "Fetched schools successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching schools",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @ApiQuery({ name: "countryid", required: false, type: 'string' })
  @ApiQuery({ name: "school", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getAllSchoolsWithFilter(
    @Query("countryid") countryid: string = '',
    @Query("school") schoolname: string = '',
    @User() user: LmsUserToken,
  ): Promise<any> {
    const data = await new SchoolBusiness().getSchoolsWithFilter(schoolname, countryid, user);
    return {
        data: data,
        error: false,
    };
  }

  @Get("")
  @ApiResponse({
    status: 200,
    description: "School exported sucesfully",
    schema: { $ref: getSchemaPath(SchoolGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting school",
  })
  // Role.teacher reads: feeds the school filter on the report screens.
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher))
  @HttpCode(HttpStatus.OK)
  async getAllSchools(): Promise<any> {
    return {
      error: false,
      data: await new SchoolBusiness().getallschools(),
    };
  }

  @Get("country/:countryid")
  @ApiResponse({
    status: 200,
    description: "School fetched sucesfully",
    schema: { $ref: getSchemaPath(SchoolGetAllByCountry) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching school",
  })
  @ApiParam({ name: `countryid`, type: "string", required: true })
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin))
  @HttpCode(HttpStatus.OK)
  async getSchool(
    @Param("countryid") countryid: string
  ): Promise<SchoolGetAllByCountry> {

    return {
      error: false,
      data: await new SchoolBusiness().getschoolsbycountry(countryid),
    };
  }

  @Get("country/:countryid/curriculum/:curriculumid")
  @ApiResponse({
    status: 200,
    description: "School's curriculum fetched sucesfully",
    schema: { $ref: getSchemaPath(SchoolGetAllByCountry) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching school's curriculum",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showschoolscurriculum),
    // new BusinessValidationInterceptor([EditSchool])
  )
  @ApiParam({ name: `countryid`, type: "string", required: true })
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin))
  @HttpCode(HttpStatus.OK)
  async getSchoolCurriculum(
    @Param("countryid") countryid: string,
    @Param("curriculumid") curriculumid: string
  ): Promise<SchoolGetAllByCountry> {
    const response = new SchoolGetAllByCountry();
    const allSchools = await new SchoolBusiness().getschoolsbycountry(countryid);
    const filterSchools = allSchools.filter(school => school.curriculums.find(curid => curid === curriculumid));
    filterSchools ? response.data = filterSchools : response.data = [];
    response.error = false;
    return response;
  }

  @Get('curriculumid')
  @ApiResponse({
    status: 200,
    description: "Fetched schools successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching schools",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @ApiQuery({ name: "curriculumid", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getSchoolsCurriculum(
    @Query("curriculumid") curriculumid: string = '',
    @User() user: LmsUserToken,
  ): Promise<SchoolGetAllByCurriculum> {
    const data = new SchoolGetAllByCurriculum();
    const allSchool = await new SchoolBusiness().getSchoolsWithFilter('', '', user);
    const filterSchool = allSchool.filter(school => (school.curriculums ?? []).find(curid => curid === curriculumid));
    filterSchool ? data.data = filterSchool : data.data = [];
    data.error = false;
    return data;
  }

  @Post("create")
  @ApiResponse({
    status: 200,
    description: "School created successfully",
    schema: { $ref: getSchemaPath(SchoolCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating document tag",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createschool),
    new BusinessValidationInterceptor([CreateSchool])
  )
  @RequirePermissions(Permission.CREATE_SCHOOL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async createschool(
    @Body() body: SchoolRequest,
    @User() user: LmsUserToken
  ): Promise<SchoolCreateResponse> {
    const temp: schoolsAttributes = {
      schoolname: body.schoolname,
      countryid: body.countryid,
      curriculums: body.curriculums,
      schoolid: "",
      isdeleted: false,
    };

    const data = await new SchoolBusiness().createschool(temp, user);
    return {
      error: false,
      data: data,
    };
  }

  @Delete(":schoolid")
  @ApiResponse({
    status: 200,
    description: "School deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting document tag",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deleteschool),
    new BusinessValidationInterceptor([DeleteSchool])
  )
  @RequirePermissions(Permission.DELETE_SCHOOL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `schoolid`, type: "string", required: true })
  async delete(
    @Param("schoolid") schoolid: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new SchoolBusiness().deleteschool(schoolid, user);
    return {
      error: false,
      data: true,
    };
  }

  @Get(":schoolid")
  @ApiResponse({
    status: 200,
    description: "School fetch successfully",
    schema: { $ref: getSchemaPath(SchoolCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching school",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showschool),
    // new BusinessValidationInterceptor([EditSchool])
  )
  @RequirePermissions(Permission.VIEW_SCHOOL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `schoolid`, type: "string", required: true })
  async get(
    @Param("schoolid") schoolid: string
  ): Promise<SchoolCreateResponse> {
    const data = await new SchoolBusiness().getschoolbyid(schoolid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Put("update/:schoolid")
  @ApiResponse({
    status: 200,
    description: "School fetch successfully",
    schema: { $ref: getSchemaPath(SchoolCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching document tag",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updateschool),
    new BusinessValidationInterceptor([EditSchool])
  )
  @RequirePermissions(Permission.UPDATE_SCHOOL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `schoolid`, type: "string", required: true })
  @UseGuards(AccessGuard(TokenType.ACCESS))
  async update(
    @Param("schoolid") schoolid: string,
    @Body() body: SchoolRequest,
    @User() user: LmsUserToken
  ): Promise<SchoolCreateResponse> {
    const data = await new SchoolBusiness().updateschoolName(<schoolsAttributes>{
      schoolid: schoolid,
      schoolname: body.schoolname,
      countryid: body.countryid,
      curriculums: body.curriculums,
      uitheme: body.uitheme
    }, user);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Post("")
  @ApiResponse({
    status: 200,
    description: "Schools fetch successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching document tag",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallschool))
  @ApiBody({ required: false, type: IMultiPaging })
  @RequirePermissions(Permission.VIEW_SCHOOL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IMultiPaging): Promise<any> {
    const tempresult = await new SchoolBusiness().getschoolall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return {
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @Get(":schoolid/curriculums")
  @ApiResponse({
    status: 200,
    description: "School's curriculums fetch successfully",
    schema: { $ref: getSchemaPath(SchoolCurriculumResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching document tag",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showschool),
    // new BusinessValidationInterceptor([EditSchool])
  )
  @RequirePermissions(Permission.VIEW_SCHOOL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `schoolid`, type: "string", required: true })
  async getCurriculums(
    @Param("schoolid") schoolid: string
  ): Promise<SchoolCurriculumResponse> {
    const response = new SchoolCurriculumResponse();
    const schoolbusiness = new SchoolBusiness();
    const school = await schoolbusiness.getschoolbyid(schoolid);
    try {
      response.data = await schoolbusiness.getschoolcurriculums(schoolid, school?.curriculums as [string]);
      response.error = false;
    } catch (error) {
      response.error = true;
      response.errormessage = "Could not get curriculums!";
    }
    return response;
  }
}
