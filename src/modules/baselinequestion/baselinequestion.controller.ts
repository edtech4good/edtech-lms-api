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
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { assertSameOwner, ownerOfCurriculumBaseline, ownerOfQuestion } from "src/business/content-owner";
import { findOwnedBaseline, findOwnedQuestion } from "src/business/content-scope";
import { baselinequestion } from "src/models/data-models/baselinequestion";
import { Org, OrgContext } from "src/decorators/org.decorator";

@ApiExtraModels(ResponseBoolean)
@ApiExtraModels(BaselineQuestionBase)
@ApiExtraModels(BaselineQuestionCreateResponse)
@ApiExtraModels(BaselineQuestionResponse)
@ApiExtraModels()
@ApiTags("BaselineQuestion")
@Controller("baselinequestion")
@ApiBearerAuth()
export class BaselinequestionController {
  
  @OrgPolicy("owned")
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
      @User() user: LmsUserToken,
      @Org() org: OrgContext
  ): Promise<BaselineQuestionCreateResponse> {
      // The baseline and the question are both the caller's, or not found (before any owner is compared). The baseline
      // is its curriculum's; the question must have the same owner.
      await findOwnedBaseline(org, body.curriculumbaselineid, { where: { isdeleted: false } });
      await findOwnedQuestion(org, body.questionid);
      assertSameOwner(await ownerOfCurriculumBaseline(body.curriculumbaselineid), await ownerOfQuestion(body.questionid));
      const temp: baselinequestionAttributes = {
          curriculumbaselineid: body.curriculumbaselineid,
          questionid: body.questionid,
          baselinequestionorder: body.baselinequestionorder,
          isdeleted: false,
      };
  
      const data = await new BaselineQuestionBusiness(org).create(temp, user);
      return {
          error: false,
          data: data ?? undefined,
      };
  }

  @OrgPolicy("owned")
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
      @User() user: LmsUserToken,
      @Org() org: OrgContext
  ): Promise<any> {
      // Both baselines are the caller's, or not found (before any owner is compared). The clone is the target
      // baseline's: it takes the target curriculum's owner, so the source baseline's curriculum must have the same
      // owner, and so must every question that is copied across.
      await findOwnedBaseline(org, body.curriculumbaselineid, { where: { isdeleted: false } });
      await findOwnedBaseline(org, body.clonecurriculumbaselineid, { where: { isdeleted: false } });
      const sourceOwner = await ownerOfCurriculumBaseline(body.curriculumbaselineid);
      const targetOwner = await ownerOfCurriculumBaseline(body.clonecurriculumbaselineid);
      assertSameOwner(sourceOwner, targetOwner);
      for (const row of await baselinequestion.findAll({
        where: { curriculumbaselineid: body.curriculumbaselineid, isdeleted: false },
        attributes: ["questionid"],
      })) {
        if (row.questionid) assertSameOwner(targetOwner, await ownerOfQuestion(row.questionid));
      }
      const data = await new BaselineQuestionBusiness(org).clone(
        body.curriculumbaselineid,
        body.clonecurriculumbaselineid,
        user
      );
      return {
          error: false,
          data: data ?? undefined,
      };
  }

  @OrgPolicy("owned")
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
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new BaselineQuestionBusiness(org).activate(baselinequestionid);
    return {
      error: false,
      data: true,
    }
  }

  @OrgPolicy("owned")
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
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new BaselineQuestionBusiness(org).deactivate(baselinequestionid);
    return {
      error: false,
      data: true,
    }
  }

  @OrgPolicy("owned")
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
    @Param("baselinequestionorder") baselinequestionorder: number,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new BaselineQuestionBusiness(org).updateorderBaselineQuizQuestion(
      baselinequestionid,
      baselinequestionorder
    );
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
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
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new BaselineQuestionBusiness(org).deleteBaselineQuestion(
      baselinequestionid,
      user
    );
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned")
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
    @Param('curriculumbaselineid') curriculumbaselineid: string,
    @Org() org: OrgContext
  ):Promise<any> {
    // the baseline in the path is the caller's, or not found
    await findOwnedBaseline(org, curriculumbaselineid, { where: { isdeleted: false } });
    const data = await new BaselineQuestionBusiness(org).getAllBaselineQuestion(curriculumbaselineid);
    return {
      error: false,
      data: data ? data : undefined
    }
  }
}
