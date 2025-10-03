import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiParam, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { LessonLearningBusiness } from 'src/business/lessonlearning.business';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { AccessGuard } from 'src/guards/access.guard';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { SchemaValidationInterceptor } from 'src/interceptors';
import { TokenType } from 'src/models/enums';
import { Permission } from 'src/models/enums/permissions.enum';
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { BusinessValidationInterceptor } from '../../interceptors/businessvalidation.interceptor';
import { DeleteDocument } from '../document/document.business.validator';
import { DeleteLesson, DeleteLessonLearning, DeleteLessonPlan, LessonLearningExists, LessonPlanExists } from './lesson.business.validator';
import {
  updateorderlessonlearning,
  updatestatuslessonlearning
} from './lesson.learning.request.validator';
import { showlesson } from './lesson.request.validator';
import { LessonBase, LessonCreateResponse } from './models/LessonBase';
import { LessonGetAllResponse } from './models/LessonGetAllResponse';
import { LessonLearningBase } from './models/LessonLearningsResponse';
import { LessonResponse } from './models/LessonResponse';
import { LessonPlanBusiness } from 'src/business/lessonplan.business';
import { LessonPlansCreate } from './models/LessonPlan.model';
import { createlessonplan, getlessonplan, updatelessonplan, updatestatuslessonplan } from './lesson.plan.request.validator';
import { LessonPlanBase, LessonPlanResponse, LessonPlansResponse } from './models/LessonPlansResponse';
import { LessonPlansUpdate } from './models/LessonPlansUpdate';

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags('Lesson Plan')
@Controller('lesson/plan')
@ApiBearerAuth()
export class LessonPlanController {
  @Get(':lessonid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning fetch successfully',
    schema: { $ref: getSchemaPath(LessonPlanBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching lesson learning',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showlesson), new BusinessValidationInterceptor([DeleteLesson]))
  @RequirePermissions(Permission.VIEW_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async getlearning(@Param('lessonid') lessonid: string): Promise<LessonPlansResponse> {
    const data = await new LessonPlanBusiness().getLessonPlanbyLessonid(lessonid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Get(':lessonid/:lessonplanid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning fetch successfully',
    schema: { $ref: getSchemaPath(LessonPlanBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching lesson learning',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(getlessonplan), new BusinessValidationInterceptor([DeleteLessonPlan]))
  @RequirePermissions(Permission.VIEW_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  @ApiParam({ name: `lessonplanid`, type: () => String, required: true })
  async getplanbyid(@Param('lessonplanid') lessonplanid: string): Promise<LessonPlanResponse> {
    const data = await new LessonPlanBusiness().getLessonPlanbyid(lessonplanid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Post(':lessonid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning added successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while adding lesson learning',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createlessonplan),
    new BusinessValidationInterceptor([DeleteLesson, DeleteDocument, LessonLearningExists])
  )
  @RequirePermissions(Permission.CREATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async addplan(@Param('lessonid') lessonid: string, @Body() lessonplan: LessonPlansCreate): Promise<ResponseBoolean> {
    await new LessonPlanBusiness().createLessonPlan({ ...lessonplan, lessonid, lessonplanid: "", lessonplanstatus: true });
    return {
      error: false,
      data: true,
    };
  }

  @Put('activate/:lessonlearningid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning activated successfully',
    schema: { $ref: getSchemaPath(LessonLearningBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while activating lesson learning',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonlearning), new BusinessValidationInterceptor([DeleteLessonLearning]))
  @RequirePermissions(Permission.UPDATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonlearningid`, type: () => String, required: true })
  async activatelearning(@Param('lessonlearningid') lessonlearningid: string): Promise<ResponseBoolean> {
    await new LessonLearningBusiness().activateLessonLearning(lessonlearningid);
    return {
      error: false,
      data: true,
    };
  }

  @Put('deactivate/:lessonlearningid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning deactivated successfully',
    schema: { $ref: getSchemaPath(LessonLearningBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deactivating lesson learning',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonlearning), new BusinessValidationInterceptor([DeleteLessonLearning]))
  @RequirePermissions(Permission.UPDATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonlearningid`, type: () => String, required: true })
  async deactivatelearning(@Param('lessonlearningid') lessonlearningid: string): Promise<ResponseBoolean> {
    await new LessonLearningBusiness().deactivateLessonLearning(lessonlearningid);
    return {
      error: false,
      data: true,
    };
  }

  @Put('order/:lessonlearningid/:lessonlearningorder')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning order updated successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while updating lesson learning order',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updateorderlessonlearning), new BusinessValidationInterceptor([DeleteLessonLearning]))
  @RequirePermissions(Permission.UPDATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonlearningid`, type: () => String, required: true })
  @ApiParam({ name: `lessonlearningorder`, type: () => Number, required: true })
  async orderlearning(
    @Param('lessonlearningid') lessonlearningid: string,
    @Param('lessonlearningorder') lessonlearningorder: number
  ): Promise<ResponseBoolean> {
    await new LessonLearningBusiness().updateorderLessonLearning(lessonlearningid, lessonlearningorder);
    return {
      error: false,
      data: true,
    };
  }

  @Put(':lessonplanid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Plan updated successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while updating lesson plan',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatelessonplan), new BusinessValidationInterceptor([DeleteLessonPlan, LessonPlanExists]))
  @RequirePermissions(Permission.UPDATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonplanid`, type: () => String, required: true })
  async updatelearning(
    @Param('lessonplanid') lessonplanid: string,
    @Body() lessonplan: LessonPlansUpdate
  ): Promise<ResponseBoolean> {
    await new LessonPlanBusiness().updateLessonPlan(lessonplanid, { ...lessonplan, lessonplanid, lessonplanstatus: true, lessonplanorder: 0 });
    return {
      error: false,
      data: true,
    };
  }

  @Delete(':lessonplanid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning deleted successfully',
    schema: { $ref: getSchemaPath(LessonLearningBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deleting lesson plan',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonplan), new BusinessValidationInterceptor([DeleteLessonPlan]))
  @RequirePermissions(Permission.DELETE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonplanid`, type: () => String, required: true })
  async deleteplan(@Param('lessonplanid') lessonplanid: string): Promise<ResponseBoolean> {
    await new LessonPlanBusiness().deleteLessonPlan(lessonplanid);
    return {
      error: false,
      data: true,
    };
  }
}
