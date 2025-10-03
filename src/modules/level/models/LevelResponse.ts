import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { LevelBase } from './LevelBase';

export class LevelResponse extends IResponse<LevelBase> {

  @ApiProperty()
  data: LevelBase;

  constructor() {
    super();
    this.data = new LevelBase()
  }
}


/*
{
  pageIndex: number;
  pageSize: number;
  sort: Array<{ key: string; value: 'ascend' | 'descend' | null }>;
  filter: Array<{ key: string; value: any | any[] }>;
}
*/