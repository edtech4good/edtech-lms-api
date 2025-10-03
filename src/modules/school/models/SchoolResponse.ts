import { ApiProperty } from "@nestjs/swagger";
import { IResponse } from "src/models/IResponse";
import { SchoolBase } from "./SchoolBase";

export class SchoolResponse extends IResponse<SchoolBase> {
  @ApiProperty()
  data: SchoolBase;

  constructor() {
    super();
    this.data = <SchoolBase>{
      schoolid: "",
      schoolname: "",
      countryid: "",
      curriculums: [],
      isdeleted: false,
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

export class SchoolCurriculumBase {
  @ApiProperty()
  schoolid: string = ""
  @ApiProperty()
  curriculumid: string = ""
  @ApiProperty()
  curriculumname: string = ""
}
export class SchoolCurriculumResponse extends IResponse<Array<SchoolCurriculumBase>> {
  @ApiProperty({ type: [SchoolCurriculumBase] })
  data: Array<SchoolCurriculumBase> | undefined;

  constructor() {
    super();
    this.data = [];
  }
}
