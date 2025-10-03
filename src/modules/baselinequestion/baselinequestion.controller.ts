import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiParam, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { BaselineQuestionBase, BaselineQuestionCreateResponse } from './model/BaselineQuestionBase';
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { BaselineQuestionResponse } from './model/BaselineQuestionRespone';
import { TokenType } from 'src/models/enums';
import { AccessGuard } from 'src/guards/access.guard';
import { BusinessValidationInterceptor, SchemaValidationInterceptor } from 'src/interceptors';
import { BaselineQuestionBusiness } from '../../business/baslinequestion.business';
import { clonebaselinequestion, createbaseline, deletebaselinequestion, order } from './baselinequestion.validator';
import { User } from 'src/decorators/user.decorator';
import { LmsUserToken } from 'src/models/token.model';
import { baselinequestionAttributes } from 'src/models/data-models/baselinequestion';
import { baselinequestionRequest, baselinequestioncloneRequest } from './model/BaselineQuestionRequest';
import { BaselineQuestionExists, CloneCurriculumBaseLine, DeleteBaselineQuestion } from './baselinequestion.business.validator';
import { DeleteQuestion } from '../question/question.business.validator';
import { DeleteCurriculumBaseLine } from '../curriculumbaseline/curriculumbaseline.business.validator';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { Permission } from 'src/models/enums/permissions.enum';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';

@ApiExtraModels(ResponseBoolean)
@ApiExtraModels(BaselineQuestionBase)
@ApiExtraModels(BaselineQuestionCreateResponse)
@ApiExtraModels(BaselineQuestionResponse)
@ApiExtraModels()
@ApiTags("BaselineQuestion")
@Controller("baselinequestion")
@ApiBearerAuth()
export class BaselinequestionController {
  
  @Post("create")
  @ApiResponse({
      status: 200,
      description: "BaselineQuestion created successfully",
      schema: { $ref: getSchemaPath(BaselineQuestionCreateResponse) },
  })
  @ApiResponse({
      status: 400,
      description: "Error while creating SchoolContribute",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createbaseline),
    new BusinessValidationInterceptor([
      DeleteCurriculumBaseLine,
      DeleteQuestion,
      BaselineQuestionExists
    ]),
)
  @ApiBody({type: baselinequestionRequest})
  @RequirePermissions(Permission.CREATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
      @Body() body: baselinequestionRequest,
      @User() user: LmsUserToken
  ): Promise<BaselineQuestionCreateResponse> {
      const temp: baselinequestionAttributes = {
          curriculumbaselineid: body.curriculumbaselineid,
          questionid: body.questionid,
          baselinequestionorder: body.baselinequestionorder,
          isdeleted: false,
      };
  
      const data = await new BaselineQuestionBusiness().create(temp, user);
      return {
          error: false,
          data: data ?? undefined,
      };
  }

  @Post("clone")
  @ApiResponse({
      status: 200,
      description: "BaselineQuestion created successfully",
      schema: { $ref: getSchemaPath(BaselineQuestionCreateResponse) },
  })
  @ApiResponse({
      status: 400,
      description: "Error while creating SchoolContribute",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(clonebaselinequestion),
    new BusinessValidationInterceptor([
      DeleteCurriculumBaseLine,
      CloneCurriculumBaseLine
      // DeleteQuestion,
      // BaselineQuestionExists
    ]),
)
  @ApiBody({type: baselinequestioncloneRequest})
  @RequirePermissions(Permission.CREATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async clone(
      @Body() body: baselinequestioncloneRequest,
      @User() user: LmsUserToken
  ): Promise<any> {
      const data = await new BaselineQuestionBusiness().clone(
        body.curriculumbaselineid,
        body.clonecurriculumbaselineid,
        user
      );
      return {
          error: false,
          data: data ?? undefined,
      };
  }

  @Put("activate/:baselinequestionid")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting Curriculum Base Line",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletebaselinequestion),
    new BusinessValidationInterceptor([DeleteBaselineQuestion])
  )
  @RequirePermissions(Permission.UPDATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `baselinequestionid`, type: "string", required: true })
  async activate(
    @Param("baselinequestionid") baselinequestionid: string,
  ): Promise<ResponseBoolean> {
    await new BaselineQuestionBusiness().activate(baselinequestionid);
    return {
      error: false,
      data: true,
    }
  }

  @Put("deactivate/:baselinequestionid")
  @ApiResponse({
    status: 200,
    description: "Curriculum Base Line deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting Curriculum Base Line",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletebaselinequestion),
    new BusinessValidationInterceptor([DeleteBaselineQuestion])
  )
  @RequirePermissions(Permission.UPDATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `baselinequestionid`, type: "string", required: true })
  async deactivate(
    @Param("baselinequestionid") baselinequestionid: string,
  ): Promise<ResponseBoolean> {
    await new BaselineQuestionBusiness().deactivate(baselinequestionid);
    return {
      error: false,
      data: true,
    }
  }

  @Put("order/:baselinequestionid/:baselinequestionorder")
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
    new SchemaValidationInterceptor(order),
    new BusinessValidationInterceptor([DeleteBaselineQuestion])
  )
  @RequirePermissions(Permission.UPDATE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `baselinequestionid`, type: () => String, required: true })
  @ApiParam({
    name: `baselinequestionorder`,
    type: () => Number,
    required: true,
  })
  async orderquizquestion(
    @Param("baselinequestionid") baselinequestionid: string,
    @Param("baselinequestionorder") baselinequestionorder: number
  ): Promise<ResponseBoolean> {
    await new BaselineQuestionBusiness().updateorderBaselineQuizQuestion(
      baselinequestionid,
      baselinequestionorder
    );
    return {
      error: false,
      data: true,
    };
  }

  @Delete(":baselinequestionid")
  @ApiResponse({
    status: 200,
    description: "Level quiz question deleted successfully",
    schema: { $ref: getSchemaPath(BaselineQuestionBase) },
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
    new SchemaValidationInterceptor(deletebaselinequestion),
    new BusinessValidationInterceptor([DeleteBaselineQuestion])
  )
  @RequirePermissions(Permission.DELETE_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `baselinequestionid`, type: () => String, required: true })
  async deletequizquestion(
    @Param("baselinequestionid") baselinequestionid: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new BaselineQuestionBusiness().deleteBaselineQuestion(
      baselinequestionid,
      user
    );
    return {
      error: false,
      data: true,
    };
  }

  @Get("getall/:curriculumbaselineid")
  @ApiResponse({
    status: 200,
    description: "baselinequestion fetch successfully",
    schema: { $ref: getSchemaPath(BaselineQuestionBase) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching level quiz question",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiParam({name: "curriculumbaselineid", type: 'string', required: true})
  @RequirePermissions(Permission.VIEW_BASELINEENDLINE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(
    @Param('curriculumbaselineid') curriculumbaselineid: string
  ):Promise<any> {
    const data = await new BaselineQuestionBusiness().getAllBaselineQuestion(curriculumbaselineid);
    return {
      error: false,
      data: data ? data : undefined
    }
  }
}
