import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { SubjectBase } from './SubjectBase';

export class SubjectGetAllResponse extends IResponse<IPagingResult<SubjectBase>> {


  @ApiProperty()
  data: IPagingResult<SubjectBase> | undefined;

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