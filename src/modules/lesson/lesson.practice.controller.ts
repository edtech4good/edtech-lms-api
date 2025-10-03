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
import { LessonPracticeBusiness } from "src/business/lessonpractice.business";
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
  DeleteLessonPractice,
  LessonPracticeExists,
} from "./lesson.business.validator";
import {
  createlessonpractice,
  getlessonpractice,
  updatelessonpractice,
  updateorderlessonpractice,
  updatestatuslessonpractice,
} from "./lesson.practice.request.validator";
import { showlesson } from "./lesson.request.validator";
import { LessonBase, LessonCreateResponse } from "./models/LessonBase";
import { LessonGetAllResponse } from "./models/LessonGetAllResponse";
import { LessonPracticeCreate } from "./models/LessonPracticeCreate";
import {
  LessonPracticeBase,
  LessonPracticeResponse,
  LessonPracticesResponse,
} from "./models/LessonPracticesResponse";
import { LessonPracticesUpdate } from "./models/LessonPracticesUpdate";
import { LessonResponse } from "./models/LessonResponse";

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags("Lesson Practice")
@Controller("lesson/practice")
@ApiBearerAuth()
export class LessonPracticeController {
  @Get(":lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson Practice fetch successfully",
    schema: { $ref: getSchemaPath(LessonPracticeBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching lesson practice",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showlesson),
    new BusinessValidationInterceptor([DeleteLesson])
  )
  @RequirePermissions(Permission.VIEW_LESSONPRACTICE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async getpractice(
    @Param("lessonid") lessonid: string
  ): Promise<LessonPracticesResponse> {
    const data = await new LessonPracticeBusiness().getLessonPracticebyLessonid(
      lessonid
    );
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Get(":lessonid/:lessonpracticeid")
  @ApiResponse({
    status: 200,
    description: "Lesson Practice fetch successfully",
    schema: { $ref: getSchemaPath(LessonPracticeBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching lesson practice",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(getlessonpractice),
    new BusinessValidationInterceptor([DeleteLessonPractice])
  )
  @RequirePermissions(Permission.VIEW_LESSONPRACTICE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  @ApiParam({ name: `lessonpracticeid`, type: () => String, required: true })
  async getpracticebyid(
    @Param("lessonpracticeid") lessonpracticeid: string
  ): Promise<LessonPracticeResponse> {
    const data = await new LessonPracticeBusiness().getLessonPracticebyid(
      lessonpracticeid
    );
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Post(":lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson Practice added successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while adding lesson practice",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createlessonpractice),
    new BusinessValidationInterceptor([DeleteLesson, LessonPracticeExists])
  )
  @RequirePermissions(Permission.CREATE_LESSONPRACTICE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: () => String, required: true })
  async addpractice(
    @Param("lessonid") lessonid: string,
    @Body() lessonpractice: LessonPracticeCreate,
    @Request() payload: IRequest
  ): Promise<ResponseBoolean> {
    await new LessonPracticeBusiness().createLessonPractice(
      {
        ...lessonpractice,
        lessonid,
        lessonpracticeid: "",
        lessonpracticestatus: true,
      },
      payload?.user
    );
    return {
      error: false,
      data: true,
    };
  }

  @Put("activate/:lessonpracticeid")
  @ApiResponse({
    status: 200,
    description: "Lesson Practice activated successfully",
    schema: { $ref: getSchemaPath(LessonPracticeBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while activating lesson practice",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslessonpractice),
    new BusinessValidationInterceptor([DeleteLessonPractice])
  )
  @RequirePermissions(Permission.UPDATE_LESSONPRACTICE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticeid`, type: () => String, required: true })
  async activatepractice(
    @Param("lessonpracticeid") lessonpracticeid: string
  ): Promise<ResponseBoolean> {
    await new LessonPracticeBusiness().activateLessonPractice(lessonpracticeid);
    return {
      error: false,
      data: true,
    };
  }

  @Put("deactivate/:lessonpracticeid")
  @ApiResponse({
    status: 200,
    description: "Lesson Practice deactivated successfully",
    schema: { $ref: getSchemaPath(LessonPracticeBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deactivating lesson practice",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslessonpractice),
    new BusinessValidationInterceptor([DeleteLessonPractice])
  )
  @RequirePermissions(Permission.UPDATE_LESSONPRACTICE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticeid`, type: () => String, required: true })
  async deactivatepractice(
    @Param("lessonpracticeid") lessonpracticeid: string
  ): Promise<ResponseBoolean> {
    await new LessonPracticeBusiness().deactivateLessonPractice(
      lessonpracticeid
    );
    return {
      error: false,
      data: true,
    };
  }

  @Put("order/:lessonpracticeid/:lessonpracticeorder")
  @ApiResponse({
    status: 200,
    description: "Lesson Practice order updated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while updating lesson practice",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updateorderlessonpractice),
    new BusinessValidationInterceptor([DeleteLessonPractice])
  )
  @RequirePermissions(Permission.UPDATE_LESSONPRACTICE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticeid`, type: () => String, required: true })
  @ApiParam({ name: `lessonpracticeorder`, type: () => Number, required: true })
  async orderpractice(
    @Param("lessonpracticeid") lessonpracticeid: string,
    @Param("lessonpracticeorder") lessonpracticeorder: number
  ): Promise<ResponseBoolean> {
    await new LessonPracticeBusiness().updateorderLessonPractice(
      lessonpracticeid,
      lessonpracticeorder
    );
    return {
      error: false,
      data: true,
    };
  }

  @Put(":lessonpracticeid")
  @ApiResponse({
    status: 200,
    description: "Lesson Practice updated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while updating lesson practice",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatelessonpractice),
    new BusinessValidationInterceptor([
      DeleteLessonPractice,
      LessonPracticeExists,
    ])
  )
  @RequirePermissions(Permission.UPDATE_LESSONPRACTICE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticeid`, type: () => String, required: true })
  async updatepractice(
    @Param("lessonpracticeid") lessonpracticeid: string,
    @Body() lessonpractice: LessonPracticesUpdate,
    @Request() payload: IRequest
  ): Promise<ResponseBoolean> {
    await new LessonPracticeBusiness().updateLessonPractice(lessonpracticeid, {
      ...lessonpractice,
      lessonpracticeid,
      lessonpracticestatus: true,
      lessonpracticeorder: 0,
    }, payload?.user);
    return {
      error: false,
      data: true,
    };
  }

  @Delete(":lessonpracticeid")
  @ApiResponse({
    status: 200,
    description: "Lesson Practice deleted successfully",
    schema: { $ref: getSchemaPath(LessonPracticeBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting lesson practice",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslessonpractice),
    new BusinessValidationInterceptor([DeleteLessonPractice])
  )
  @RequirePermissions(Permission.DELETE_LESSONPRACTICE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonpracticeid`, type: () => String, required: true })
  async deletepractice(
    @Param("lessonpracticeid") lessonpracticeid: string
  ): Promise<ResponseBoolean> {
    await new LessonPracticeBusiness().deleteLessonPractice(lessonpracticeid);
    return {
      error: false,
      data: true,
    };
  }
}
