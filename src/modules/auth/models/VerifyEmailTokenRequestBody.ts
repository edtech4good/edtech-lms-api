import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailTokenRequestBody {
  @ApiProperty()
  VERIFYEMAILTOKEN: string;

  constructor() {
    this.VERIFYEMAILTOKEN = '';
  }
}
