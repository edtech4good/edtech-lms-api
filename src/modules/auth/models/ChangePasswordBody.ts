import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordBody {
  @ApiProperty()
  lmsuserpassword: string;

  constructor() {
    this.lmsuserpassword = '';
  }
}
