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

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags("Lesson Quiz")
@Controller("lesson/quiz")
@ApiBearerAuth()
export class LessonQuizController {
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
    @Param("lessonid") lessonid: string
  ): Promise<LessonQuizsResponse> {
    const data = await new LessonQuizBusiness().getLessonQuizbyLessonid(
      lessonid
    );
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

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
    @Request() payload: IRequest
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness().createLessonQuiz(
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
    @Param("lessonquizid") lessonquizid: string
  ): Promise<LessonQuizResponse> {
    const data = await new LessonQuizBusiness().getLessonQuizbyid(lessonquizid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

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
    @Param("lessonquizid") lessonquizid: string
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness().activateLessonQuiz(lessonquizid);
    return {
      error: false,
      data: true,
    };
  }

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
    @Param("lessonquizid") lessonquizid: string
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness().deactivateLessonQuiz(lessonquizid);
    return {
      error: false,
      data: true,
    };
  }

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
    @Param("lessonquizorder") lessonquizorder: number
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness().updateorderLessonQuiz(
      lessonquizid,
      lessonquizorder
    );
    return {
      error: false,
      data: true,
    };
  }

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
    @Request() payload: IRequest
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness().updateLessonQuiz(
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
    @Param("lessonquizid") lessonquizid: string
  ): Promise<ResponseBoolean> {
    await new LessonQuizBusiness().deleteLessonQuiz(lessonquizid);
    return {
      error: false,
      data: true,
    };
  }
}
