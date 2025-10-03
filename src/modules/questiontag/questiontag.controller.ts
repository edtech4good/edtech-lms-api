import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiParam, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { AccessGuard } from 'src/guards/access.guard';
import { SchemaValidationInterceptor } from 'src/interceptors';
import { questiontagsAttributes } from 'src/models/data-models/questiontags';
import { TokenType } from 'src/models/enums';
import { IPaging } from 'src/models/IPaging';
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { QuestionTagBusiness } from '../../business';
import { BusinessValidationInterceptor } from '../../interceptors/businessvalidation.interceptor';
import { CreateQuestionTag, DeleteQuestionTag, EditQuestionTag } from './questiontag.business.validator';
import { createquestiontag, deletequestiontag, showallquestiontag, showquestiontag, updatequestiontag } from "./questiontag.request.validator";
import { QuestionTagBase, QuestionTagCreateResponse } from './models/QuestionTagBase';
import { QuestionTagGetAllResponse } from './models/QuestionTagGetAllResponse';
import { QuestionTagRequest } from './models/QuestionTagRequest';
import { QuestionTagResponse } from './models/QuestionTagResponse';
import { User } from 'src/decorators/user.decorator';
import { LmsUserToken } from 'src/models/token.model';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { Permission } from 'src/models/enums/permissions.enum';


@ApiExtraModels(QuestionTagBase)
@ApiExtraModels(QuestionTagCreateResponse)
@ApiExtraModels(QuestionTagResponse)
@ApiExtraModels(QuestionTagGetAllResponse)
@ApiTags('Question Tag')
@Controller('questiontag')
@ApiBearerAuth()
export class QuestionTagController {
  @Post('create')
  @ApiResponse({
    status: 200,
    description: 'Question tag created successfully',
    schema: { $ref: getSchemaPath(QuestionTagCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while creating question tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(createquestiontag), new BusinessValidationInterceptor([CreateQuestionTag]))
  @RequirePermissions(Permission.CREATE_QUESTIONTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: QuestionTagRequest,
    @User() user: LmsUserToken
  ): Promise<QuestionTagCreateResponse> {
    const temp: questiontagsAttributes = {
      questiontagname: body.questiontagname,
      questiontagid: "",
      isdeleted: false
    };

    const data = await new QuestionTagBusiness().createquestionTag(temp, user);
    return {
      error: false,
      data: data
    };
  }

  @Delete(':questiontagid')
  @ApiResponse({
    status: 200,
    description: 'Question tag deleted successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deleting question tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(deletequestiontag), new BusinessValidationInterceptor([DeleteQuestionTag]))
  @RequirePermissions(Permission.DELETE_QUESTIONTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questiontagid`, type: 'string', required: true })
  async delete(
    @Param('questiontagid') questiontagid: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {

    await new QuestionTagBusiness().deletequestionTag(questiontagid, user);
    return {
      error: false,
      data: true
    };
  }

  @Get(':questiontagid')
  @ApiResponse({
    status: 200,
    description: 'Question tag fetch successfully',
    schema: { $ref: getSchemaPath(QuestionTagCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching question tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showquestiontag), new BusinessValidationInterceptor([DeleteQuestionTag]))
  @RequirePermissions(Permission.VIEW_QUESTIONTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questiontagid`, type: 'string', required: true })
  async get(@Param('questiontagid') questiontagid: string): Promise<QuestionTagCreateResponse> {
    const data = await new QuestionTagBusiness().getquestionTagbyid(questiontagid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @Put(':questiontagid')
  @ApiResponse({
    status: 200,
    description: 'Question tag update successfully',
    schema: { $ref: getSchemaPath(QuestionTagCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching question tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatequestiontag), new BusinessValidationInterceptor([DeleteQuestionTag, EditQuestionTag]))
  @RequirePermissions(Permission.UPDATE_QUESTIONTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `questiontagid`, type: 'string', required: true })
  async update(
    @Param('questiontagid') questiontagid: string,
    @Body() body: QuestionTagRequest,
    @User() user: LmsUserToken
  ): Promise<QuestionTagCreateResponse> {
    const data = await new QuestionTagBusiness().updatequestionTagName(<questiontagsAttributes>{
      questiontagid,
      questiontagname: body.questiontagname
    }, user);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @Post('')
  @ApiResponse({
    status: 200,
    description: 'Question tags fetch successfully',
    schema: { $ref: getSchemaPath(QuestionTagGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching question tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallquestiontag))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_QUESTIONTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging): Promise<QuestionTagGetAllResponse> {
    const tempresult = await new QuestionTagBusiness().getquestionTagall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || []
    });
    return <QuestionTagGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      }
    };
  }
}
