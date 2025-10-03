import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class StandardBase {
  @ApiProperty()
  standardname: string;
  @ApiProperty()
  standardid: string;
  @ApiProperty()
  isdeleted: Boolean;

  constructor() {
    this.standardname = '';
    this.standardid = '';
    this.isdeleted = true;
  }
}

export class UserBase {
  @ApiProperty()
  lmsuserid: string;
  @ApiProperty()
  lmsusername: string;
  @ApiProperty()
  lmsuserpasswordhash: string;

  constructor() {
    this.lmsuserid = '';
    this.lmsusername = '';
    this.lmsuserpasswordhash = '';
  }
}


export class UserCreateResponse extends IResponse<UserBase> {

  @ApiProperty()
  data?: UserBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
