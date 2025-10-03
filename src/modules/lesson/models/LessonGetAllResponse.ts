import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { LessonBase } from './LessonBase';

export class LessonAllBase extends LessonBase {
  @ApiProperty()
  levelname: string = "";
}

export class LessonGetAllResponse extends IResponse<IPagingResult<LessonAllBase>> {
  @ApiProperty()
  data: IPagingResult<LessonAllBase> | undefined;
  constructor() {
    super();
  }
}

export class LessonGetResponse extends IResponse<LessonAllBase> {
  @ApiProperty()
  data: LessonAllBase | undefined;
  constructor() {
    super();
  }
}