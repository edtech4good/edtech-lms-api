import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { StandardBase } from './StandardBase';

export class StandardGetAllResponse extends IResponse<IPagingResult<StandardBase>> {


  @ApiProperty()
  data: IPagingResult<StandardBase> | undefined;

  constructor() {
    super();
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