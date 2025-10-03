import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { LevelBase } from './LevelBase';

export class LevelAllBase extends LevelBase {
  @ApiProperty()
  gradename: string = "";
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