import { ApiProperty } from '@nestjs/swagger';

export class DocumentTagRequest {
  @ApiProperty()
  documenttagname: string;
  
  constructor() {
    this.documenttagname = '';
  }
}
