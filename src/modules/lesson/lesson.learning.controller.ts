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
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { assertSameOwner, ownerOfDocument, ownerOfLearning, ownerOfLesson } from "src/business/content-owner";
import { assertInScope, findOwnedDocument, findOwnedLesson } from "src/business/content-scope";
import { Org, OrgContext } from "src/decorators/org.decorator";

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags('Lesson Learning')
@Controller('lesson/learning')
@ApiBearerAuth()
export class LessonLearningController {
  @OrgPolicy("owned")
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
  async getlearning(@Param('lessonid') lessonid: string, @Org() org: OrgContext): Promise<LessonLearningsResponse> {
    const data = await new LessonLearningBusiness(org).getLessonLearningbyLessonid(lessonid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @OrgPolicy("owned")
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
  async getlearningbyid(@Param('lessonlearningid') lessonlearningid: string, @Org() org: OrgContext): Promise<LessonLearningResponse> {
    const data = await new LessonLearningBusiness(org).getLessonLearningbyid(lessonlearningid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @OrgPolicy("owned")
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
  async addlearning(@Param('lessonid') lessonid: string, @Body() lessonlearning: LessonLearningsCreate, @Org() org: OrgContext): Promise<ResponseBoolean> {
    // the lesson in the path and the document in the body are both the caller's, or not found (before anything is compared)
    await findOwnedLesson(org, lessonid);
    await findOwnedDocument(org, lessonlearning.documentid);
    assertSameOwner(await ownerOfLesson(lessonid), await ownerOfDocument(lessonlearning.documentid));
    await new LessonLearningBusiness().createLessonLearning({ ...lessonlearning, lessonid, lessonlearningid: "", lessonlearningstatus: true });
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
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
  async activatelearning(@Param('lessonlearningid') lessonlearningid: string, @Org() org: OrgContext): Promise<ResponseBoolean> {
    await new LessonLearningBusiness(org).activateLessonLearning(lessonlearningid);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
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
  async deactivatelearning(@Param('lessonlearningid') lessonlearningid: string, @Org() org: OrgContext): Promise<ResponseBoolean> {
    await new LessonLearningBusiness(org).deactivateLessonLearning(lessonlearningid);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
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
    @Param('lessonlearningorder') lessonlearningorder: number,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new LessonLearningBusiness(org).updateorderLessonLearning(lessonlearningid, lessonlearningorder);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
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
    @Body() lessonlearning: LessonLearningsUpdate,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // the learning in the path and the document in the body are both the caller's, or not found (before anything is compared)
    await assertInScope(org, "learning", lessonlearningid);
    await findOwnedDocument(org, lessonlearning.documentid);
    assertSameOwner(await ownerOfLearning(lessonlearningid), await ownerOfDocument(lessonlearning.documentid));
    await new LessonLearningBusiness(org).updateLessonLearning(lessonlearningid, { ...lessonlearning, lessonlearningid, lessonlearningstatus: true, lessonlearningorder: 0 });
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
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
  async deletelearning(@Param('lessonlearningid') lessonlearningid: string, @Org() org: OrgContext): Promise<ResponseBoolean> {
    await new LessonLearningBusiness(org).deleteLessonLearning(lessonlearningid);
    return {
      error: false,
      data: true,
    };
  }
}
