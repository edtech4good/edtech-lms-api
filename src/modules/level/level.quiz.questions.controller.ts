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
import { LevelQuizQuestionBusiness } from "src/business/levelquizquestion.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { levelquizquestionsAttributes } from "src/models/data-models/levelquizquestions";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import { DeleteQuestion } from "../question/question.business.validator";
import {
  DeleteLevel,
  DeleteLevelQuizQuestion,
  LevelQuizQuestionExists,
} from "./level.business.validator";
import {
  createlevelquizquestion,
  updateorderlevelquizquestion,
  updatestatuslevelquizquestion,
} from "./level.quiz.question.request.validator";
import { showlevel } from "./level.request.validator";
import { LevelBase, LevelCreateResponse } from "./models/LevelBase";
import { LevelGetAllResponse } from "./models/LevelGetAllResponse";
import {
  LevelQuizQuestionBase,
  LevelQuizQuestionsResponse,
} from "./models/LevelQuizQuestionBase";
import { LevelResponse } from "./models/LevelResponse";
import { LevelQuizSetLesson } from "./models/LevelRequest";

@ApiExtraModels(LevelBase)
@ApiExtraModels(LevelCreateResponse)
@ApiExtraModels(LevelResponse)
@ApiExtraModels(LevelGetAllResponse)
@ApiTags("Level Quiz Questions")
@Controller("level/quiz/question")
@ApiBearerAuth()
export class LevelQuizQuestionController {
  @Get(":levelid")
  @ApiResponse({
    status: 200,
    description: "Level quiz question fetch successfully",
    schema: { $ref: getSchemaPath(LevelQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching level quiz question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showlevel),
    new BusinessValidationInterceptor([DeleteLevel])
  )
  @RequirePermissions(Permission.VIEW_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelid`, type: () => String, required: true })
  async getquizquestion(
    @Param("levelid") levelid: string
  ): Promise<LevelQuizQuestionsResponse> {
    const data =
      await new LevelQuizQuestionBusiness().getLevelQuizQuestionbyLevelid(
        levelid
      );
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Post(":levelid/:questionid/:levelquizquestionorder")
  @ApiResponse({
    status: 200,
    description: "Level quiz question added successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while adding level quiz question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createlevelquizquestion),
    new BusinessValidationInterceptor([
      DeleteLevel,
      DeleteQuestion,
      LevelQuizQuestionExists,
    ])
  )
  @RequirePermissions(Permission.CREATE_LEVEL_QUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelid`, type: () => String, required: true })
  @ApiParam({ name: `questionid`, type: () => String, required: true })
  @ApiParam({
    name: `levelquizquestionorder`,
    type: () => Number,
    required: true,
  })
  async addquizquestion(
    @Param("levelid") levelid: string,
    @Param("questionid") questionid: string,
    @Param("levelquizquestionorder") levelquizquestionorder: number
  ): Promise<ResponseBoolean> {
    await new LevelQuizQuestionBusiness().createLevelQuizQuestion(<
      levelquizquestionsAttributes
    >{
      levelid,
      questionid,
      levelquizquestionorder,
    });
    return {
      error: false,
      data: true,
    };
  }

  @Put("activate/:levelquizquestionid")
  @ApiResponse({
    status: 200,
    description: "Level quiz question activated successfully",
    schema: { $ref: getSchemaPath(LevelQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while activating level quiz question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslevelquizquestion),
    new BusinessValidationInterceptor([DeleteLevelQuizQuestion])
  )
  @RequirePermissions(Permission.DEACTIVATE_LEVEL_QUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelquizquestionid`, type: () => String, required: true })
  async activatequizquestion(
    @Param("levelquizquestionid") levelquizquestionid: string
  ): Promise<ResponseBoolean> {
    await new LevelQuizQuestionBusiness().activateLevelQuizQuestion(
      levelquizquestionid
    );
    return {
      error: false,
      data: true,
    };
  }

  @Put("deactivate/:levelquizquestionid")
  @ApiResponse({
    status: 200,
    description: "Level quiz question deactivated successfully",
    schema: { $ref: getSchemaPath(LevelQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deactivating level quiz question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslevelquizquestion),
    new BusinessValidationInterceptor([DeleteLevelQuizQuestion])
  )
  @RequirePermissions(Permission.DEACTIVATE_LEVEL_QUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelquizquestionid`, type: () => String, required: true })
  async deactivatequizquestion(
    @Param("levelquizquestionid") levelquizquestionid: string
  ): Promise<ResponseBoolean> {
    await new LevelQuizQuestionBusiness().deactivateLevelQuizQuestion(
      levelquizquestionid
    );
    return {
      error: false,
      data: true,
    };
  }

  @Put("order/:levelquizquestionid/:levelquizquestionorder")
  @ApiResponse({
    status: 200,
    description: "Level quiz question order updated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while updating level quiz question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updateorderlevelquizquestion),
    new BusinessValidationInterceptor([DeleteLevelQuizQuestion])
  )
  @RequirePermissions(Permission.REORDER_LEVEL_QUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelquizquestionid`, type: () => String, required: true })
  @ApiParam({
    name: `levelquizquestionorder`,
    type: () => Number,
    required: true,
  })
  async orderquizquestion(
    @Param("levelquizquestionid") levelquizquestionid: string,
    @Param("levelquizquestionorder") levelquizquestionorder: number
  ): Promise<ResponseBoolean> {
    await new LevelQuizQuestionBusiness().updateorderLevelQuizQuestion(
      levelquizquestionid,
      levelquizquestionorder
    );
    return {
      error: false,
      data: true,
    };
  }

  @Delete(":levelquizquestionid")
  @ApiResponse({
    status: 200,
    description: "Level quiz question deleted successfully",
    schema: { $ref: getSchemaPath(LevelQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting level quiz question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslevelquizquestion),
    new BusinessValidationInterceptor([DeleteLevelQuizQuestion])
  )
  @RequirePermissions(Permission.DELETE_LEVEL_QUIZ_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelquizquestionid`, type: () => String, required: true })
  async deletequizquestion(
    @Param("levelquizquestionid") levelquizquestionid: string
  ): Promise<ResponseBoolean> {
    await new LevelQuizQuestionBusiness().deleteLevelQuizQuestion(
      levelquizquestionid
    );
    return {
      error: false,
      data: true,
    };
  }

  @Put("setlesson/:levelquizquestionid")
  @ApiResponse({
    status: 200,
    description: "Level quiz question activated successfully",
    schema: { $ref: getSchemaPath(LevelQuizQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while activating level quiz question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatestatuslevelquizquestion),
    new BusinessValidationInterceptor([DeleteLevelQuizQuestion])
  )
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelquizquestionid`, type: () => String, required: true })
  async setlesson(
    @Param("levelquizquestionid") levelquizquestionid: string,
    @Body() body: LevelQuizSetLesson
  ): Promise<ResponseBoolean> {
    await new LevelQuizQuestionBusiness().setlesson(
      levelquizquestionid,
      body.lessonid
    );
    return {
      error: false,
      data: true,
    };
  }
}
