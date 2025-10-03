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
import { AccessGuard } from "src/guards/access.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { ValidationException } from "src/models";
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

@ApiExtraModels(DocumentBase)
@ApiTags("Document")
@Controller("document")
@ApiBearerAuth()
export class DocumentController {
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
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes("multipart/form-data")
  async uploadFile(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    if (!files || files.length <= 0) {
      throw new ValidationException("Invalid file type");
    }
    if (!files || files.length != 1) {
      throw new ValidationException("Only one file upload allowed");
    }
    const filenamevalidation = (
      (fileExtension(files[0].originalname) || "") as string
    ).trim();
    if (filenamevalidation.length <= 0) {
      throw new ValidationException("Invalid file name");
    }
    const actualFilename = files[0].originalname.replace(
      `.${filenamevalidation}`,
      ""
    ).trim();
    if (!/^[a-zA-Z0-9_]+$/.test(actualFilename) || actualFilename.length > 25) {
      throw new ValidationException("Invalid file name, only alpha numeric is allowed and file name max length of 25 characters only");
    }
    const db = new DocumentBusiness();
    const filename = filenameextractor(files[0].originalname);
    if (filename.filetype <= 0) {
      throw new ValidationException("Invalid file type");
    }
   
    const temp: documentsAttributes = {
      documentname: filename.filename,
      documentid: "",
      isdeleted: false,
      documenttypeid: filename.filetype,
      lastupdated: new Date(),
    };

    if (await db.isexistsdocumentName(temp)) {
      throw new ValidationException(
        "File exists, Please delete old file before upload"
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
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new DocumentBusiness().deletedocument(documentid, user);
    return {
      error: false,
      data: true,
    };
  }

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
  async getall(@Body() body: IPaging): Promise<DocumentGetAllResponse> {
    const tempresult = await new DocumentBusiness().getdocumentall({
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
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new DocumentBusiness().deletedocumentTag(documentid, tag, user);
    return {
      error: false,
      data: true,
    };
  }

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
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new DocumentBusiness().adddocumentTag(documentid, tag, user);
    return {
      error: false,
      data: true,
    };
  }

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
    @Param("filename") filename: string
  ): Promise<ResponseString> {
    return {
      error: false,
      data: await AWSService.preSignURL(filename),
    };
  }
}
