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

  @ApiProperty({ nullable: true, description: "What a person called the file; null means show documentname" })
  documenttitle: string | null = null;

  @ApiProperty({ example: "unspecified" })
  documentlicence: string = "unspecified";

  @ApiProperty({ nullable: true, description: "{ v: 1, author?, sourceurl?, adaptedfrom? } or null" })
  documentattribution: object | null = null;
}

