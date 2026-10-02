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
  @ApiProperty({ required: false, nullable: true, description: 'Platform callers only. On create: required unless the roles include Super Admin. On update: moves the account.' })
  organisationid?: string | null;

  constructor() {
    this.lmsusername = '';
    this.lmsuserpasswordhash = '';
    this.lmsuserroles = [];
    this.countryids = [];
    this.schoolids = [];
  }
}
