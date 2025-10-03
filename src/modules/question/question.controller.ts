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
  ApiBody,
  ApiExtraModels,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { questionsAttributes } from "src/models/data-models/questions";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { FileMeta } from "src/models/filemeta.model";
import { IPaging } from "src/models/IPaging";
import { Question } from "src/models/question.model";
import { QuestionDistractor } from "src/models/questiondistractor.model";
import { QuestionHeading } from "src/models/questionheading.model";
import { QuestionOption } from "src/models/questionoption.model";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { QuestionBusiness } from "../../business";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import { QuestionBase, QuestionCreateResponse } from "./models/QuestionBase";
import { QuestionGetAllResponse } from "./models/QuestionGetAllResponse";
import { QuestionRequestResponse } from "./models/QuestionRequest";
import { QuestionResponse } from "./models/QuestionResponse";
import {
  CreateQuestion,
  DeleteQuestion,
  EditQuestion,
} from "./question.business.validator";
import {
  createquestion,
  deletequestion,
  questionOperations,
  showallquestion,
  showquestion,
  updatequestion,
  updatequestionIdentifier,
} from "./question.request.validator";

@ApiExtraModels(ResponseBoolean)
@ApiExtraModels(QuestionBase)
@ApiExtraModels(QuestionCreateResponse)
@ApiExtraModels(QuestionResponse)
@ApiExtraModels(QuestionGetAllResponse)
@ApiTags("Question")
@Controller("question")
@ApiBearerAuth()
export class QuestionController {
  @Post("create")
  @ApiResponse({
    status: 200,
    description: "Question created successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createquestion),
    new BusinessValidationInterceptor([CreateQuestion])
  )
  @RequirePermissions(Permission.CREATE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() @Body() body: Question,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new QuestionBusiness().createquestion(<questionsAttributes>{
      ...body,
    }, user);

    return {
      error: false,
      data: true,
    };
  }

  @Delete(":questionid")
  @ApiResponse({
    status: 200,
    description: "Question deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletequestion),
    new BusinessValidationInterceptor([DeleteQuestion])
  )
  @RequirePermissions(Permission.DELETE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questionid`, type: "string", required: true })
  async delete(
    @Param("questionid") questionid: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new QuestionBusiness().deletequestion(questionid, user);
    return {
      error: false,
      data: true,
    };
  }

  @Get(":questionid")
  @ApiResponse({
    status: 200,
    description: "Question fetch successfully",
    schema: { $ref: getSchemaPath(QuestionRequestResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showquestion),
    new BusinessValidationInterceptor([DeleteQuestion])
  )
  @RequirePermissions(Permission.VIEW_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questionid`, type: "string", required: true })
  async get(
    @Param("questionid") questionid: string
  ): Promise<QuestionRequestResponse> {
    const data = await new QuestionBusiness().getquestionbyid(questionid);
    return {
      error: false,
      data: data
        ? {
            isdeleted: data.isdeleted,
            questionid: data.questionid,
            questionidentifier: data.questionidentifier,
            questionoptions: <Array<QuestionOption>>data.questionoptions,
            questionstatus: data.questionstatus,
            templatetypeid: data.templatetypeid,
            questiondistractors: <Array<QuestionDistractor>>(
              data.questiondistractors
            ),
            questionfile: <FileMeta>data.questionfile,
            questionheading: <QuestionHeading>data.questionheading,
            questiontext: data.questiontext,
            questiontags: [],
            questioncorrectvalue: data.questioncorrectvalue
          }
        : undefined,
    };
  }

  @Put(":questionid")
  @ApiResponse({
    status: 200,
    description: "Question update successfully",
    schema: { $ref: getSchemaPath(QuestionCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatequestion),
    new BusinessValidationInterceptor([DeleteQuestion, EditQuestion])
  )
  @RequirePermissions(Permission.UPDATE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questionid`, type: "string", required: true })
  async update(
    @Param("questionid") questionid: string,
    @Body() body: Question,
    @User() user: LmsUserToken
  ): Promise<QuestionCreateResponse> {
    const data = await new QuestionBusiness().updatequestion(<
      questionsAttributes
    >{
      ...body,
      questionid,
    }, user);
    return {
      error: false,
      data: data
        ? <QuestionBase>{
            isdeleted: data.isdeleted,
            questionid: data.questionid,
            questionidentifier: data.questionidentifier,
            questionstatus: data.questionstatus,
            questiontags: [],
            templatetypeid: data.templatetypeid,
          }
        : undefined,
    };
  }

  @Post("")
  @ApiResponse({
    status: 200,
    description: "Questions fetch successfully",
    schema: { $ref: getSchemaPath(QuestionGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallquestion))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging): Promise<QuestionGetAllResponse> {
    const tempresult = await new QuestionBusiness().getquestionall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return <QuestionGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @Post("/search")
  @ApiResponse({
    status: 200,
    description: "Questions fetch successfully",
    schema: { $ref: getSchemaPath(QuestionGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallquestion))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getallOR(@Body() body: IPaging): Promise<QuestionGetAllResponse> {
    const tempresult = await new QuestionBusiness().getquestionallOR({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return <QuestionGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @Delete("tag/:questionid/:tag")
  @ApiResponse({
    status: 200,
    description: "Question tag removed successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting question tag",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.UPDATE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questionid`, type: "string", required: true })
  @ApiParam({ name: `tag`, type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(questionOperations))
  async deleteTag(
    @Param("questionid") questionid: string,
    @Param("tag") tag: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new QuestionBusiness().deletequestionTag(questionid, tag, user);
    return {
      error: false,
      data: true,
    };
  }

  @Get("tag/:questionid/:tag")
  @ApiResponse({
    status: 200,
    description: "Question tag added successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting question tag",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.UPDATE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questionid`, type: "string", required: true })
  @ApiParam({ name: `tag`, type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(questionOperations))
  async addTag(
    @Param("questionid") questionid: string,
    @Param("tag") tag: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new QuestionBusiness().addquestionTag(questionid, tag, user);
    return {
      error: false,
      data: true,
    };
  }

  @Put("activate/:questionid")
  @ApiResponse({
    status: 200,
    description: "Question activated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while activating question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletequestion),
    new BusinessValidationInterceptor([DeleteQuestion])
  )
  @RequirePermissions(Permission.UPDATE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questionid`, type: "string", required: true })
  async activate(
    @Param("questionid") questionid: string
  ): Promise<ResponseBoolean> {
    await new QuestionBusiness().activatequestion(questionid);
    return {
      error: false,
      data: true,
    };
  }

  @Put("/:questionid/questionidentifier/:questionidentifier")
  @ApiResponse({
    status: 200,
    description: "Question identifier updated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while updating question identifier",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatequestionIdentifier),
    new BusinessValidationInterceptor([DeleteQuestion])
  )
  @RequirePermissions(Permission.UPDATE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questionid`, type: "string", required: true })
  @ApiParam({ name: `questionidentifier`, type: "string", required: true })
  async updateQuestionIdentifier(
    @Param("questionid") questionid: string,
    @Param("questionidentifier") questionidentifier: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new QuestionBusiness().updatequestionIdentifier(
      questionid,
      questionidentifier,
      user
    );
    return {
      error: false,
      data: true,
    };
  }

  @Put("deactivate/:questionid")
  @ApiResponse({
    status: 200,
    description: "Question deactivated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deactivating question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletequestion),
    new BusinessValidationInterceptor([DeleteQuestion])
  )
  @RequirePermissions(Permission.UPDATE_QUESTION)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questionid`, type: "string", required: true })
  async deactivate(
    @Param("questionid") questionid: string
  ): Promise<ResponseBoolean> {
    await new QuestionBusiness().deactivatequestion(questionid);
    return {
      error: false,
      data: true,
    };
  }
}
