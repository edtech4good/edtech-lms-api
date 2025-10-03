import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { DocumentTagBase } from './DocumentTagBase';

export class DocumentTagResponse extends IResponse<DocumentTagBase> {

  @ApiProperty()
  data: DocumentTagBase;

  constructor() {
    super();
    this.data = <DocumentTagBase>{
      documenttagid: "",
      documenttagname: "",
      isdeleted: false
    };
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