import { IPagingResult } from "src/models/IPagingResult";
import { SchoolContributeBase } from "./SchoolContributeBase";
import { IResponse } from "src/models/IResponse";
import { ApiProperty } from "@nestjs/swagger";

export class SchoolContributeGetAllResponse extends IResponse<IPagingResult<SchoolContributeBase>> {
  @ApiProperty()
  data: IPagingResult<SchoolContributeBase> | undefined;

  constructor() {
      super();
  }
}