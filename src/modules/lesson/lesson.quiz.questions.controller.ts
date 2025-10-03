import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiParam, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { LessonQuizQuestionBusiness } from 'src/business/lessonquizquestion.business';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { AccessGuard } from 'src/guards/access.guard';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { SchemaValidationInterceptor } from 'src/interceptors';
import { lessonquizquestionsAttributes } from 'src/models/data-models/lessonquizquestions';
import { TokenType } from 'src/models/enums';
import { Permission } from 'src/models/enums/permissions.enum';
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { BusinessValidationInterceptor } from '../../interceptors/businessvalidation.interceptor';
import { DeleteQuestion } from '../question/question.business.validator';
import { DeleteLessonQuiz, DeleteLessonQuizQuestion, LessonQuizQuestionExists } from './lesson.business.validator';
import { createlessonquizquestion, getlessonquizid, updateorderlessonquizquestion, updatestatuslessonquizquestion } from './lesson.quiz.request.validator';
import { LessonBase, LessonCreateResponse } from './models/LessonBase';
import { LessonGetAllResponse } from './models/LessonGetAllResponse';
import { LessonQuizQuestionBase, LessonQuizQuestionsResponse } from './models/LessonQuizQuestionBase';
import { LessonResponse } from './models/LessonResponse';

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags('Lesson Quiz Questions')
@Controller('lesson/quiz/question')
@ApiBearerAuth()
export class LessonQuizQuestionController {
  @Get(':lessonquizid')
  @ApiResponse({
    status: 200,
    description: 'Lesson quiz question fetch successfully',
    schema: { $ref: getSchemaPath(LessonQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching lesson quiz question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(getlessonquizid), new BusinessValidationInterceptor([DeleteLessonQuiz]))
  @RequirePermissions(Permission.EDIT_LESSONQUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizid`, type: () => String, required: true })
  async getquizquestion(@Param('lessonquizid') lessonquizid: string): Promise<LessonQuizQuestionsResponse> {
    const data = await new LessonQuizQuestionBusiness().getLessonQuizQuestionbyLessonid(lessonquizid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @Post(':lessonquizid/:questionid/:lessonquizquestionorder')
  @ApiResponse({
    status: 200,
    description: 'Lesson quiz question added successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while adding lesson quiz question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(createlessonquizquestion), new BusinessValidationInterceptor([DeleteLessonQuiz, DeleteQuestion, LessonQuizQuestionExists]))
  @RequirePermissions(Permission.EDIT_LESSONQUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizid`, type: () => String, required: true })
  @ApiParam({ name: `questionid`, type: () => String, required: true })
  @ApiParam({ name: `lessonquizquestionorder`, type: () => Number, required: true })
  async addquizquestion(@Param('lessonquizid') lessonquizid: string,
    @Param('questionid') questionid: string,
    @Param('lessonquizquestionorder') lessonquizquestionorder: number
  ): Promise<ResponseBoolean> {
    await new LessonQuizQuestionBusiness().createLessonQuizQuestion(<lessonquizquestionsAttributes>{
      lessonquizid,
      lessonquizquestionstatus: false,
      lessonquizquestionid: "",
      questionid,
      lessonquizquestionorder,
    });
    return {
      error: false,
      data: true
    };
  }

  @Put('activate/:lessonquizquestionid')
  @ApiResponse({
    status: 200,
    description: 'Lesson quiz question activated successfully',
    schema: { $ref: getSchemaPath(LessonQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while activating lesson quiz question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonquizquestion), new BusinessValidationInterceptor([DeleteLessonQuizQuestion]))
  @RequirePermissions(Permission.EDIT_LESSONQUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizquestionid`, type: () => String, required: true })
  async activatequizquestion(@Param('lessonquizquestionid') lessonquizquestionid: string): Promise<ResponseBoolean> {
    await new LessonQuizQuestionBusiness().activateLessonQuizQuestion(lessonquizquestionid);
    return {
      error: false,
      data: true
    };
  }

  @Put('deactivate/:lessonquizquestionid')
  @ApiResponse({
    status: 200,
    description: 'Lesson quiz question deactivated successfully',
    schema: { $ref: getSchemaPath(LessonQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deactivating lesson quiz question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonquizquestion), new BusinessValidationInterceptor([DeleteLessonQuizQuestion]))
  @RequirePermissions(Permission.EDIT_LESSONQUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizquestionid`, type: () => String, required: true })
  async deactivatequizquestion(@Param('lessonquizquestionid') lessonquizquestionid: string): Promise<ResponseBoolean> {
    await new LessonQuizQuestionBusiness().deactivateLessonQuizQuestion(lessonquizquestionid);
    return {
      error: false,
      data: true
    };
  }

  @Put('order/:lessonquizquestionid/:lessonquizquestionorder')
  @ApiResponse({
    status: 200,
    description: 'Lesson quiz question order updated successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while updating lesson quiz question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updateorderlessonquizquestion), new BusinessValidationInterceptor([DeleteLessonQuizQuestion]))
  @RequirePermissions(Permission.EDIT_LESSONQUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizquestionid`, type: () => String, required: true })
  @ApiParam({ name: `lessonquizquestionorder`, type: () => Number, required: true })
  async orderquizquestion(@Param('lessonquizquestionid') lessonquizquestionid: string,
    @Param('lessonquizquestionorder') lessonquizquestionorder: number
  ): Promise<ResponseBoolean> {
    await new LessonQuizQuestionBusiness().updateorderLessonQuizQuestion(
      lessonquizquestionid,
      lessonquizquestionorder);
    return {
      error: false,
      data: true
    };
  }

  @Delete(':lessonquizquestionid')
  @ApiResponse({
    status: 200,
    description: 'Lesson quiz question deleted successfully',
    schema: { $ref: getSchemaPath(LessonQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deleting lesson quiz question',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonquizquestion), new BusinessValidationInterceptor([DeleteLessonQuizQuestion]))
  @RequirePermissions(Permission.EDIT_LESSONQUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizquestionid`, type: () => String, required: true })
  async deletequizquestion(@Param('lessonquizquestionid') lessonquizquestionid: string): Promise<ResponseBoolean> {
    await new LessonQuizQuestionBusiness().deleteLessonQuizQuestion(lessonquizquestionid);
    return {
      error: false,
      data: true
    };
  }
}
