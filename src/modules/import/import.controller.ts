import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { TeacherBusiness } from "src/business/teacher.business";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { UploadLimits } from "src/constants/upload-limits";
import { AccessGuard } from "src/guards/access.guard";
import {
  SchemaValidationInterceptor,
  BusinessValidationInterceptor,
} from "src/interceptors";
import { TokenType } from "src/models/enums";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { SchoolExists } from "../school/school.business.validator";
import { getschoolstudents } from "../school/school.request.validator";
import { parse } from "csv";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { Permission } from "src/models/enums/permissions.enum";

@ApiTags("Import")
@Controller("import")
@ApiBearerAuth()
export class ImportController {
  @Put(":schoolname/teachers")
  @ApiResponse({
    status: 200,
    description: "School teachers uploaded sucesfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while uploading school teachers",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiResponse({
    status: 413,
    description: "File too large",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        importfile: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(getschoolstudents),
    new BusinessValidationInterceptor([SchoolExists])
  )
  @UseInterceptors(
    FileInterceptor("importfile", { limits: UploadLimits.TEACHER_IMPORT })
  )
  @ApiConsumes("multipart/form-data")
  @ApiParam({ name: `schoolname`, type: "string", required: true })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CREATE_IMPORT, Permission.UPDATE_IMPORT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async putteachers(
    @Param("schoolname") schoolname: string,
    @UploadedFile() file: Express.Multer.File
  ): Promise<any> {
    const newteachers: Array<any> = [];
    try {
      const csvdata = file.buffer.toString("utf8");
      const tempdata = parse(csvdata, {
        columns: true,
        skipEmptyLines: true,
        skipRecordsWithEmptyValues: true,
        skipRecordsWithError: false,
      });
      for await (const record of tempdata) {
        newteachers.push(record);
      }
    } catch (e) {
      throw new ApiError(ErrorCode.FILE_REJECTED, "That file can't be read. Check it's a CSV and try again.");
    }

    if (
      newteachers.find(
        (teacher: any) =>
          !teacher.hasOwnProperty("teacherusername") ||
          !teacher.hasOwnProperty("teacheruserpassword") ||
          (teacher.teacherusername || "").length <= 0 ||
          (teacher.teacheruserpassword || "").length <= 0
      )
    ) {
      throw new ApiError(ErrorCode.FILE_REJECTED, "That file is missing a username or password for one or more teachers.");
    }
    const tb = new TeacherBusiness();
    const duplicates = await tb.getteacherusersbyschoolname(
      schoolname.trim(),
      newteachers.map((x) => x.teacherusername)
    );
    if (duplicates.length > 0) {
      // Was: joined the OTHER users' usernames into the error message -
      // docs/api-errors.md: never echo other users' names in a response.
      throw new ApiError(ErrorCode.ALREADY_EXISTS, "Some teachers in this file already exist.");
    }
    await tb.addteacheruserbyschoolname(newteachers, schoolname.trim());
    return {
      error: false,
      data: true,
    };
  }
}
