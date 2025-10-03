import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { SubjectBase } from './SubjectBase';

export class SubjectResponse extends IResponse<SubjectBase> {

  @ApiProperty()
  data: SubjectBase;

  constructor() {
    super();
    this.data = <SubjectBase>{
      subjectid: "",
      subjectname: "",
      subjectdescription: "",
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