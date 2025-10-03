import { ApiProperty } from '@nestjs/swagger';

export class RefreshtokenRequestBody {
  @ApiProperty()
  REFRESHTOKEN: string;

  constructor() {
    this.REFRESHTOKEN = '';
  }
}
