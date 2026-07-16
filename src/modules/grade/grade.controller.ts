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
import { BusinessValidationInterceptor } from '../../interceptors/businessvalidation.interceptor';
import { CreateGrade, DeleteGrade, EditGrade } from './grade.business.validator';
import { creategrade, deletegrade, showallgrade, showgrade, showgradebycurriculum, updategrade } from "./grade.request.validator";
import { GradeBase, GradeCreateResponse } from './models/GradeBase';
import { GradeGetAllByCurriculumResponse, GradeGetAllResponse, GradeGetResponse } from './models/GradeGetAllResponse';
import { GradeRequest } from './models/GradeRequest';
import { GradeResponse } from './models/GradeResponse';


@ApiExtraModels(GradeBase)
@ApiExtraModels(GradeCreateResponse)
@ApiExtraModels(GradeResponse)
@ApiExtraModels(GradeGetAllResponse)
@ApiTags('Grade')
@Controller('grade')
@ApiBearerAuth()
export class GradeController {

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
  @HttpCode(HttpStatus.OK)
  async getAllGrades(
    @Query("grade") gradename: string = '',
    @Query("curid") curid: string = '',
    @Query("studentid") studentid: string = '',
    @Query("standardid") standardid: string = '',
    @Query("schoolname") schoolname: string = '',
  ): Promise<any> {
    const data = await new GradeBusiness().getGradesWithFilter(gradename, curid, studentid, standardid, schoolname);
    return {
        data: data,
        error: false,
    };
  }

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
    @User() user: LmsUserToken
  ): Promise<GradeCreateResponse> {
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
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {

    await new GradeBusiness().deleteGrade(gradeid, user);
    return {
      error: false,
      data: true
    };
  }

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
  async deactivate(@Param('gradeid') gradeid: string): Promise<ResponseBoolean> {

    await new GradeBusiness().deavtivateGrade(gradeid);
    return {
      error: false,
      data: true
    };
  }

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
  async activate(@Param('gradeid') gradeid: string): Promise<ResponseBoolean> {

    await new GradeBusiness().activateGrade(gradeid);
    return {
      error: false,
      data: true
    };
  }

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
  async get(@Param('gradeid') gradeid: string): Promise<GradeGetResponse> {
    const data = await new GradeBusiness().getGradebyid(gradeid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

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
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher))
  @ApiParam({ name: `curriculumid`, type: 'string', required: true })
  async getGradeByCurriculum(@Param('curriculumid') curriculumid: string): Promise<GradeGetAllByCurriculumResponse> {
    const data = await new GradeBusiness().getGradeByCurriculumid(curriculumid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

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
    @User() user: LmsUserToken
  ): Promise<GradeCreateResponse> {
    const data = await new GradeBusiness().updateGrade(<gradesAttributes>{
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
  async getall(@Body() body: IPaging): Promise<GradeGetAllResponse> {
    const tempresult = await new GradeBusiness().getGradeall({
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