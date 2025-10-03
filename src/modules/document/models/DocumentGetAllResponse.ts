import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { DocumentBase } from './DocumentBase';

export class DocumentGetAllResponse extends IResponse<IPagingResult<DocumentBase>> {

  
  @ApiProperty()
  data: IPagingResult<DocumentBase> | undefined;

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