import { ApiProperty } from "@nestjs/swagger";

export class SchoolRequest {
  @ApiProperty()
  schoolname: string;
  @ApiProperty()
  countryid: string;
  @ApiProperty()
  curriculums: Array<string>;
  @ApiProperty({ required: false, enum: ["kids", "corporate"] })
  uitheme?: string;

  constructor() {
    this.schoolname = "";
    this.countryid = "";
    this.curriculums = [];
  }
}
