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
import { DeleteLesson, DeleteLessonLearning, LessonLearningExists } from './lesson.business.validator';
import {
  createlessonlearning, getlessonlearning, updatelessonlearning, updateorderlessonlearning,
  updatestatuslessonlearning
} from './lesson.learning.request.validator';
import { showlesson } from './lesson.request.validator';
import { LessonBase, LessonCreateResponse } from './models/LessonBase';
import { LessonGetAllResponse } from './models/LessonGetAllResponse';
import { LessonLearningsCreate } from './models/LessonLearningsCreate';
import { LessonLearningBase, LessonLearningResponse, LessonLearningsResponse } from './models/LessonLearningsResponse';
import { LessonLearningsUpdate } from "./models/LessonLearningsUpdate";
import { LessonResponse } from './models/LessonResponse';

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags('Lesson Learning')
@Controller('lesson/learning')
@ApiBearerAuth()
export class LessonLearningController {
  @Get(':lessonid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning fetch successfully',
    schema: { $ref: getSchemaPath(LessonLearningBase) },
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
  async getlearning(@Param('lessonid') lessonid: string): Promise<LessonLearningsResponse> {
    const data = await new LessonLearningBusiness().getLessonLearningbyLessonid(lessonid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Get(':lessonid/:lessonlearningid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning fetch successfully',
    schema: { $ref: getSchemaPath(LessonLearningBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching lesson learning',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(getlessonlearning), new BusinessValidationInterceptor([DeleteLessonLearning]))
  @RequirePermissions(Permission.VIEW_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  @ApiParam({ name: `lessonlearningid`, type: () => String, required: true })
  async getlearningbyid(@Param('lessonlearningid') lessonlearningid: string): Promise<LessonLearningResponse> {
    const data = await new LessonLearningBusiness().getLessonLearningbyid(lessonlearningid);
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
    new SchemaValidationInterceptor(createlessonlearning),
    new BusinessValidationInterceptor([DeleteLesson, DeleteDocument, LessonLearningExists])
  )
  @RequirePermissions(Permission.CREATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async addlearning(@Param('lessonid') lessonid: string, @Body() lessonlearning: LessonLearningsCreate): Promise<ResponseBoolean> {
    await new LessonLearningBusiness().createLessonLearning({ ...lessonlearning, lessonid, lessonlearningid: "", lessonlearningstatus: true });
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

  @Put(':lessonlearningid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning updated successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while updating lesson learning',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatelessonlearning), new BusinessValidationInterceptor([DeleteLessonLearning, LessonLearningExists]))
  @RequirePermissions(Permission.UPDATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonlearningid`, type: () => String, required: true })
  async updatelearning(
    @Param('lessonlearningid') lessonlearningid: string,
    @Body() lessonlearning: LessonLearningsUpdate
  ): Promise<ResponseBoolean> {
    await new LessonLearningBusiness().updateLessonLearning(lessonlearningid, { ...lessonlearning, lessonlearningid, lessonlearningstatus: true, lessonlearningorder: 0 });
    return {
      error: false,
      data: true,
    };
  }

  @Delete(':lessonlearningid')
  @ApiResponse({
    status: 200,
    description: 'Lesson Learning deleted successfully',
    schema: { $ref: getSchemaPath(LessonLearningBase) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deleting lesson learning',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatestatuslessonlearning), new BusinessValidationInterceptor([DeleteLessonLearning]))
  @RequirePermissions(Permission.DELETE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonlearningid`, type: () => String, required: true })
  async deletelearning(@Param('lessonlearningid') lessonlearningid: string): Promise<ResponseBoolean> {
    await new LessonLearningBusiness().deleteLessonLearning(lessonlearningid);
    return {
      error: false,
      data: true,
    };
  }
}
