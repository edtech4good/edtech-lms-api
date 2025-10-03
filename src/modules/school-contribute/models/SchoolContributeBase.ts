import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class SchoolContributeBase {
  @ApiProperty()
  expected?: number;
  @ApiProperty()
  actual?: number;
  @ApiProperty()
  schoolname?: string;
  @ApiProperty()
  schoolid?: string;
  @ApiProperty()
  countryid?: string;
  @ApiProperty()
  schoolcontributeid?: string;
  @ApiProperty()
  isdeleted?: Boolean;

  constructor() {
    this.schoolcontributeid = '';
    this.expected = 0;
    this.actual = 0;
    this.schoolname = '';
    this.schoolid = '';
    this.countryid = '';
    this.isdeleted = true;
  }
}


export class SchoolContributeCreateResponse extends IResponse<SchoolContributeBase> {

  @ApiProperty()
  data?: SchoolContributeBase;

  constructor() {
    super();
    this.data = undefined;
  }
}

export class SchoolContributeCreateMultiResponse extends IResponse<Array<SchoolContributeBase>> {

  @ApiProperty()
  data?: Array<SchoolContributeBase>;

  constructor() {
    super();
    this.data = undefined;
  }
}