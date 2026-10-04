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
  Response,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { CurriculumBaseLineBusiness } from "src/business/curriculumbaseline.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { curriculumbaselineAttributes } from "src/models/data-models/curriculumbaseline";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import {
  ActivateCurriculumBaseLine,
  CreateCurriculumBaseLine,
  CurriculumBaseLineName,
  DeleteCurriculumBaseLine,
} from "./curriculumbaseline.business.validator";
import {
  activatebaseline,
  createcurriculumbaseline,
  deletecurriculumbaseline,
  updatecurriculumbaseline,
} from "./curriculumbaseline.request.validator";
import {
  CurriculumBaseLineBase,
  CurriculumBaseLineCreateResponse,
  CurriculumBaseLineGetBase,
  CurriculumBaseLineGetResponse,
} from "./models/CurriculumBaseLineBase";
import { LmsUserToken } from "src/models/token.model";
import { User } from "src/decorators/user.decorator";
import { CurriculumBaseLineRequest } from "./models/CurriculumBaseLineRequest";
import { json2csv } from "json-2-csv";
import axios from "axios";
import { Config } from "src/config";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { assertSameOwner, callerOwner, ownerOfCurriculum, ownerOfCurriculumBaseline, ownerOfSchool } from "src/business/content-owner";
import { findOwnedBaseline, findOwnedCurriculum } from "src/business/content-scope";
import { schoolNotFound } from "src/business/school-identity";
import { schoolInScope } from "src/business/school-scope";

/**
 * A baseline has no owner of its own: its curriculum's. It may only be made for a curriculum the caller's
 * organisation owns, and only for a school of the curriculum's owner.
 */
const assertBaselineFits = async (curriculumid: string, schoolid: string | string[] | undefined, org: OrgContext) => {
  // the curriculum and every school named are the caller's, or not found (before any owner is compared)
  await findOwnedCurriculum(org, curriculumid);
  const schoolids = Array.isArray(schoolid) ? schoolid : schoolid ? [schoolid] : [];
  for (const id of schoolids) {
    if (!(await schoolInScope(org, id))) {
      throw schoolNotFound();
    }
  }
  const curriculumOwner = await ownerOfCurriculum(curriculumid);
  assertSameOwner(callerOwner(org), curriculumOwner);
  for (const id of schoolids) {
    assertSameOwner(curriculumOwner, await ownerOfSchool(id));
  }
};
// import { schoolsAttributes } from "src/models/data-models/school";

