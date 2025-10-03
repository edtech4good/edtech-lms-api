import { ApiProperty } from '@nestjs/swagger';

export class UserRequest {
  @ApiProperty()
  lmsusername: string;
  @ApiProperty()
  lmsuserpasswordhash: string;
  @ApiProperty()
  lmsuserroles: string[];
  @ApiProperty()
  countryids: string[];
  @ApiProperty()
  schoolids: string[];
  
  constructor() {
    this.lmsusername = '';
    this.lmsuserpasswordhash = '';
    this.lmsuserroles = [];
    this.countryids = [];
    this.schoolids = [];
  }
}
