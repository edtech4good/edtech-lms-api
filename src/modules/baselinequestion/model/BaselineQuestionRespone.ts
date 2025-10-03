import { ApiProperty } from "@nestjs/swagger";
import { IResponse } from "src/models/IResponse";
import { BaselineQuestionBase } from "./BaselineQuestionBase";

export class BaselineQuestionResponse extends IResponse<BaselineQuestionBase> {

  @ApiProperty()
  data: BaselineQuestionBase;

  constructor() {
    super();
    this.data = new BaselineQuestionBase()
  }
}