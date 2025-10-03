import { ApiProperty } from '@nestjs/swagger';

export class LoginRequestBody {
  @ApiProperty({ example: 'superadmin@superadmin.com' })
  lmsusername: string;

  @ApiProperty({ example: '123456@Abc' })
  lmsuserpassword: string;

  constructor() {
    this.lmsusername = '';
    this.lmsuserpassword = '';
  }
}
