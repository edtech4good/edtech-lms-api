import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class QuestionTagBase {
  @ApiProperty()
  questiontagname: string;
  @ApiProperty()
  questiontagid: string;
  @ApiProperty()
  isdeleted: Boolean;

  constructor() {
    this.questiontagname = '';
    this.questiontagid = '';
    this.isdeleted = true;
  }
}


export class QuestionTagCreateResponse extends IResponse<QuestionTagBase> {

  @ApiProperty()
  data?: QuestionTagBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
