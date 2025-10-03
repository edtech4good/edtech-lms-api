import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class StandardBase {
  @ApiProperty()
  standardname: string;
  @ApiProperty()
  standardid: string;
  @ApiProperty()
  schoolid: string;
  @ApiProperty()
  isdeleted: Boolean;

  constructor() {
    this.standardname = '';
    this.standardid = '';
    this.schoolid = '';
    this.isdeleted = true;
  }
}


export class StandardCreateResponse extends IResponse<StandardBase> {

  @ApiProperty()
  data?: StandardBase;

  constructor() {
    super();
    this.data = undefined;
  }
}

export class CreateResponseSchoolStandard extends IResponse<Array<StandardBase>>{
  @ApiProperty()
  data?: Array<StandardBase>;

  constructor() {
    super();
    this.data = undefined;
  }
}
