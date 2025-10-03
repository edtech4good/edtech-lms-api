import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { QuestionBase } from './QuestionBase';

export class QuestionResponse extends IResponse<QuestionBase> {

  @ApiProperty()
  data: QuestionBase;

  constructor() {
    super();
    this.data = new QuestionBase();
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