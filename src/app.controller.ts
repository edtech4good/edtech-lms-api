// import { TokenType, Claim as claimenum } from '@armax_cloud/fortyk-entities/build/models/enums';
import { Controller, Get, Response, StreamableFile } from "@nestjs/common";
import { ApiExtraModels, ApiTags } from "@nestjs/swagger";
import { Response as eresp } from "express";
import { createReadStream } from "fs";
import { join } from "path";
import { IErrorResponse } from "./models/IErrorResponse";
import { IFilter, IPaging } from "./models/IPaging";
import { IPagingResult } from "./models/IPagingResult";
import { IResponse } from "./models/IResponse";
import { ResponseBoolean } from "./models/ResponseBoolean";

//import { RegisterResponse } from './modules/auth';
// import { RegisterResponse } from './modules/auth';

// import { Claim } from './decorators/claim.decorator';
// import { AccessGuard } from './guards/access.guard';

@ApiExtraModels(
  IResponse,
  IFilter,
  IPaging,
  IPagingResult,
  ResponseBoolean,
  IErrorResponse
)
@Controller()
@ApiTags("Basic")
export class AppController {
  // @ApiBearerAuth()
  // @UseGuards(AccessGuard(TokenType.ACCESS))
  // @Claim(claimenum.access, claimenum.activateuser)
  @Get()
  getbase(): string {
    return "FORTYK API ***";
  }

  @Get("version")
  getversion(): string {
    return "1.0.0";
  }

  @Get("assets/user-upload.csv")
  getstudentuploadFile(
    @Response({ passthrough: true }) res: eresp
  ): StreamableFile {
    const file = createReadStream(
      join(__dirname, "..", "assets/user-upload.csv")
    );
    res.set({
      "Content-Type": "application/json",
      "Content-Disposition": "attachment;filename=user-upload.csv",
    });
    return new StreamableFile(file);
  }

  @Get("assets/teacher-upload.csv")
  getteacheruploadFile(
    @Response({ passthrough: true }) res: eresp
  ): StreamableFile {
    const file = createReadStream(
      join(__dirname, "..", "assets/teacher-upload.csv")
    );
    res.set({
      "Content-Type": "application/json",
      "Content-Disposition": "attachment;filename=teacher-upload.csv",
    });
    return new StreamableFile(file);
  }
}
