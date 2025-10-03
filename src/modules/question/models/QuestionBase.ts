import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class QuestionBase {
  @ApiProperty()
  questionidentifier: string = '';

  @ApiProperty()
  questiontags: Array<string> = [];

  @ApiProperty()
  questionid: string = '';

  @ApiProperty()
  templatetypeid: number = -1;

  @ApiProperty()
  isdeleted: Boolean = false;

  @ApiProperty()
  questionstatus: Boolean = true;
}

export class QuestionCreateResponse extends IResponse<QuestionBase> {
  @ApiProperty()
  data?: QuestionBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
