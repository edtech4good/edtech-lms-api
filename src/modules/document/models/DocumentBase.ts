import { ApiProperty } from '@nestjs/swagger';

export class DocumentBase {

  @ApiProperty()
  documentname: string = "";

  @ApiProperty()
  documenttags: Array<string> = [];

  @ApiProperty()
  documentid: string = "";

  @ApiProperty()
  documenttypeid: number = -1;

  @ApiProperty()
  isdeleted: Boolean = false;
}