@ApiExtraModels(CurriculumBaseLineBase)
@ApiExtraModels(CurriculumBaseLineCreateResponse)
@ApiExtraModels(CurriculumBaseLineGetResponse)
@ApiTags("Curriculum Base Line")
@Controller("curriculumbaseline")
@ApiBearerAuth()
export class CurriculumBaseLineController {
  @OrgPolicy("owned")
  @Post("create")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line created successfully",
    schema: { $ref: getSchemaPath(CurriculumBaseLineCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating Curriculum Base Line",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createcurriculumbaseline),
    new BusinessValidationInterceptor([CreateCurriculumBaseLine,CurriculumBaseLineName])
  )
  @RequirePermissions(Permission.CREATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: CurriculumBaseLineBase,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<CurriculumBaseLineCreateResponse> {
    await assertBaselineFits(body.curriculumid, body.schoolid, org);
    const temp: curriculumbaselineAttributes = {
      baselineid: body.curriculumid,
      baselinename: body.baselinename,
      curriculumid: body.curriculumid,
      baselinetype: body.baselinetype,
      startdate: body.startdate,
      enddate: body.enddate,
      schoolid: body.schoolid,
      curriculumbaselineid: "",
      baselinestatus: false,
      isdeleted: false,
    };

    const data =
      await new CurriculumBaseLineBusiness(org).createCurriculumBaseLine(temp,user);
    return {
      error: false,
      data: data,
    };
  }

  @OrgPolicy("owned")
  @Delete(":curriculumbaselineid")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting Curriculum Base Line",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletecurriculumbaseline),
    new BusinessValidationInterceptor([DeleteCurriculumBaseLine])
  )
  @RequirePermissions(Permission.DELETE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumbaselineid`, type: "string", required: true })
  async delete(
    @Param("curriculumbaselineid") curriculumbaselineid: string,
    @User("") user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // the baseline in the path is the caller's, or not found
    await findOwnedBaseline(org, curriculumbaselineid, { where: { isdeleted: false } });
    await new CurriculumBaseLineBusiness(org).deleteCurriculumBaseLine(
      curriculumbaselineid,
      user
    );
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
  @Put("update/:curriculumbaselineid")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting Curriculum Base Line",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatecurriculumbaseline),
    new BusinessValidationInterceptor([DeleteCurriculumBaseLine,CurriculumBaseLineName])
  )
  @RequirePermissions(Permission.UPDATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumbaselineid`, type: "string", required: true })
  async update(
    @Param("curriculumbaselineid") curriculumbaselineid: string,
    @Body("") body: CurriculumBaseLineRequest,
    @User("") user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<CurriculumBaseLineCreateResponse> {
    // the baseline in the path is the caller's, or not found; so are the curriculum and the schools in the body
    await findOwnedBaseline(org, curriculumbaselineid, { where: { isdeleted: false } });
    await assertBaselineFits(body.curriculumid, body.schoolid, org);
    // Moving a baseline moves its questions with it: it may only go to a curriculum with the same owner as its current one
    // (a platform user who is not acting is judged by this alone).
    assertSameOwner(await ownerOfCurriculumBaseline(curriculumbaselineid), await ownerOfCurriculum(body.curriculumid));
    const data =  await new CurriculumBaseLineBusiness(org).updateCurriculumBaseLine(<curriculumbaselineAttributes>
      {
        curriculumbaselineid,
        curriculumid: body.curriculumid,
        // as on create: the curriculum the baseline is for, never a second id from the body
        baselineid: body.curriculumid,
        baselinename: body.baselinename,
        baselinetype: body.baselinetype,
        startdate: body.startdate,
        enddate: body.enddate,
        schoolid: body.schoolid,
      },user
    );
    return {
      error: false,
      data: data ?? undefined,
    }
  }

  @OrgPolicy("owned")
  @Put("activate/:curriculumbaselineid/:curriculumid")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting Curriculum Base Line",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(activatebaseline),
    new BusinessValidationInterceptor([DeleteCurriculumBaseLine,ActivateCurriculumBaseLine])
  )
  @RequirePermissions(Permission.UPDATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumbaselineid`, type: "string", required: true })
  // @ApiParam({ name: `baselinetype`, type: "number", required: true })
  async activate(
    @Param("curriculumbaselineid") curriculumbaselineid: string,
    @Param("curriculumid") curriculumid: string,
    @Org() org: OrgContext
  ): Promise<any> {
    // the baseline and the curriculum in the path are both the caller's, or not found
    await findOwnedBaseline(org, curriculumbaselineid, { where: { isdeleted: false } });
    await findOwnedCurriculum(org, curriculumid);
    const data  = await new CurriculumBaseLineBusiness(org).activateByCurriculumid(curriculumbaselineid, curriculumid);
    return {
      error: false,
      data: data ? data : undefined,
    }
  }

  @OrgPolicy("owned")
  @Put("deactivate/:curriculumbaselineid")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting Curriculum Base Line",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletecurriculumbaseline),
    new BusinessValidationInterceptor([DeleteCurriculumBaseLine])
  )
  @RequirePermissions(Permission.UPDATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumbaselineid`, type: "string", required: true })
  async deactivate(
    @Param("curriculumbaselineid") curriculumbaselineid: string,
    @Org() org: OrgContext
  ): Promise<any> {
    await findOwnedBaseline(org, curriculumbaselineid, { where: { isdeleted: false } });
    await new CurriculumBaseLineBusiness(org).deactivate(curriculumbaselineid);
    return {
      error: false,
      data: true,
    }
  }

  @OrgPolicy("owned")
  @Get("all")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line fetch successfully",
    schema: { $ref: getSchemaPath(CurriculumBaseLineGetResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching grade",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.VIEW_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getAll(@Org() org: OrgContext): Promise<CurriculumBaseLineGetResponse> {
    const data =
      await new CurriculumBaseLineBusiness(org).getAllCurriculumBaseLines();
    return {
      error: false,
      data: data
        ? data.map(
            (x) =>
              <CurriculumBaseLineGetBase><unknown>{
                baselineid: x.baseline.curriculumid,
                curriculumbaselineid: x.curriculumbaselineid,
                baselinename: x.baselinename,
                curriculumid: x.curriculum.curriculumid,
                curriculumname: x.curriculum.curriculumname,
                baselinestatus: x.baselinestatus,
                baselinetype: x.baselinetype,
                startdate: x.startdate,
                enddate: x.enddate,
                created_at: x.created_at,
                schoolid: x.schoolid,
              }
          )
        : undefined,
    };
  }

  @OrgPolicy("owned")
  @Get("query")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line fetch successfully",
    schema: { $ref: getSchemaPath(CurriculumBaseLineGetResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching grade",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.VIEW_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: "baselinename", required: false, type: 'string' })
  @ApiQuery({ name: "baselinetype", required: false, type: 'number' })
  async getQuery(
    @Query("baselinename") baselinename: string = '',
    @Query("baselinetype") baselinetype: number,
    @Org() org: OrgContext
  ): Promise<CurriculumBaseLineGetResponse> {
    const data =
      await new CurriculumBaseLineBusiness(org).getAllCurriculumBaseLinesQuery(baselinename,baselinetype);
    return {
      error: false,
      data: data
        ? data.map(
            (x) =>
              <CurriculumBaseLineGetBase><unknown>{
                baselineid: x.baseline.curriculumid,
                curriculumbaselineid: x.curriculumbaselineid,
                baselinename: x.baselinename,
                curriculumid: x.curriculum.curriculumid,
                curriculumname: x.curriculum.curriculumname,
                baselinestatus: x.baselinestatus,
                baselinetype: x.baselinetype,
                startdate: x.startdate,
                enddate: x.enddate,
                created_at: x.created_at,
                schoolid: x.schoolid,
              }
          )
        : undefined,
    };
  }

  @OrgPolicy("owned")
  @Get("getcurriculumbaseline/:curriculumbaselineid")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line fetch successfully",
    schema: { $ref: getSchemaPath(CurriculumBaseLineGetResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching grade",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletecurriculumbaseline)
  )
  @RequirePermissions(Permission.VIEW_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumbaselineid`, type: "string", required: true })
  async getBaselineId(
    @Param('curriculumbaselineid') curriculumbaselineid: string,
    @Org() org: OrgContext
  ):Promise<any>{
    await findOwnedBaseline(org, curriculumbaselineid, { where: { isdeleted: false } });
    const data = await new CurriculumBaseLineBusiness(org).getAllCurriculumBaseLinesid(curriculumbaselineid);
    return {
      error: false,
      data: data ? 
      {
        baselinename: data.data.baselinename,
        baselineid: data.data.baseline.curriculumid,
        curriculumbaselineid: data.data.curriculumbaselineid,
        curriculumbaselinename: data.data.baseline.curriculumname,
        curriculumid: data.data.curriculum.curriculumid,
        curriculumname: data.data.curriculum.curriculumname,
        baselinestatus: data.data.baselinestatus,
        baselinetype: data.data.baselinetype,
        startdate: data.data.startdate,
        enddate: data.data.enddate,
        schoolid: data.data.schoolid,
      }
      : undefined,
    }
  }

  @OrgPolicy("owned")
  @Get("school/:curriculumbaselineid")
  @ApiResponse({
    status: 200,
    description: "School Curriculum Base Line fetch successfully",
    schema: { $ref: getSchemaPath(CurriculumBaseLineGetResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching grade",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletecurriculumbaseline)
  )
  @RequirePermissions(Permission.VIEW_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumbaselineid`, type: "string", required: true })
  async getBaselineSchool(
    @Param('curriculumbaselineid') curriculumbaselineid: string,
    @Org() org: OrgContext
  ):Promise<any>{
    await findOwnedBaseline(org, curriculumbaselineid, { where: { isdeleted: false } });
    const data = await new CurriculumBaseLineBusiness(org).getSchoolBaseline(curriculumbaselineid);
    return {
      error: false,
      data: data ? data : undefined,
    }
  }

  @OrgPolicy("owned")
  @Get(":curriculumbaselineid/download")
  @ApiResponse({
    status: 200,
    description: "Student result exported sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting student result",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiParam({ name: `curriculumbaselineid`, type: "string", required: true })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  @ApiResponse({ status: 403, description: "Missing view_download_student" })
  // This streams a CSV of `studentfirstname`, `schoolusername`, `schoolname` and
  // each learner's assessment result. It had NO guard at all — the two lines
  // below were commented out — so it was an unauthenticated download of
  // children's names and scores. Demonstrated, not theorised: an anonymous GET
  // returned 200 and a row reading `សុខា,khmz3y6dh,Demo Primary School,…`.
  //
  // It looked harmless locally only because the proxy hop to the student API
  // 401s when the two sides' SERVER_SYNC_KEY defaults differ, which is the case
  // in local dev. Setting that key correctly is a REQUIRED go-live step, so
  // fixing the config is what would have armed this. The accident was never the
  // protection. See docs/authorization-model.md.
  //
  // Gated on `view_download_student` rather than the `view_baseline-endline`
  // the commented-out line named: Teacher holds view_baseline-endline, and this
  // payload is learner identity, which Teacher is deliberately denied
  // (PILOT.md, 16 Jul). `view_download_student` is the existing "may download
  // learner data" permission and Admin/Super Admin hold it. Note
  // @RequirePermissions is OR, not AND — listing more permissions here widens
  // access, it does not narrow it.
  @RequirePermissions(Permission.DOWNLOAD_STUDENTS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getStudentBaselineEndlineResults(
    @Param("curriculumbaselineid") curriculumbaselineid: string,
    @Response({ passthrough: true }) res: any,
    @Org() org: OrgContext
  ): Promise<any> {
    // the baseline in the path is the caller's, or not found (before the cloud server is asked for anything)
    await findOwnedBaseline(org, curriculumbaselineid, { where: { isdeleted: false } });
    const curbaseline = new CurriculumBaseLineBusiness(org);
    const studentresults = await curbaseline.getStudentBaselineEndlineResults(curriculumbaselineid);
    const response = await axios.get(
      `${Config.fortyk.api.rpi.cloud}/curriculum/${curriculumbaselineid}/getstudentresult`,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    );
    const fortmattedData = curbaseline.formatStudentBaselineEndlineResults([...studentresults, ...response.data]);
    const csvString = await json2csv(fortmattedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="students-results.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }
}
