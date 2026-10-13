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
import { AWSService } from "src/services/aws.service";
import { Logger } from "src/config";
import { v4 as uuidv4 } from "uuid";
import { ValidationException, ValidationFieldError } from "src/models/ValidationException";
import {
  checkDocumentFile,
  DOCUMENT_FILE_RULES,
  DocumentMetadataInput,
  documentMetadata,
  extensionOf,
  NO_FILE_MESSAGE,
  ONE_FILE_MESSAGE,
  storageKey,
  utf8FileName,
  titleError,
  UNSPECIFIED_LICENCE,
  uploadSizeLog,
} from "src/business/document-media";
import { documenttagOperations, showalldocument } from ".";
import { DocumentBusiness } from "../../business";
import { DocumentBase } from "./models/DocumentBase";
import { DocumentGetAllResponse } from "./models/DocumentGetAllResponse";
import { User } from "src/decorators/user.decorator";
import { LmsUserToken } from "src/models/token.model";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { Permission } from "src/models/enums/permissions.enum";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { assertTagsAllowed, ownerForNewContent, ownerOfDocument } from "src/business/content-owner";
import { findOwnedDocument } from "src/business/content-scope";

const METADATA_FIELDS = ["documenttitle", "documentlicence", "documentattribution"];

/** A multipart text field: one value of text, or absent (an empty one counts as absent: a form sends it blank). */
const textField = (body: Record<string, unknown> | undefined, name: string): { text?: string; error?: ValidationFieldError } => {
  const raw = body?.[name];
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== "string") {
    return { error: { field: name, message: `Send ${name} once, as text.` } };
  }
  return raw.trim().length === 0 ? {} : { text: raw };
};

/**
 * The upload's optional text fields as metadata input, and what was wrong with reading them. A title not sent is the
 * file's name without its extension (none when that is empty); a licence not sent stays 'unspecified'; the attribution
 * is JSON text. Messages name the field and never repeat what was sent.
 */
