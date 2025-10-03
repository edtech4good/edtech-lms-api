import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class BaselineQuestionBase {
  @ApiProperty()
  curriculumbaselineid?: string = '';

  @ApiProperty()
  questionid?: string = '';

  @ApiProperty()
  baselinequestionstatus?: Boolean = true;
  
  @ApiProperty()
  baselinequestionorder?: number = 1;

  @ApiProperty()
  isdeleted?: Boolean = false;
}

export class BaselineQuestionCreateResponse extends IResponse<BaselineQuestionBase> {
  @ApiProperty()
  data?: BaselineQuestionBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
