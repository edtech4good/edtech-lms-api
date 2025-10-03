import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Response, StreamableFile, UseGuards, UseInterceptors } from '@nestjs/common';
import {schoolcontributedataAttributes} from "../../models/data-models/schoolcontributedata";
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiParam, ApiQuery, ApiResponse, ApiTags, getSchemaPath } from "@nestjs/swagger";
import {User} from "../../decorators/user.decorator";
import {LmsUserToken} from "../../models/token.model";
import { SchoolContributeRequest, SchoolContributeUpdateDashboardRequest, SchoolContributeUpdateRequest, date} from "./models/SchoolContributeRequest";
import { SchoolContributeBase, SchoolContributeCreateMultiResponse, SchoolContributeCreateResponse } from "./models/SchoolContributeBase";
import {BusinessValidationInterceptor, SchemaValidationInterceptor} from "../../interceptors";
import {SchoolcontributeBusiness} from "../../business/schoolcontribute.business";
import { CreateSchoolContribute, DeleteSchoolContribute, DeleteSchoolContributeId, EditSchoolContribute } from "./school-contribute.business.validator";
import { createschoolcontribute, deleteschoolcontribute, getschooldashboardbyid, updateschoolcontribute, updateschooldashboard, showscholcontribute, schoolcontributeid } from './school-contribute.request.validator';
import { AccessGuard } from "../../guards/access.guard";
import { TokenType } from "../../models/enums";
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { SchoolContributeGetAllResponse } from './models/SchoolContributeResponse';
import { IPaging } from 'src/models/IPaging';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { ReportDownload } from 'src/business/report.download';
import { json2csv } from 'json-2-csv';

