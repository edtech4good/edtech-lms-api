import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { CurriculumBase } from './CurriculumBase';

export class CurriculumResponse extends IResponse<CurriculumBase> {

  @ApiProperty()
  data: CurriculumBase;

  constructor() {
    super();
    this.data = <CurriculumBase>{
      curriculumid: "",
      curriculumname: "",
      curriculumdescription: '',
      curriculumstatus: false,
      isdeleted: true
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