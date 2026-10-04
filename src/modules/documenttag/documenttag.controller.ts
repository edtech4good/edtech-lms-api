import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiParam, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { User } from 'src/decorators/user.decorator';
import { AccessGuard } from 'src/guards/access.guard';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { SchemaValidationInterceptor } from 'src/interceptors';
import { documenttagsAttributes } from 'src/models/data-models/documenttags';
import { TokenType } from 'src/models/enums';
import { Permission } from 'src/models/enums/permissions.enum';
import { IPaging } from 'src/models/IPaging';
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { LmsUserToken } from 'src/models/token.model';
import { DocumentTagBusiness } from '../../business';
import { BusinessValidationInterceptor } from '../../interceptors/businessvalidation.interceptor';
import { CreateDocumentTag, DeleteDocumentTag, EditDocumentTag } from './documenttag.business.validator';
import { createdocumenttag, deletedocumenttag, showalldocumenttag, showdocumenttag, updatedocumenttag } from "./documenttag.request.validator";
import { DocumentTagBase, DocumentTagCreateResponse } from './models/DocumentTagBase';
import { DocumentTagGetAllResponse } from './models/DocumentTagGetAllResponse';
import { DocumentTagRequest } from './models/DocumentTagRequest';
import { DocumentTagResponse } from './models/DocumentTagResponse';
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { ownerForNewContent } from "src/business/content-owner";


@ApiExtraModels(DocumentTagBase)
@ApiExtraModels(DocumentTagCreateResponse)
@ApiExtraModels(DocumentTagResponse)
@ApiExtraModels(DocumentTagGetAllResponse)
@ApiTags('Document Tag')
@Controller('documenttag')
@ApiBearerAuth()
export class DocumentTagController {
  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Post('create')
  @ApiResponse({
    status: 200,
    description: 'Document tag created successfully',
    schema: { $ref: getSchemaPath(DocumentTagCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while creating document tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(createdocumenttag), new BusinessValidationInterceptor([CreateDocumentTag]))
  @RequirePermissions(Permission.CREATE_DOCUMENTTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: DocumentTagRequest,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<DocumentTagCreateResponse> {
    const temp: documenttagsAttributes = {
      organisationid: ownerForNewContent(org),
      documenttagname: body.documenttagname,
      documenttagid: "",
      isdeleted: false
    };

    const data = await new DocumentTagBusiness(org).createdocumentTag(temp, user);
    return {
      error: false,
      data: data
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Delete(':documenttagid')
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
  @UseInterceptors(new SchemaValidationInterceptor(deletedocumenttag), new BusinessValidationInterceptor([DeleteDocumentTag]))
  @RequirePermissions(Permission.DELETE_DOCUMENTTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `documenttagid`, type: 'string', required: true })
  async delete(
    @Param('documenttagid') documenttagid: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {

    await new DocumentTagBusiness(org).deletedocumentTag(documenttagid, user);
    return {
      error: false,
      data: true
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get(':documenttagid')
  @ApiResponse({
    status: 200,
    description: 'Document tag fetch successfully',
    schema: { $ref: getSchemaPath(DocumentTagCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching document tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showdocumenttag), new BusinessValidationInterceptor([DeleteDocumentTag]))
  @RequirePermissions(Permission.VIEW_DOCUMENTTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `documenttagid`, type: 'string', required: true })
  async get(@Param('documenttagid') documenttagid: string, @Org() org: OrgContext): Promise<DocumentTagCreateResponse> {
    const data = await new DocumentTagBusiness(org).getdocumentTagbyid(documenttagid);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put(':documenttagid')
  @ApiResponse({
    status: 200,
    description: 'Document tag update successfully',
    schema: { $ref: getSchemaPath(DocumentTagCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching document tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(updatedocumenttag), new BusinessValidationInterceptor([DeleteDocumentTag, EditDocumentTag]))
  @RequirePermissions(Permission.UPDATE_DOCUMENTTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `documenttagid`, type: 'string', required: true })
  async update(
    @Param('documenttagid') documenttagid: string,
    @Body() body: DocumentTagRequest,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<DocumentTagCreateResponse> {
    const data = await new DocumentTagBusiness(org).updatedocumentTagName(<documenttagsAttributes>{
      documenttagid,
      documenttagname: body.documenttagname
    }, user);
    return {
      error: false,
      data: data ? data : undefined
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Post('')
  @ApiResponse({
    status: 200,
    description: 'Document tags fetch successfully',
    schema: { $ref: getSchemaPath(DocumentTagGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching document tag',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @UseInterceptors(new SchemaValidationInterceptor(showalldocumenttag))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_DOCUMENTTAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging, @Org() org: OrgContext): Promise<DocumentTagGetAllResponse> {
    const tempresult = await new DocumentTagBusiness(org).getdocumentTagall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || []
    });
    return <DocumentTagGetAllResponse>{
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
