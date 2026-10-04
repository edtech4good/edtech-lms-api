import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import "multer";
import { UploadLimits } from "src/constants/upload-limits";
import { AccessGuard } from "src/guards/access.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { ApiError } from "src/models";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { documentsAttributes } from "src/models/data-models/documents";
import { TokenType } from "src/models/enums";
import { IPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { ResponseString } from "src/models/ResponseString";
import { AWSService } from "src/services/aws.service";
import { filenameextractor } from "src/services/util.service";
import { documenttagOperations, showalldocument } from ".";
import { DocumentBusiness } from "../../business";
import { DocumentBase } from "./models/DocumentBase";
import { DocumentGetAllResponse } from "./models/DocumentGetAllResponse";
// @ts-ignore
import fileExtension from "file-extension";
import { User } from "src/decorators/user.decorator";
import { LmsUserToken } from "src/models/token.model";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { Permission } from "src/models/enums/permissions.enum";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { assertTagsAllowed, ownerForNewContent, ownerOfDocument } from "src/business/content-owner";
import { findOwnedDocument } from "src/business/content-scope";

@ApiExtraModels(DocumentBase)
@ApiTags("Document")
@Controller("document")
@ApiBearerAuth()
export class DocumentController {
  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Post("/upload")
  @ApiResponse({
    status: 200,
    description: "Document uploaded successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while upolading document",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiResponse({
    status: 413,
    description: "File too large",
  })
  @RequirePermissions(Permission.CREATE_DOCUMENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        inputfile: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @UseInterceptors(AnyFilesInterceptor({ limits: UploadLimits.DOCUMENT_UPLOAD }))
  @ApiConsumes("multipart/form-data")
  async uploadFile(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // The owner is the organisation the caller acts in; refused before anything is uploaded.
    const organisationid = ownerForNewContent(org);
    if (!files || files.length <= 0) {
      throw new ApiError(ErrorCode.FILE_REJECTED, "That file type isn't supported.");
    }
    if (!files || files.length != 1) {
      throw new ApiError(ErrorCode.FILE_REJECTED, "Upload one file at a time.");
    }
    const filenamevalidation = (
      (fileExtension(files[0].originalname) || "") as string
    ).trim();
    if (filenamevalidation.length <= 0) {
      throw new ApiError(ErrorCode.FILE_REJECTED, "That file name isn't allowed.");
    }
    const actualFilename = files[0].originalname.replace(
      `.${filenamevalidation}`,
      ""
    ).trim();
    if (!/^[a-zA-Z0-9_]+$/.test(actualFilename) || actualFilename.length > 25) {
      throw new ApiError(ErrorCode.FILE_REJECTED, "File names can only use letters, numbers and _, up to 25 characters.");
    }
    const db = new DocumentBusiness(org);
    const filename = filenameextractor(files[0].originalname);
    if (filename.filetype <= 0) {
      throw new ApiError(ErrorCode.FILE_REJECTED, "That file type isn't supported.");
    }
   
    const temp: documentsAttributes = {
      documentname: filename.filename,
      documentid: "",
      isdeleted: false,
      documenttypeid: filename.filetype,
      lastupdated: new Date(),
      organisationid,
    };

    if (await db.isexistsdocumentName(temp)) {
      throw new ApiError(
        ErrorCode.ALREADY_EXISTS,
        "A file with that name already exists. Delete the old one first.",
      );
    }
    const s3data = await AWSService.uploadS3(
      filename.filename,
      files[0].buffer
    );
    temp.documents3meta = { ...s3data };
    await db.createdocument(temp, user);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Delete(":documentid")
  @ApiResponse({
    status: 200,
    description: "Document deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting document ",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.DELETE_DOCUMENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `documentid`, type: "string", required: true })
  async delete(
    @Param("documentid") documentid: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new DocumentBusiness(org).deletedocument(documentid, user);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Post("")
  @ApiResponse({
    status: 200,
    description: "Documents fetch successfully",
    schema: { $ref: getSchemaPath(DocumentGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching document ",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showalldocument))
  @RequirePermissions(Permission.VIEW_DOCUMENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiBody({ required: false, type: IPaging })
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging, @Org() org: OrgContext): Promise<DocumentGetAllResponse> {
    const tempresult = await new DocumentBusiness(org).getdocumentall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return <DocumentGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows.map(
          (x) =>
            <DocumentBase>{
              documentid: x.documentid,
              documentname: x.documentname,
              documenttypeid: x.documenttypeid,
              isdeleted: x.isdeleted,
              documenttags: x.documenttags,
            }
        ),
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Delete("tag/:documentid/:tag")
  @ApiResponse({
    status: 200,
    description: "Document tag removed successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting document ",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.UPDATE_DOCUMENT_TAG)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `documentid`, type: "string", required: true })
  @ApiParam({ name: `tag`, type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(documenttagOperations))
  async deleteTag(
    @Param("documentid") documentid: string,
    @Param("tag") tag: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new DocumentBusiness(org).deletedocumentTag(documentid, tag, user);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get("tag/:documentid/:tag")
  @ApiResponse({
    status: 200,
    description: "Document tag added successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting document ",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.VIEW_DOCUMENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `documentid`, type: "string", required: true })
  @ApiParam({ name: `tag`, type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(documenttagOperations))
  async addTag(
    @Param("documentid") documentid: string,
    @Param("tag") tag: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // the document in the path is the caller's, or not found (before the tag is compared with anything)
    await findOwnedDocument(org, documentid, { where: { isdeleted: false } });
    await assertTagsAllowed(org, "document", [tag], await ownerOfDocument(documentid));
    await new DocumentBusiness(org).adddocumentTag(documentid, tag, user);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { note: "The signed key must be scoped to the caller's organisation.", enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get("presign/:filename")
  @ApiResponse({
    status: 200,
    description: "Presign url generated successfully",
    schema: { $ref: getSchemaPath(ResponseString) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while generating presign url",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.VIEW_DOCUMENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `filename`, type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(documenttagOperations))
  async presignedupload(
    @Param("filename") filename: string,
    @Org() org: OrgContext
  ): Promise<ResponseString> {
    // The key is a name in the one file store every organisation shares: a name that a document of another
    // organisation (or one with no owner) already holds is refused, as an upload of an existing name is.
    if (await new DocumentBusiness(org).isNameHeldByAnother(filename)) {
      throw new ApiError(
        ErrorCode.ALREADY_EXISTS,
        "A file with that name already exists. Delete the old one first.",
      );
    }
    return {
      error: false,
      data: await AWSService.preSignURL(filename),
    };
  }
}
