import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiParam, ApiQuery, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { User } from 'src/decorators/user.decorator';
import { AccessGuard } from 'src/guards/access.guard';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { SchemaValidationInterceptor } from 'src/interceptors';
import { gradesAttributes } from 'src/models/data-models/grades';
import { Role, TokenType } from 'src/models/enums';
import { Permission } from 'src/models/enums/permissions.enum';
import { IPaging } from 'src/models/IPaging';
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { LmsUserToken } from 'src/models/token.model';
import { GradeBusiness } from '../../business';
import { resolveSchoolRef } from "src/business/school-identity";
import { resolveOwnedSchoolRef } from "src/business/school-scope";
import { Org, OrgContext, OrgOrServer, OrgOrSchoolUser } from "src/decorators/org.decorator";
import { assertInScope, findOwnedCurriculum } from "src/business/content-scope";
import { BusinessValidationInterceptor } from '../../interceptors/businessvalidation.interceptor';
import { CreateGrade, DeleteGrade, EditGrade } from './grade.business.validator';
import { creategrade, deletegrade, showallgrade, showgrade, showgradebycurriculum, updategrade } from "./grade.request.validator";
import { GradeBase, GradeCreateResponse } from './models/GradeBase';
import { GradeGetAllByCurriculumResponse, GradeGetAllResponse, GradeGetResponse } from './models/GradeGetAllResponse';
import { GradeRequest } from './models/GradeRequest';
import { GradeResponse } from './models/GradeResponse';
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { assertSameOwner, ownerOfCurriculum, ownerOfGrade } from "src/business/content-owner";


@ApiExtraModels(GradeBase)
@ApiExtraModels(GradeCreateResponse)
@ApiExtraModels(GradeResponse)
@ApiExtraModels(GradeGetAllResponse)
@ApiTags('Grade')
@Controller('grade')
@ApiBearerAuth()
export class GradeController {

