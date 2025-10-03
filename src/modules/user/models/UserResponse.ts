import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { StandardBase } from './UserBase';

export class StandardResponse extends IResponse<StandardBase> {

  @ApiProperty()
  data: StandardBase;

  constructor() {
    super();
    this.data = <StandardBase>{
      standardid: "",
      standardname: "",
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