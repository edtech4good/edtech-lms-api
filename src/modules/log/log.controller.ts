import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
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
import { UploadLimits } from "src/constants/upload-limits";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { TokenType } from "src/models/enums";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { dbinstance } from "src/services/dbservice";
import { CentralDirectory, File, Open } from "unzipper";
import { Istudentprogress, LogBusiness } from "./../../business/log.business";
import { v4 as uuidv4 } from "uuid";
import { User } from "src/decorators/user.decorator";
import { LmsUserToken } from "src/models/token.model";
import { LOG_ZIP_DECOMPRESSED_MAX_BYTES } from "src/constants/zip-limits";

const logger = new Logger("LogController");

// Streams a zip entry and counts bytes as they come out of the inflater,
// aborting once the cap is exceeded. Defence in depth against a central
// directory that under-reports uncompressedSize (see workspace#53).
const bufferWithLimit = (
  file: File,
  password: string,
  maxBytes: number
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = file.stream(password);
    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        stream.destroy();
        reject(new ApiError(ErrorCode.FILE_REJECTED, "That file is too large.", { status: HttpStatus.PAYLOAD_TOO_LARGE }));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (e: Error) => reject(e));
  });

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
    FileInterceptor("importfile", { limits: UploadLimits.LOG_IMPORT })
  )
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
    let directory: CentralDirectory;
    try {
      directory = await Open.buffer(zipfile.buffer);
    } catch (e: any) {
      logger.warn(`Failed to open log import zip: ${e?.message ?? e}`);
      throw new ApiError(ErrorCode.FILE_REJECTED, "That file can't be read.");
    }
    if (directory.files.length > 0) {
      for (const file of directory.files) {
        if (file.uncompressedSize > LOG_ZIP_DECOMPRESSED_MAX_BYTES) {
          throw new ApiError(ErrorCode.FILE_REJECTED, "That file is too large.", { status: HttpStatus.PAYLOAD_TOO_LARGE });
        }
      }
      const tnx = await dbinstance.getdbinstance().transaction();
      const logbusiness = new LogBusiness(tnx);
      const zipAWSS3filename = `logupload-${new Date().getTime()}.zip`;
      await logbusiness.recordSyncActivity(user, zipAWSS3filename, offline);
      try {
        const parentfileid = uuidv4();
        for await (const file of directory.files) {
          if(file.path === 'log.ini') {
            const logdata: Istudentprogress = JSON.parse(
              (
                await bufferWithLimit(
                  file,
                  "7egGmeU4gRE6YAcx",
                  LOG_ZIP_DECOMPRESSED_MAX_BYTES
                )
              ).toString()
            );
            await logbusiness.importstudentsprogress(logdata);
          } else if(file.path.includes('RPI-API')) {
            await logbusiness.createstudentaccesslogfiles(file, parentfileid);
          } else {
            throw new ApiError(ErrorCode.FILE_REJECTED, "That zip file contains something we can't import.");
          }
        }
        await logbusiness.uploadZipFileToAWSS3(zipfile, zipAWSS3filename, parentfileid);
        await tnx.commit();
        return {
          error: false,
          data: true,
        };
      } catch (e: any) {
        await tnx.rollback();
        // Unwrap: `e` here can be a DB failure (e.g. a dropped connection
        // mid-transaction), not bad input - pass the ORIGINAL error through
        // so the filter can map it to SERVICE_UNAVAILABLE/INTERNAL instead
        // of a 400 carrying its raw message (docs/api-errors.md "wrapped
        // errors must be unwrapped first").
        throw e;
      }
    }
    throw new ApiError(ErrorCode.FILE_REJECTED, "That zip file is empty.");
  }
}
