import { ApiProperty } from '@nestjs/swagger';

export class RegisterRequestBody {
  @ApiProperty()
  lmsusername: string;

  @ApiProperty()
  lmsuserpassword: string;

  @ApiProperty()
  firstname: string;

  @ApiProperty()
  lastname?: string;

  @ApiProperty()
  lmsuserrole: string;

  constructor() {
    this.lmsusername = '';
    this.lmsuserpassword = '';
    this.firstname = '';
    this.lmsuserrole = '';
  }

}
