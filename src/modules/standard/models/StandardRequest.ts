import { ApiProperty } from '@nestjs/swagger';

export class StandardRequest {
  @ApiProperty()
  standardname: string;
  @ApiProperty()
  schoolid: string;
  
  constructor() {
    this.standardname = '';
    this.schoolid = '';
  }
}
