import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { DocumentTagBase } from './DocumentTagBase';

export class DocumentTagGetAllResponse extends IResponse<IPagingResult<DocumentTagBase>> {


  @ApiProperty()
  data: IPagingResult<DocumentTagBase> | undefined;

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