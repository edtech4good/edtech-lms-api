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
  Request,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { LessonQuizBusiness } from "src/business/lessonquiz.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { IRequest } from "src/models";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import {
  DeleteLesson,
  DeleteLessonQuiz,
  LessonQuizExists,
} from "./lesson.business.validator";
import {
  createlessonquiz,
  getlessonquiz,
  updatelessonquiz,
  updateorderlessonquiz,
  updatestatuslessonquiz,
} from "./lesson.quiz.request.validator";
import { showlesson } from "./lesson.request.validator";
import { LessonBase, LessonCreateResponse } from "./models/LessonBase";
import { LessonGetAllResponse } from "./models/LessonGetAllResponse";
import { LessonQuizCreate } from "./models/LessonQuizCreate";
import {
  LessonQuizBase,
  LessonQuizResponse,
  LessonQuizsResponse,
} from "./models/LessonQuizResponse";
import { LessonQuizsUpdate } from "./models/LessonQuizUpdate";
import { LessonResponse } from "./models/LessonResponse";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { assertSameOwner, ownerOfLesson, ownerOfQuiz } from "src/business/content-owner";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { assertInScope, findOwnedLesson } from "src/business/content-scope";

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags("Lesson Quiz")
@Controller("lesson/quiz")
@ApiBearerAuth()
export class LessonQuizController {
  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get(":lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson Quiz fetch successfully",
    schema: { $ref: getSchemaPath(LessonQuizBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching lesson quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showlesson),
    new BusinessValidationInterceptor([DeleteLesson])
  )
  @RequirePermissions(Permission.VIEW_LESSONQUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async getquiz(
    @Param("lessonid") lessonid: string,
    @Org() org: OrgContext
  ): Promise<LessonQuizsResponse> {
    const data = await new LessonQuizBusiness(org).getLessonQuizbyLessonid(
      lessonid
    );
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Post(":lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson Quiz added successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while adding lesson quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createlessonquiz),
    new BusinessValidationInterceptor([DeleteLesson, LessonQuizExists])
  )
  @RequirePermissions(Permission.CREATE_LESSONQUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async addquiz(
    @Param("lessonid") lessonid: string,
    @Body() lessonquiz: LessonQuizCreate,
    @Request() payload: IRequest,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // the lesson in the path is the caller's, or not found (as one that is not there): nothing is written
    await findOwnedLesson(org, lessonid);
    await new LessonQuizBusiness(org).createLessonQuiz(
      {
        ...lessonquiz,
        lessonid,
        lessonquizstatus: true,
        lessonquizid: "",
      },
      payload?.user
    );
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get(":lessonid/:lessonquizid")
  @ApiResponse({
    status: 200,
    description: "Lesson Quiz fetch successfully",
    schema: { $ref: getSchemaPath(LessonQuizBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching lesson quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(getlessonquiz),
    new BusinessValidationInterceptor([DeleteLessonQuiz])
  )
  @RequirePermissions(Permission.VIEW_LESSONQUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  @ApiParam({ name: `lessonquizid`, type: () => String, required: true })
  async getquizbyid(
    @Param("lessonquizid") lessonquizid: string,
    @Org() org: OrgContext
  ): Promise<LessonQuizResponse> {
    const data = await new LessonQuizBusiness(org).getLessonQuizbyid(lessonquizid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put("activate/:lessonquizid")
  @ApiResponse({
    status: 200,
    description: "Lesson Quiz activated successfully",
    schema: { $ref: getSchemaPath(LessonQuizBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while activating lesson quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslessonquiz),
    new BusinessValidationInterceptor([DeleteLessonQuiz])
  )
  @RequirePermissions(Permission.UPDATE_LESSONQUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizid`, type: () => String, required: true })
  async activatequiz(
    @Param("lessonquizid") lessonquizid: string,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness(org).activateLessonQuiz(lessonquizid);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put("deactivate/:lessonquizid")
  @ApiResponse({
    status: 200,
    description: "Lesson Quiz deactivated successfully",
    schema: { $ref: getSchemaPath(LessonQuizBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deactivating lesson quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslessonquiz),
    new BusinessValidationInterceptor([DeleteLessonQuiz])
  )
  @RequirePermissions(Permission.UPDATE_LESSONQUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizid`, type: () => String, required: true })
  async deactivatequiz(
    @Param("lessonquizid") lessonquizid: string,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness(org).deactivateLessonQuiz(lessonquizid);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put("order/:lessonquizid/:lessonquizorder")
  @ApiResponse({
    status: 200,
    description: "Lesson Quiz order updated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while updating lesson quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updateorderlessonquiz),
    new BusinessValidationInterceptor([DeleteLessonQuiz])
  )
  @RequirePermissions(Permission.UPDATE_LESSONQUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizid`, type: () => String, required: true })
  @ApiParam({ name: `lessonquizorder`, type: () => Number, required: true })
  async orderquiz(
    @Param("lessonquizid") lessonquizid: string,
    @Param("lessonquizorder") lessonquizorder: number,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness(org).updateorderLessonQuiz(
      lessonquizid,
      lessonquizorder
    );
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put(":lessonquizid")
  @ApiResponse({
    status: 200,
    description: "Lesson Quiz updated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while updating lesson quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatelessonquiz),
    new BusinessValidationInterceptor([DeleteLessonQuiz, LessonQuizExists])
  )
  @RequirePermissions(Permission.UPDATE_LESSONQUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizid`, type: () => String, required: true })
  async updatequiz(
    @Param("lessonquizid") lessonquizid: string,
    @Body() lessonquiz: LessonQuizsUpdate,
    @Request() payload: IRequest,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // The quiz in the path and the lesson in the body are both the caller's, or not found (before anything is
    // compared). Moving a quiz carries its questions with it: it may only go to a lesson with the same owner.
    await assertInScope(org, "quiz", lessonquizid);
    await findOwnedLesson(org, lessonquiz.lessonid);
    assertSameOwner(await ownerOfQuiz(lessonquizid), await ownerOfLesson(lessonquiz.lessonid));
    await new LessonQuizBusiness(org).updateLessonQuiz(
      lessonquizid,
      {
        ...lessonquiz,
        lessonquizid,
        lessonquizstatus: true,
        lessonquizorder: 0,
      },
      payload?.user
    );
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Delete(":lessonquizid")
  @ApiResponse({
    status: 200,
    description: "Lesson Quiz deleted successfully",
    schema: { $ref: getSchemaPath(LessonQuizBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting lesson quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslessonquiz),
    new BusinessValidationInterceptor([DeleteLessonQuiz])
  )
  @RequirePermissions(Permission.DELETE_LESSONQUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonquizid`, type: () => String, required: true })
  async deletequiz(
    @Param("lessonquizid") lessonquizid: string,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness(org).deleteLessonQuiz(lessonquizid);
    return {
      error: false,
      data: true,
    };
  }
}
