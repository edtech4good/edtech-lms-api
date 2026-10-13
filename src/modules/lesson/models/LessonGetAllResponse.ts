import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { LessonBase } from './LessonBase';

export class LessonAllBase extends LessonBase {
  @ApiProperty()
  levelname: string = "";

  @ApiProperty({ nullable: true, description: "The organisation that owns the row; null when it has no owner yet. Listed so the platform view can name it." })
  organisationid?: string | null;
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