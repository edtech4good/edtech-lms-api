import { ApiProperty } from "@nestjs/swagger";

export class OrganisationCountryBase {
  @ApiProperty()
  countryid: string;
  @ApiProperty()
  countryname: string;

  constructor() {
    this.countryid = "";
    this.countryname = "";
  }
}

export class OrganisationBase {
  @ApiProperty()
  organisationid: string;
  @ApiProperty()
  organisationname: string;
  @ApiProperty({ description: "Lowercase letters and digits, 2-16. Fixed after creation." })
  organisationcode: string;
  @ApiProperty({ description: "1 to 3 visible letters (grapheme clusters), up to 12 code points: letters and combining marks, such as Khmer vowel signs and subscripts. Used as tile initials." })
  organisationshortname: string;
  @ApiProperty({ enum: ["company", "schoolnetwork"], description: "What it started from. Fixed after creation." })
  organisationpreset: string;
  @ApiProperty({ description: "false means suspended." })
  organisationstatus: boolean;
  @ApiProperty({ enum: ["kids", "corporate"] })
  uitheme: string;
  @ApiProperty({ required: false, nullable: true, type: Object })
  brandingconfig?: object | null;
  @ApiProperty({ required: false, nullable: true, type: Object, description: "Read-only through this API." })
  settingsconfig?: object | null;
  @ApiProperty()
  isdeleted: boolean;
  @ApiProperty({ type: [OrganisationCountryBase] })
  countries: OrganisationCountryBase[];

  constructor() {
    this.organisationid = "";
    this.organisationname = "";
    this.organisationcode = "";
    this.organisationshortname = "";
    this.organisationpreset = "";
    this.organisationstatus = true;
    this.uitheme = "kids";
    this.isdeleted = false;
    this.countries = [];
  }
}