  @OrgPolicy("owned")
  @Get('all')
  @ApiResponse({
    status: 200,
    description: "Fetched grades successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching grades",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @ApiQuery({ name: "grade", required: false, type: 'string' })
  @ApiQuery({ name: "curid", required: false, type: 'string' })
  @ApiQuery({ name: "studentid", required: false, type: 'string' })
  @ApiQuery({ name: "standardid", required: false, type: 'string' })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @ApiQuery({ name: "schoolid", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getAllGrades(
    @Query("grade") gradename: string = '',
    @Query("curid") curid: string = '',
    @Query("studentid") studentid: string = '',
    @Query("standardid") standardid: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("schoolid") schoolid: string = '',
    @OrgOrSchoolUser() org: OrgContext | undefined,
  ): Promise<any> {
    // The school is named by id or by name; resolved once, here, among the caller's schools (unknown, or another
    // organisation's: the same 404). A school-user token has no organisation context and keeps reading every one.
    const school = org ? await resolveOwnedSchoolRef(org, { schoolid, schoolname }) : await resolveSchoolRef({ schoolid, schoolname });
    const data = await new GradeBusiness(org).getGradesWithFilter(gradename, curid, studentid, standardid, school?.schoolid);
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned")
  @Post('create')
  @ApiResponse({
    status: 200,
    description: 'Grade created successfully',
    schema: { $ref: getSchemaPath(GradeCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while creating grade',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(creategrade), new BusinessValidationInterceptor([CreateGrade]))
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CREATE_GRADE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async create(
    @Body() body: GradeRequest,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<GradeCreateResponse> {
    // the curriculum it goes under is the caller's, or not found (as one that is not there): nothing is written
    await findOwnedCurriculum(org, body.curriculumid);
    const temp: gradesAttributes = {
      gradename: body.gradename,
      gradedescription: body.gradedescription,
      gradeid: "",
      isdeleted: false,
      gradestatus: false,
      curriculumid: body.curriculumid,
      gradeorder: body.gradeorder,
      passing_points: body.passing_points
    };

    const data = (await new GradeBusiness().createGrade(temp, user));
    return {
      error: false,
      data: data
    };
  }

  @OrgPolicy("owned")
  @Delete(':gradeid')
  @ApiResponse({
    status: 200,
    description: 'Grade deleted successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deleting grade',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(deletegrade), new BusinessValidationInterceptor([DeleteGrade]))
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.DELETE_GRADE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiParam({ name: `gradeid`, type: 'string', required: true })
  async delete(
    @Param('gradeid') gradeid: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {

    await new GradeBusiness(org).deleteGrade(gradeid, user);
    return {
      error: false,
      data: true
    };
  }

  @OrgPolicy("owned")
  @Put('deactivate/:gradeid')
  @ApiResponse({
    status: 200,
    description: 'Grade deactivate successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deactivate grade',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(deletegrade), new BusinessValidationInterceptor([DeleteGrade]))
  @RequirePermissions(Permission.UPDATE_GRADE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @ApiParam({ name: `gradeid`, type: 'string', required: true })
  async deactivate(@Param('gradeid') gradeid: string, @Org() org: OrgContext): Promise<ResponseBoolean> {

    await new GradeBusiness(org).deavtivateGrade(gradeid);
    return {
      error: false,
      data: true
    };
  }

  @OrgPolicy("owned")
  @Put('activate/:gradeid')
  @ApiResponse({
    status: 200,
    description: 'Grade activated successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while activated grade',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(deletegrade), new BusinessValidationInterceptor([DeleteGrade]))
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.UPDATE_GRADE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiParam({ name: `gradeid`, type: 'string', required: true })
  async activate(@Param('gradeid') gradeid: string, @Org() org: OrgContext): Promise<ResponseBoolean> {

    await new GradeBusiness(org).activateGrade(gradeid);
    return {
      error: false,
      data: true
    };
  }

  @OrgPolicy("owned")
  @Get(':gradeid')
  @ApiResponse({
    status: 200,
    description: 'Grade fetch successfully',
    schema: { $ref: getSchemaPath(GradeGetResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching grade',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showgrade), new BusinessValidationInterceptor([DeleteGrade]))
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_GRADE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiParam({ name: `gradeid`, type: 'string', required: true })
  async get(@Param('gradeid') gradeid: string, @Org() org: OrgContext): Promise<GradeGetResponse> {
    const data = await new GradeBusiness(org).getGradebyid(gradeid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @OrgPolicy("owned")
  @Get('curriculum/:curriculumid')
  @ApiResponse({
    status: 200,
    description: 'Grade fetch successfully',
    schema: { $ref: getSchemaPath(GradeGetAllByCurriculumResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching grade',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showgradebycurriculum))
  @HttpCode(HttpStatus.OK)
  // Role.teacher reads: feeds the grade filter on the report screens.
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.organisationadmin, Role.teacher))
  @ApiParam({ name: `curriculumid`, type: 'string', required: true })
  async getGradeByCurriculum(@Param('curriculumid') curriculumid: string, @OrgOrServer() org: OrgContext): Promise<GradeGetAllByCurriculumResponse> {
    const data = await new GradeBusiness(org).getGradeByCurriculumid(curriculumid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @OrgPolicy("owned")
  @Put(':gradeid')
  @ApiResponse({
    status: 200,
    description: 'Grade update successfully',
    schema: { $ref: getSchemaPath(GradeCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching grade',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updategrade), new BusinessValidationInterceptor([DeleteGrade, EditGrade]))
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.UPDATE_GRADE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiParam({ name: `gradeid`, type: 'string', required: true })
  async update(
    @Param('gradeid') gradeid: string,
    @Body() body: GradeRequest,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<GradeCreateResponse> {
    // The grade in the path and the curriculum in the body are both the caller's, or not found (before anything is
    // compared). Moving a grade moves everything beneath it: it may only go to a curriculum with the same owner.
    await assertInScope(org, "grade", gradeid);
    await findOwnedCurriculum(org, body.curriculumid);
    assertSameOwner(await ownerOfGrade(gradeid), await ownerOfCurriculum(body.curriculumid));
    const data = await new GradeBusiness(org).updateGrade(<gradesAttributes>{
      gradeid,
      gradename: body.gradename,
      gradedescription: body.gradedescription,
      curriculumid: body.curriculumid,
      gradeorder: body.gradeorder,
      passing_points: body.passing_points
    }, user);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @OrgPolicy("owned")
  @Post('')
  @ApiResponse({
    status: 200,
    description: 'Grades fetch successfully',
    schema: { $ref: getSchemaPath(GradeGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching grade',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallgrade))
  @ApiBody({ required: false, type: IPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_GRADE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getall(@Body() body: IPaging, @Org() org: OrgContext): Promise<GradeGetAllResponse> {
    const tempresult = await new GradeBusiness(org).getGradeall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || []
    });
    return <GradeGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      }
    };
  }
}