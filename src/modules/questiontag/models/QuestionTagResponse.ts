import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { QuestionTagBase } from './QuestionTagBase';

export class QuestionTagResponse extends IResponse<QuestionTagBase> {

  @ApiProperty()
  data: QuestionTagBase;

  constructor() {
    super();
    this.data = <QuestionTagBase>{
      questiontagid: "",
      questiontagname: "",
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