const uploadFields = (body: Record<string, unknown> | undefined, originalname: string): { input: DocumentMetadataInput; errors: ValidationFieldError[] } => {
  const input: DocumentMetadataInput = {};
  const errors: ValidationFieldError[] = [];
  const title = textField(body, "documenttitle");
  if (title.error) {
    errors.push(title.error);
  } else if (title.text !== undefined) {
    input.documenttitle = title.text;
  } else {
    // the name is trimmed first; its extension is cut only when it is one of the whitelist's (the upload was checked already)
    const name = originalname.trim();
    const dot = name.lastIndexOf(".");
    const whitelisted = dot >= 0 && Object.prototype.hasOwnProperty.call(DOCUMENT_FILE_RULES, extensionOf(name));
    const base = (whitelisted ? name.slice(0, dot) : name).split(/[\\/]/).pop()?.trim() ?? "";
    if (base.length > 0) {
      // a file name that is not usable as a title is refused rather than cut: the person gives a title
      if (titleError(base)) {
        errors.push({ field: "documenttitle", message: "The file's name can't be used as its title. Give the file a title." });
      } else {
        input.documenttitle = base;
      }
    }
  }
  const licence = textField(body, "documentlicence");
  if (licence.error) {
    errors.push(licence.error);
  } else if (licence.text !== undefined) {
    input.documentlicence = licence.text.trim();
  }
  const attribution = textField(body, "documentattribution");
  if (attribution.error) {
    errors.push(attribution.error);
  } else if (attribution.text !== undefined) {
    try {
      input.documentattribution = JSON.parse(attribution.text);
    } catch {
      errors.push({ field: "documentattribution", message: "The attribution must be JSON text." });
    }
  }
  return { input, errors };
};

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
        file: {
          type: "string",
          format: "binary",
        },
        documenttitle: { type: "string", description: "Optional; the file's name without its extension when left out" },
        documentlicence: { type: "string", description: "Optional; one of the allowed ids, 'unspecified' when left out" },
        documentattribution: { type: "string", description: "Optional; JSON text: { v: 1, author?, sourceurl?, adaptedfrom? }" },
      },
    },
  })
  @UseInterceptors(AnyFilesInterceptor({ limits: UploadLimits.DOCUMENT_UPLOAD }))
  @ApiConsumes("multipart/form-data")
  async uploadFile(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: Record<string, unknown> | undefined,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // The owner is the organisation the caller acts in; refused before anything is uploaded.
    const organisationid = ownerForNewContent(org);
    if (!files || files.length <= 0) {
      throw new ApiError(ErrorCode.FILE_REJECTED, NO_FILE_MESSAGE);
    }
    if (files.length != 1) {
      throw new ApiError(ErrorCode.FILE_REJECTED, ONE_FILE_MESSAGE);
    }
    const file = files[0];
    // The extension decides the type; the first bytes (and, for the zip-based formats, one entry inside) must agree.
    // The browser's MIME type is never read. Nothing below echoes the file name.
    const originalname = utf8FileName(file.originalname || "");
    const accepted = checkDocumentFile(originalname, file.buffer);
    const fields = uploadFields(body, originalname);
    const { values, errors } = documentMetadata(fields.input);
    if (fields.errors.length + errors.length > 0) {
      throw new ValidationException([...fields.errors, ...errors]);
    }
    // The row's own id is part of the stored key: the key holds no text a person typed, so no two uploads can share it.
    const documentid = uuidv4();
    const key = storageKey(documentid, accepted.extension);
    const s3data = await AWSService.uploadS3(key, file.buffer, accepted.contentType);
    const temp: documentsAttributes = {
      documentid,
      documentname: key,
      documenttitle: values.documenttitle ?? null,
      documentlicence: values.documentlicence ?? UNSPECIFIED_LICENCE,
      documentattribution: values.documentattribution ?? null,
      isdeleted: false,
      documenttypeid: accepted.documenttypeid,
      lastupdated: new Date(),
      organisationid,
      documents3meta: { ...s3data },
    };
    await new DocumentBusiness(org).createdocument(temp, user);
    // One line per accepted upload: the type id and the size in bytes, no name, title, key or owner, so that limits per
    // type can be set from what is really uploaded.
    const line = uploadSizeLog(accepted.documenttypeid, file.size ?? file.buffer.length);
    Logger.info(line.message, line.meta);
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
              documenttitle: x.documenttitle ?? null,
              documentlicence: x.documentlicence,
              documentattribution: x.documentattribution ?? null,
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

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put(":documentid")
  @ApiResponse({
    status: 200,
    description: "Document title, licence and attribution updated",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "The title, licence or attribution is not allowed",
  })
  @ApiResponse({
    status: 404,
    description: "No such document",
  })
  @RequirePermissions(Permission.CREATE_DOCUMENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `documentid`, type: "string", required: true })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        documenttitle: { type: "string", nullable: true },
        documentlicence: { type: "string" },
        documentattribution: { type: "object", nullable: true },
      },
    },
  })
  async updateMetadata(
    @Param("documentid") documentid: string,
    @Body() body: Record<string, unknown> | undefined,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    // the document in the path is the caller's, or not found (before the body is looked at)
    await findOwnedDocument(org, documentid, { where: { isdeleted: false } });
    const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const unknown = Object.keys(input).filter((k) => !METADATA_FIELDS.includes(k));
    if (unknown.length > 0) {
      throw new ValidationException(unknown.map((field) => ({ field, message: "That field can't be changed here." })));
    }
    if (Object.keys(input).length === 0) {
      throw new ValidationException([{ field: "documenttitle", message: "Give a title, a licence or an attribution to change." }]);
    }
    const { values, errors } = documentMetadata(input as DocumentMetadataInput);
    if (errors.length > 0) {
      throw new ValidationException(errors);
    }
    await new DocumentBusiness(org).updatemetadata(documentid, values, user);
    return {
      error: false,
      data: true,
    };
  }
}
