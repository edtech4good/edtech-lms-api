import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { GradeBase } from './GradeBase';

export class GradeResponse extends IResponse<GradeBase> {

  @ApiProperty()
  data: GradeBase;

  

  constructor() {
    super();
    this.data = new GradeBase()
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