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
import { DeleteLesson, DeleteLessonLearning, DeleteLessonLearningDocument, LessonLearningExists } from './lesson.business.validator';
import {
  createlessonlearning, getlessonlearning, reorderlessonlearning, updatelessonlearning, updateorderlessonlearning,
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
import { DEFAULT_LEARNING_ITEM_TYPE, learningItemErrors } from "src/business/learning-item-types";
import { ValidationException } from "src/models/ValidationException";

/**
 * The caller's own documents named by an item (its primary one and its link rows): each is theirs or the 404 an absent
 * one gets, before anything is compared; then all must belong to the owner of `ownerOfItem`.
 */
const checkDocuments = async (org: OrgContext, ownerOfItem: Awaited<ReturnType<typeof ownerOfLesson>>, documentids: ReadonlyArray<string>) => {
  for (const documentid of documentids) {
    await findOwnedDocument(org, documentid);
  }
  for (const documentid of documentids) {
    assertSameOwner(ownerOfItem, await ownerOfDocument(documentid));
  }
};
const namedDocuments = (documentid: string | null | undefined, links: ReadonlyArray<{ documentid: string }> | undefined) =>
  [...(typeof documentid === "string" ? [documentid] : []), ...(links ?? []).map((l) => l.documentid)];

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags('Lesson Learning')
@Controller('lesson/learning')
@ApiBearerAuth()
export class LessonLearningController {
  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
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

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
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

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
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
    new BusinessValidationInterceptor([DeleteLesson, DeleteLessonLearningDocument, LessonLearningExists])
  )
  @RequirePermissions(Permission.CREATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async addlearning(@Param('lessonid') lessonid: string, @Body() lessonlearning: LessonLearningsCreate, @Org() org: OrgContext): Promise<ResponseBoolean> {
    // the lesson in the path and every document in the body are the caller's, or not found (before anything is compared);
    // then one owner for all; then the type's own rules
    await findOwnedLesson(org, lessonid);
    await checkDocuments(org, await ownerOfLesson(lessonid), namedDocuments(lessonlearning.documentid, lessonlearning.documents));
    const type = lessonlearning.lessonlearningtype ?? DEFAULT_LEARNING_ITEM_TYPE;
    const errors = learningItemErrors({ type, documentid: lessonlearning.documentid, body: lessonlearning.lessonlearningbody, documents: lessonlearning.documents });
    if (errors.length > 0) {
      throw new ValidationException(errors);
    }
    const { documents: _links, ...own } = lessonlearning;
    await new LessonLearningBusiness().createLessonLearning({
      ...own,
      documentid: lessonlearning.documentid ?? null,
      lessonlearningtype: type,
      lessonlearningbody: lessonlearning.lessonlearningbody ?? null,
      lessonid,
      lessonlearningid: "",
      lessonlearningstatus: true,
    });
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
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

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
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

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
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

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put('reorder/:lessonid')
  @ApiResponse({
    status: 200,
    description: "Lesson learning items reordered: the order is 1..n in the order given",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "The list is not exactly the lesson's items, once each",
  })
  @ApiResponse({
    status: 404,
    description: "The lesson or an item is not found",
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(reorderlessonlearning))
  @RequirePermissions(Permission.UPDATE_LESSONLEARNING)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async reorderlearnings(
    @Param('lessonid') lessonid: string,
    @Body() body: { lessonlearningids: string[] },
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // the lesson in the path and every item in the list are the caller's, or the 404 an absent one gets; nothing is written otherwise
    await new LessonLearningBusiness(org).reorderLessonLearnings(lessonid, body.lessonlearningids);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
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
    // the learning in the path and every document in the body are the caller's, or not found (before anything is
    // compared); then one owner for all; then the type's own rules, applied to the item as it will be after the update
    await assertInScope(org, "learning", lessonlearningid);
    await checkDocuments(org, await ownerOfLearning(lessonlearningid), namedDocuments(lessonlearning.documentid, lessonlearning.documents));
    const business = new LessonLearningBusiness(org);
    const stored = await business.getLessonLearningid(lessonlearningid);
    const type = lessonlearning.lessonlearningtype ?? stored?.lessonlearningtype ?? DEFAULT_LEARNING_ITEM_TYPE;
    const errors = learningItemErrors({
      type,
      documentid: lessonlearning.documentid !== undefined ? lessonlearning.documentid : stored?.documentid,
      body: lessonlearning.lessonlearningbody !== undefined ? lessonlearning.lessonlearningbody : stored?.lessonlearningbody,
      documents: lessonlearning.documents,
    });
    if (errors.length > 0) {
      throw new ValidationException(errors);
    }
    const { documents: _links, ...own } = lessonlearning;
    await business.updateLessonLearning(lessonlearningid, { ...own, documentid: own.documentid as string | null, lessonlearningid, lessonlearningstatus: true, lessonlearningorder: 0 });
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
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
