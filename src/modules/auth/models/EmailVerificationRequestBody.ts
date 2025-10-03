import { ApiProperty } from '@nestjs/swagger';

export class EmailVerificationRequestBody {
  @ApiProperty()
  lmsusername: string;

  constructor() {
    this.lmsusername = '';
  }
}
