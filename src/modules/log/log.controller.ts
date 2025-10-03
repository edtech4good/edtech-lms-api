import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express/multer";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { TokenType } from "src/models/enums";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { dbinstance } from "src/services/dbservice";
import { Open } from "unzipper";
import { Istudentprogress, LogBusiness } from "./../../business/log.business";
import { v4 as uuidv4 } from "uuid";
import { User } from "src/decorators/user.decorator";
import { LmsUserToken } from "src/models/token.model";

@ApiTags("Log")
@Controller("log")
@ApiBearerAuth()
export class LogController {
  @Put("import")
  @ApiResponse({
    status: 200,
    description: "Log imported successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while importing log",
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
  @UseInterceptors(FileInterceptor("importfile"))
  // @RequirePermissions(Permission.UPDATE_IMPORT, Permission.CREATE_IMPORT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiQuery({ name: "offline", required: false, type: Boolean })
  @HttpCode(HttpStatus.OK)
  @ApiConsumes("multipart/form-data")
  async create(
    @UploadedFile() zipfile: Express.Multer.File,
    @User() user: LmsUserToken,
    @Query("offline") offline: boolean = false
  ): Promise<ResponseBoolean> {
    const directory = await Open.buffer(zipfile.buffer);
    if (directory.files.length > 0) {
      const tnx = await dbinstance.getdbinstance().transaction();
      const logbusiness = new LogBusiness(tnx);
      const zipAWSS3filename = `logupload-${new Date().getTime()}.zip`;
      await logbusiness.recordSyncActivity(user, zipAWSS3filename, offline);
      try {
        const parentfileid = uuidv4();
        for await (const file of directory.files) {
          if(file.path === 'log.ini') {
            const logdata: Istudentprogress = JSON.parse(
              (await file.buffer("7egGmeU4gRE6YAcx")).toString()
            );
            await logbusiness.importstudentsprogress(logdata);
          } else if(file.path.includes('RPI-API')) {
            await logbusiness.createstudentaccesslogfiles(file, parentfileid);
          } else {
            throw new BadRequestException('There is invalid file inside zip-file');
          }
        }
        await logbusiness.uploadZipFileToAWSS3(zipfile, zipAWSS3filename, parentfileid);
        await tnx.commit();
        return {
          error: false,
          data: true,
        };
      } catch (e: any) {
        tnx.rollback();
        throw new BadRequestException(
          {
            error: true,
            errormessage: e,
          },
          "Invalid File"
        );
      }
    }
    throw new BadRequestException({
      error: true,
      errormessage: "Invalid file (Zip-file is empty)",
    });
  }
}
