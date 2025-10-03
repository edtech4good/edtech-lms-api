import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiParam, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { LessonPracticeQuestionBusiness } from 'src/business/lessonpracticequestion.business';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { AccessGuard } from 'src/guards/access.guard';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { SchemaValidationInterceptor } from 'src/interceptors';
import { lessonpracticequestionsAttributes } from 'src/models/data-models/lessonpracticequestions';
import { TokenType } from 'src/models/enums';
import { Permission } from 'src/models/enums/permissions.enum';
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { BusinessValidationInterceptor } from '../../interceptors/businessvalidation.interceptor';
import { DeleteQuestion } from '../question/question.business.validator';
import { DeleteLessonPractice, DeleteLessonPracticeQuestion, LessonPracticeQuestionExists } from './lesson.business.validator';
import { createlessonpracticequestion, getlessonpracticeid, updateorderlessonpracticequestion, updatestatuslessonpracticequestion } from './lesson.practice.request.validator';
import { LessonBase, LessonCreateResponse } from './models/LessonBase';
import { LessonGetAllResponse } from './models/LessonGetAllResponse';
import { LessonPracticeQuestionBase, LessonPracticeQuestionsResponse } from './models/LessonPracticeQuestionBase';
import { LessonResponse } from './models/LessonResponse';

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags('Lesson Practice Questions')
@Controller('lesson/practice/question')
@ApiBearerAuth()
export class LessonPracticeQuestionController {
  @Get(':lessonpracticeid')
  @ApiResponse({
    status: 200,
    description: 'Lesson practice question fetch successfully',
    schema: { $ref: getSchemaPath(LessonPracticeQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching lesson practice question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(getlessonpracticeid), new BusinessValidationInterceptor([DeleteLessonPractice]))
  @RequirePermissions(Permission.EDIT_LESSONPRACTICE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticeid`, type: () => String, required: true })
  async getpracticequestion(@Param('lessonpracticeid') lessonpracticeid: string): Promise<LessonPracticeQuestionsResponse> {
    const data = await new LessonPracticeQuestionBusiness().getLessonPracticeQuestionbyLessonid(lessonpracticeid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @Post(':lessonpracticeid/:questionid/:lessonpracticequestionorder')
  @ApiResponse({
    status: 200,
    description: 'Lesson practice question added successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while adding lesson practice question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(createlessonpracticequestion), new BusinessValidationInterceptor([DeleteLessonPractice, DeleteQuestion, LessonPracticeQuestionExists]))
  @RequirePermissions(Permission.EDIT_LESSONPRACTICE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticeid`, type: () => String, required: true })
  @ApiParam({ name: `questionid`, type: () => String, required: true })
  @ApiParam({ name: `lessonpracticequestionorder`, type: () => Number, required: true })
  async addpracticequestion(@Param('lessonpracticeid') lessonpracticeid: string,
    @Param('questionid') questionid: string,
    @Param('lessonpracticequestionorder') lessonpracticequestionorder: number
  ): Promise<ResponseBoolean> {
    await new LessonPracticeQuestionBusiness().createLessonPracticeQuestion(<lessonpracticequestionsAttributes>{
      lessonpracticeid,
      lessonpracticequestionstatus: false,
      lessonpracticequestionid: "",
      questionid,
      lessonpracticequestionorder,
    });
    return {
      error: false,
      data: true
    };
  }

  @Put('activate/:lessonpracticequestionid')
  @ApiResponse({
    status: 200,
    description: 'Lesson practice question activated successfully',
    schema: { $ref: getSchemaPath(LessonPracticeQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while activating lesson practice question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonpracticequestion), new BusinessValidationInterceptor([DeleteLessonPracticeQuestion]))
  @RequirePermissions(Permission.EDIT_LESSONPRACTICE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticequestionid`, type: () => String, required: true })
  async activatepracticequestion(@Param('lessonpracticequestionid') lessonpracticequestionid: string): Promise<ResponseBoolean> {
    await new LessonPracticeQuestionBusiness().activateLessonPracticeQuestion(lessonpracticequestionid);
    return {
      error: false,
      data: true
    };
  }

  @Put('deactivate/:lessonpracticequestionid')
  @ApiResponse({
    status: 200,
    description: 'Lesson practice question deactivated successfully',
    schema: { $ref: getSchemaPath(LessonPracticeQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deactivating lesson practice question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonpracticequestion), new BusinessValidationInterceptor([DeleteLessonPracticeQuestion]))
  @RequirePermissions(Permission.EDIT_LESSONPRACTICE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticequestionid`, type: () => String, required: true })
  async deactivatepracticequestion(@Param('lessonpracticequestionid') lessonpracticequestionid: string): Promise<ResponseBoolean> {
    await new LessonPracticeQuestionBusiness().deactivateLessonPracticeQuestion(lessonpracticequestionid);
    return {
      error: false,
      data: true
    };
  }

  @Put('order/:lessonpracticequestionid/:lessonpracticequestionorder')
  @ApiResponse({
    status: 200,
    description: 'Lesson practice question order updated successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while updating lesson practice question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updateorderlessonpracticequestion), new BusinessValidationInterceptor([DeleteLessonPracticeQuestion]))
  @RequirePermissions(Permission.EDIT_LESSONPRACTICE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticequestionid`, type: () => String, required: true })
  @ApiParam({ name: `lessonpracticequestionorder`, type: () => Number, required: true })
  async orderpracticequestion(@Param('lessonpracticequestionid') lessonpracticequestionid: string,
    @Param('lessonpracticequestionorder') lessonpracticequestionorder: number
  ): Promise<ResponseBoolean> {
    await new LessonPracticeQuestionBusiness().updateorderLessonPracticeQuestion(
      lessonpracticequestionid,
      lessonpracticequestionorder);
    return {
      error: false,
      data: true
    };
  }

  @Delete(':lessonpracticequestionid')
  @ApiResponse({
    status: 200,
    description: 'Lesson practice question deleted successfully',
    schema: { $ref: getSchemaPath(LessonPracticeQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deleting lesson practice question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonpracticequestion), new BusinessValidationInterceptor([DeleteLessonPracticeQuestion]))
  @RequirePermissions(Permission.EDIT_LESSONPRACTICE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticequestionid`, type: () => String, required: true })
  async deletepracticequestion(@Param('lessonpracticequestionid') lessonpracticequestionid: string): Promise<ResponseBoolean> {
    await new LessonPracticeQuestionBusiness().deleteLessonPracticeQuestion(lessonpracticequestionid);
    return {
      error: false,
      data: true
    };
  }
}
