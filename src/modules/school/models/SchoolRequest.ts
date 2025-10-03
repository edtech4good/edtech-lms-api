import { ApiProperty } from "@nestjs/swagger";

export class SchoolRequest {
  @ApiProperty()
  schoolname: string;
  @ApiProperty()
  countryid: string;
  @ApiProperty()
  curriculums: Array<string>;

  constructor() {
    this.schoolname = "";
    this.countryid = "";
    this.curriculums = [];
  }
}
