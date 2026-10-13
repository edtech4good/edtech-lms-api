import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { LevelBase } from './LevelBase';

export class LevelAllBase extends LevelBase {
  @ApiProperty()
  gradename: string = "";

  @ApiProperty({ nullable: true, description: "The organisation that owns the row; null when it has no owner yet. Listed so the platform view can name it." })
  organisationid?: string | null;
}

export class LevelGetAllResponse extends IResponse<IPagingResult<LevelAllBase>> {
  @ApiProperty()
  data: IPagingResult<LevelAllBase> | undefined;
  constructor() {
    super();
  }
}

export class LevelGetResponse extends IResponse<LevelAllBase> {
  @ApiProperty()
  data: LevelAllBase | undefined;
  constructor() {
    super();
  }
}