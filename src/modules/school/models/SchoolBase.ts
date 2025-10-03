import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class SchoolBase {
  @ApiProperty()
  schoolname?: string;
  @ApiProperty()
  curriculums?: Array<string>;
  @ApiProperty()
  countryid?: string;
  @ApiProperty()
  schoolid?: string;
  @ApiProperty()
  isdeleted?: Boolean;

  constructor() {
    this.schoolname = '';
    this.schoolid = '';
    this.countryid = "";
    this.curriculums = [];
    this.isdeleted = true;
  }
}


export class SchoolCreateResponse extends IResponse<SchoolBase> {

  @ApiProperty()
  data?: SchoolBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
