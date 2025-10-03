import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { LessonBase } from './LessonBase';

export class LessonResponse extends IResponse<LessonBase> {

  @ApiProperty()
  data: LessonBase;



  constructor() {
    super();
    this.data = new LessonBase()
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