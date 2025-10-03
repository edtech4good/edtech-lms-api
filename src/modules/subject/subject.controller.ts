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
  ApiTags,
  ApiBearerAuth,
  ApiResponse,
  getSchemaPath,
  ApiBody,
  ApiParam,
} from "@nestjs/swagger";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { subjectsAttributes } from "src/models/data-models/subjects";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { LmsUserToken } from "src/models/token.model";
import { DocumentTagCreateResponse } from "../documenttag/models/DocumentTagBase";
import { SubjectBusiness } from "src/business/subject.business";
import { SubjectRequest } from "./models/SubjectRequest";
import { SubjectCreateResponse } from "./models/SubjectBase";
import { SchemaValidationInterceptor, BusinessValidationInterceptor } from "src/interceptors";
import { createsubject, deletesubject, showallsubject, showsubject, updatesubject } from "./subject.request.validator";
import { CreateSubject, DeleteSubject, EditSubject } from "./subject.business.validator";
import { SubjectGetAllResponse } from "./models/SubjectGetAllResponse";
import { IMultiPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";

@ApiTags("Subjects")
@Controller("subject")
@ApiBearerAuth()
export class SubjectController {
  @Post("create")
  @ApiResponse({
    status: 200,
    description: "Document tag created successfully",
    schema: { $ref: getSchemaPath(DocumentTagCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating document tag",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createsubject),
    new BusinessValidationInterceptor([CreateSubject])
  )
  @RequirePermissions(Permission.CREATE_SUBJECT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: SubjectRequest,
    @User() user: LmsUserToken
  ): Promise<SubjectCreateResponse> {
    const temp: subjectsAttributes = {
      subjectid: "",
      subjectname: body.subjectname,
      subjectdescription: body.subjectdescription,
      isdeleted: false,
    };

    const data = await new SubjectBusiness().createsubject(temp, user);
    return {
      error: false,
      data: data,
    };
  }

  @Post('')
  @ApiResponse({
    status: 200,
    description: 'Subjects fetch successfully',
    schema: { $ref: getSchemaPath(SubjectGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching subject',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallsubject))
  @ApiBody({ required: false, type: IMultiPaging })
  @RequirePermissions(Permission.VIEW_SUBJECT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IMultiPaging): Promise<SubjectGetAllResponse> {
    const tempresult = await new SubjectBusiness().getsubjectall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || []
    });
    return <SubjectGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      }
    };
  }

  @Delete(':subjectid')
  @ApiResponse({
    status: 200,
    description: 'Document tag deleted successfully',
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while deleting document tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(deletesubject), new BusinessValidationInterceptor([DeleteSubject]))
  @RequirePermissions(Permission.DELETE_SUBJECT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `subjectid`, type: 'string', required: true })
  async delete(
    @Param('subjectid') subjectid: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {

    await new SubjectBusiness().deletesubject(subjectid, user);
    return {
      error: false,
      data: true
    };
  }

  @Get(':subjectid')
  @ApiResponse({
    status: 200,
    description: 'Subject fetch successfully',
    schema: { $ref: getSchemaPath(SubjectCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching subject',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showsubject), new BusinessValidationInterceptor([DeleteSubject]))
  @RequirePermissions(Permission.VIEW_SUBJECT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `subjectid`, type: 'string', required: true })
  async get(@Param('subjectid') subjectid: string): Promise<SubjectCreateResponse> {
    const data = await new SubjectBusiness().getsubjectbyid(subjectid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @Put(':subjectid')
  @ApiResponse({
    status: 200,
    description: 'Subject update successfully',
    schema: { $ref: getSchemaPath(SubjectCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching subjet',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatesubject), new BusinessValidationInterceptor([DeleteSubject, EditSubject]))
  @RequirePermissions(Permission.UPDATE_SUBJECT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `subjectid`, type: 'string', required: true })
  async update(
    @Param('subjectid') subjectid: string,
    @Body() body: SubjectRequest,
    @User() user: LmsUserToken
  ): Promise<SubjectCreateResponse> {
    const data = await new SubjectBusiness().updatesubject(<subjectsAttributes>{
      subjectid,
      subjectname: body.subjectname,
      subjectdescription: body.subjectdescription,
    }, user);
    return {
      error: false,
      data: data ? data : undefined
    };
  }
}