@ApiExtraModels(SchoolContributeBase)
@ApiExtraModels(SchoolContributeCreateResponse)
@ApiTags("School-Contribute")
@Controller('school-contribute')
@ApiBearerAuth()
export class SchoolContributeController {

@Post("create")
@ApiResponse({
    status: 200,
    description: "SchoolContribute created successfully",
    schema: { $ref: getSchemaPath(SchoolContributeCreateResponse) },
})
@ApiResponse({
    status: 400,
    description: "Error while creating SchoolContribute",
})
@UseInterceptors(
    new SchemaValidationInterceptor(createschoolcontribute),
    new BusinessValidationInterceptor([CreateSchoolContribute]),
)
@ApiBody({type: SchoolContributeRequest})
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
async createSchoolContribute(
    @Body() body: SchoolContributeRequest,
    @User() user: LmsUserToken
): Promise<SchoolContributeCreateResponse> {
    const temp: schoolcontributedataAttributes = {
        schoolname: body.schoolname,
        schoolid: body.schoolid,
        countryid: body.countryid,
        expected: body.expected,
        actual: body.actual,
        schoolcontributeid: "",
        isdeleted: false,
    };

    const data = await new SchoolcontributeBusiness().createSchoolContribute(temp, user);
    return {
        error: false,
        data: data ?? undefined,
    };
}

@Post("getallschoolcontribute/:schoolid")
@ApiResponse({
    status: 200,
    description: "SchoolContribute fetch successfully",
    schema: { $ref: getSchemaPath(SchoolContributeGetAllResponse) },
})
@ApiResponse({
    status: 400,
    description: "Error while fetching feedback",
})
@ApiResponse({
    status: 500,
    description: "Server error",
})
@UseInterceptors(new SchemaValidationInterceptor(showscholcontribute))
@ApiBody({ required: false, type: IPaging })
@ApiParam({ name: `schoolid`, type: "string", required: true })
@UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
@HttpCode(HttpStatus.OK)
async getall(
    @Param('schoolid') schoolid: string,
    @Body() body: IPaging
): Promise<SchoolContributeGetAllResponse> {
    const tempresult = await new SchoolcontributeBusiness().getAllSchoolContributeId({
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
        filter: body?.filter || [],
    },schoolid);
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

@Put("updateschoolname/:schoolid")
@ApiResponse({
    status: 200,
    description: "SchoolContribute fetch successfully",
    schema: { $ref: getSchemaPath(SchoolContributeCreateResponse) },
})
@ApiResponse({
    status: 400,
    description: "Error while fetching SchoolContribute",
})
@UseInterceptors(
    new SchemaValidationInterceptor(updateschoolcontribute),
    new BusinessValidationInterceptor([EditSchoolContribute])
)
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
@ApiParam({ name: `schoolid`, type: "string", required: true })
async update(
    @Param("schoolid") schoolid: string,
    @Body() body: SchoolContributeUpdateRequest,
    @User() user: LmsUserToken
): Promise<SchoolContributeCreateMultiResponse> {
    const data = await new SchoolcontributeBusiness().updatedSchoolContribute(<schoolcontributedataAttributes>{
    schoolid: schoolid,
    schoolname: body.schoolname,
    countryid: body.countryid,
    }, user);
    return {
    error: false,
    data: data ? data : undefined,
    };
}

@Put("updateschooldashboard/:schoolcontributeid")
@ApiResponse({
    status: 200,
    description: "SchoolContribute fetch successfully",
    schema: { $ref: getSchemaPath(SchoolContributeCreateResponse) },
})
@ApiResponse({
    status: 400,
    description: "Error while fetching SchoolContribute",
})
@UseInterceptors(
    new SchemaValidationInterceptor(updateschooldashboard),
    new BusinessValidationInterceptor([EditSchoolContribute])
)
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
@ApiParam({ name: `schoolcontributeid`, type: "string", required: true })
async updateschoolcontribute(
    @Param("schoolcontributeid") schoolcontributeid: string,
    @Body() body: SchoolContributeUpdateDashboardRequest,
    @User() user: LmsUserToken
): Promise<SchoolContributeCreateResponse> {
    const data = await new SchoolcontributeBusiness().updatedSchoolContributeDashboard(<schoolcontributedataAttributes>{
    schoolcontributeid: schoolcontributeid,
    expected: body.expected,
    actual: body.actual,
    }, user);
    return {
    error: false,
    data: data ? data : undefined,
    };
}

@Delete("deleteschoolcontribute/:schoolid")
@ApiResponse({
  status: 200,
  description: "School Contribute deleted successfully",
  schema: { $ref: getSchemaPath(ResponseBoolean) },
})
@ApiResponse({
  status: 400,
  description: "Error while deleting school contribute",
})
@UseInterceptors(
  new SchemaValidationInterceptor(deleteschoolcontribute),
  new BusinessValidationInterceptor([DeleteSchoolContribute])
)
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
@ApiParam({ name: `schoolid`, type: "string", required: true })
async delete(
  @Param("schoolid") schoolid: string,
  @User() user: LmsUserToken
): Promise<ResponseBoolean> {
  await new SchoolcontributeBusiness().deleteSchoolContribute(schoolid, user);
  return {
    error: false,
    data: true,
  };
}

@Delete("deleteschoolcontributeid/:schoolcontributeid")
@ApiResponse({
  status: 200,
  description: "School Contribute deleted successfully",
  schema: { $ref: getSchemaPath(ResponseBoolean) },
})
@ApiResponse({
  status: 400,
  description: "Error while deleting school contribute",
})
@UseInterceptors(
  new SchemaValidationInterceptor(schoolcontributeid),
  new BusinessValidationInterceptor([DeleteSchoolContributeId])
)
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
@ApiParam({ name: `schoolcontributeid`, type: "string", required: true })
async deleteschoolcontribute(
  @Param("schoolcontributeid") schoolcontributeid: string,
  @User() user: LmsUserToken
): Promise<ResponseBoolean> {
  await new SchoolcontributeBusiness().deleteSchoolContributeId(schoolcontributeid, user);
  return {
    error: false,
    data: true,
  };
}

@Get('getschooldashboard/schoolcontributeid/:schoolcontributeid')
@ApiResponse({
    status: 200,
    description: "Fetched school Dashboard successfully",
})
@ApiResponse({
    status: 400,
    description: "Error fetching school dashboard",
})
@ApiResponse({
    status: 500,
    description: "Server error",
})
@UseInterceptors(
    new SchemaValidationInterceptor(schoolcontributeid)
)
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
@ApiParam({ name: `schoolcontributeid`, type: "string", required: true })
async getSchoolsContributeId(@Param('schoolcontributeid') schoolcontributeid: string): Promise<any> {
    const data = await new SchoolcontributeBusiness().getschoolcontributeid(schoolcontributeid);
    return {
    data: data,
    error: false,
    };
}

@Get('getschooldashboardid/:schoolid')
@ApiResponse({
    status: 200,
    description: "Fetched school Dashboard successfully",
})
@ApiResponse({
    status: 400,
    description: "Error fetching school dashboard",
})
@ApiResponse({
    status: 500,
    description: "Server error",
})
@UseInterceptors(
    new SchemaValidationInterceptor(getschooldashboardbyid)
)
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
@ApiParam({ name: `schoolid`, type: "string", required: true })
async getSchoolsReport(@Param('schoolid') schoolid: string): Promise<any> {
    const data = await new SchoolcontributeBusiness().getSchooldashboard(schoolid);
    return {
    data: data,
    error: false,
    };
}

@Get('getallschooldashboard')
@ApiResponse({
    status: 200,
    description: "Fetched school AllDashboard successfully",
})
@ApiResponse({
    status: 400,
    description: "Error fetching school dashboard",
})
@ApiResponse({
    status: 500,
    description: "Server error",
})
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
async getAllSchoolsReport(): Promise<any> {
    const data = await new SchoolcontributeBusiness().getAllSchooldashboard();
    return {
    data: data,
    error: false,
    };
}

@Get('getschoolcontribute/:schoolid')
@ApiResponse({
  status: 200,
  description: "Fetched schoolname successfully",
})
@ApiResponse({
  status: 400,
  description: "Error fetching schoolname",
})
@ApiResponse({
  status: 500,
  description: "Server error",
})
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
async getSchoolsName(@Param('schoolid') schoolid: string): Promise<any> {
  const data = await new SchoolcontributeBusiness().getSchoolContributeById(schoolid,'');
  return {
    error: false,
    data: data,
  };
}

@Get("getallschoolcontribute")
@ApiResponse({
    status: 200,
    description: "SchoolContribute created successfully",
})
@ApiResponse({
    status: 400,
    description: "Error while creating SchoolContribute",
})
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
async getSchoolContribute(): Promise<any> {
    return new SchoolcontributeBusiness().getAllSchoolContribute('','','');
}

@Get("all")
@ApiResponse({
    status: 200,
    description: "SchoolContribute created successfully",
})
@ApiResponse({
    status: 400,
    description: "Error while creating SchoolContribute",
})
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
@ApiQuery({name: 'date', required: false, type: 'string'})
@ApiQuery({ name: "countryid", required: false, type: 'string' })
@ApiQuery({ name: "schoolname", required: false, type: 'string' })
async getSchool(
    @Query("countryid") countryid: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("date") date: string = '',
): Promise<any> {

    const data = await  new SchoolcontributeBusiness().getSchoolDashboardCountry(schoolname, countryid, date);
    return {
        error: false,
        data: data,
      };
}

@Post("report/download")
@ApiResponse({
  status: 200,
  description: "download quizzes successfully",
})
@ApiResponse({
  status: 400,
  description: "Error while exporting quizzes",
})
@ApiResponse({
  status: 500,
  description: "Server error",
})
@UseGuards(AccessGuard(TokenType.ACCESS))
@HttpCode(HttpStatus.OK)
@ApiBody({required: false, type: date })
async downloadOfflineClassLevelQuizzes(
  @Body("date") date: string,
  @Response({ passthrough: true }) res: any,
):Promise<any> {
  const data = await new SchoolcontributeBusiness().reportDownload(date);
  const formatedData = new ReportDownload().formatSchoolcontribute(data);
  const csvString = await json2csv(formatedData);
  res.set({
    "Content-Type": "application/csv",
    "Content-Disposition": `attachment; filename="report-schoolcontribute.csv"`,
  });
  return new StreamableFile(Buffer.from(csvString));
}
}
