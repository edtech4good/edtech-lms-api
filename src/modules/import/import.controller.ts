import {
  BadRequestException,
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
  @UseInterceptors(FileInterceptor("importfile"))
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
      throw new BadRequestException({
        error: true,
        errormessage: "Invalid file",
      });
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
      throw new BadRequestException({
        error: true,
        errormessage: "Invalid file",
      });
    }
    const tb = new TeacherBusiness();
    const duplicates = await tb.getteacherusersbyschoolname(
      schoolname.trim(),
      newteachers.map((x) => x.teacherusername)
    );
    if (duplicates.length > 0) {
      throw new BadRequestException({
        error: true,
        errormessage: `Duplicate teacher found : ${duplicates
          .map((x) => x.schoolusername)
          .join()}`,
      });
    }
    await tb.addteacheruserbyschoolname(newteachers, schoolname.trim());
    return {
      error: false,
      data: true,
    };
  }
}
