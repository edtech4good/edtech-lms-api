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
// import { schoolsAttributes } from "src/models/data-models/school";

@ApiExtraModels(CurriculumBaseLineBase)
@ApiExtraModels(CurriculumBaseLineCreateResponse)
@ApiExtraModels(CurriculumBaseLineGetResponse)
@ApiTags("Curriculum Base Line")
@Controller("curriculumbaseline")
@ApiBearerAuth()
export class CurriculumBaseLineController {
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
    @User() user: LmsUserToken
  ): Promise<CurriculumBaseLineCreateResponse> {
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
      await new CurriculumBaseLineBusiness().createCurriculumBaseLine(temp,user);
    return {
      error: false,
      data: data,
    };
  }

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
    @User("") user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new CurriculumBaseLineBusiness().deleteCurriculumBaseLine(
      curriculumbaselineid,
      user
    );
    return {
      error: false,
      data: true,
    };
  }

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
    new SchemaValidationInterceptor(deletecurriculumbaseline),
    new BusinessValidationInterceptor([DeleteCurriculumBaseLine,CurriculumBaseLineName])
  )
  @RequirePermissions(Permission.UPDATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumbaselineid`, type: "string", required: true })
  async update(
    @Param("curriculumbaselineid") curriculumbaselineid: string,
    @Body("") body: CurriculumBaseLineRequest,
    @User("") user: LmsUserToken
  ): Promise<CurriculumBaseLineCreateResponse> {
    const data =  await new CurriculumBaseLineBusiness().updateCurriculumBaseLine(<curriculumbaselineAttributes>
      {
        curriculumbaselineid,
        curriculumid: body.curriculumid,
        baselineid: body.baselineid,
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
  ): Promise<any> {
    const data  = await new CurriculumBaseLineBusiness().activateByCurriculumid(curriculumbaselineid, curriculumid);
    return {
      error: false,
      data: data ? data : undefined,
    }
  }

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
  ): Promise<any> {
    await new CurriculumBaseLineBusiness().deactivate(curriculumbaselineid);
    return {
      error: false,
      data: true,
    }
  }

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
  async getAll(): Promise<CurriculumBaseLineGetResponse> {
    const data =
      await new CurriculumBaseLineBusiness().getAllCurriculumBaseLines();
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
  ): Promise<CurriculumBaseLineGetResponse> {
    const data =
      await new CurriculumBaseLineBusiness().getAllCurriculumBaseLinesQuery(baselinename,baselinetype);
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
  ):Promise<any>{
    const data = await new CurriculumBaseLineBusiness().getAllCurriculumBaseLinesid(curriculumbaselineid);
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
  ):Promise<any>{
    const data = await new CurriculumBaseLineBusiness().getSchoolBaseline(curriculumbaselineid);
    return {
      error: false,
      data: data ? data : undefined,
    }
  }

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
  // @RequirePermissions(Permission.VIEW_BASELINEENDLINE)
  // @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getStudentBaselineEndlineResults(
    @Param("curriculumbaselineid") curriculumbaselineid: string,
    @Response({ passthrough: true }) res: any
  ): Promise<any> {
    const curbaseline = new CurriculumBaseLineBusiness();
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
