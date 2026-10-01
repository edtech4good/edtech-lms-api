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
  @ApiProperty({ required: false, nullable: true, description: 'Platform callers only. The organisation the school belongs to; its country must be one of the organisation\'s countries.' })
  organisationid?: string | null;

  constructor() {
    this.schoolname = "";
    this.countryid = "";
    this.curriculums = [];
  }
}
