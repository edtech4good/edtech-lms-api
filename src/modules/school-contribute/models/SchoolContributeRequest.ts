import { ApiProperty } from "@nestjs/swagger";

export class SchoolContributeRequest {
  @ApiProperty()
  schoolname: string;
  @ApiProperty()
  schoolid: string;
  @ApiProperty()
  countryid: string;
  @ApiProperty()
  expected: number;
  @ApiProperty()
  actual: number;

  constructor() {
    this.schoolname = "";
    this.schoolid = "";
    this.countryid = "";
    this.expected = 0;
    this.actual = 0;
  }
}

export class SchoolContributeUpdateRequest {
  @ApiProperty()
  schoolname: string;
  @ApiProperty()
  countryid: string;

  constructor() {
    this.schoolname = "";
    this.countryid = "";
  }
}

export class SchoolContributeUpdateDashboardRequest {
  @ApiProperty()
  expected: number;
  @ApiProperty()
  actual: number;

  constructor() {
    this.expected = 0;
    this.actual = 0;
  }
}

export class date {
  @ApiProperty()
  date: string;

  constructor() {
    this.date = '';
  }
}