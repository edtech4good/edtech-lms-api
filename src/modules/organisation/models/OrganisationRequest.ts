import { ApiProperty } from "@nestjs/swagger";

export class OrganisationBrandingRequest {
  @ApiProperty({ required: false, description: "https URL, no user info, at most 2048 characters. Never fetched by the server." })
  logourl?: string;
  @ApiProperty({ required: false })
  displayname?: string;
  @ApiProperty({ required: false, description: "Hex colour such as #1A2B3C." })
  tilecolour?: string;
}

export class OrganisationCreateRequest {
  @ApiProperty({ description: "Up to 250 characters. Unique among organisations that are not deleted, ignoring case." })
  organisationname: string;
  @ApiProperty({ description: "2-16 lowercase letters and digits. Unique forever, deleted organisations included. Cannot be changed." })
  organisationcode: string;
  @ApiProperty({ description: "1 to 3 visible letters (grapheme clusters), up to 12 code points: letters and combining marks, such as Khmer vowel signs and subscripts. Used as tile initials." })
  organisationshortname: string;
  @ApiProperty({ enum: ["company", "schoolnetwork"], description: "Cannot be changed." })
  organisationpreset: string;
  @ApiProperty({ required: false, enum: ["kids", "corporate"], description: "Defaults to kids." })
  uitheme?: string;
  @ApiProperty({ required: false, nullable: true, type: OrganisationBrandingRequest })
  brandingconfig?: OrganisationBrandingRequest | null;
  @ApiProperty({ type: [String], description: "At least one country, each only once." })
  countryids: string[];

  constructor() {
    this.organisationname = "";
    this.organisationcode = "";
    this.organisationshortname = "";
    this.organisationpreset = "company";
    this.countryids = [];
  }
}

export class OrganisationUpdateRequest {
  @ApiProperty()
  organisationname: string;
  @ApiProperty({ description: "1 to 3 visible letters (grapheme clusters), up to 12 code points: letters and combining marks, such as Khmer vowel signs and subscripts. Used as tile initials." })
  organisationshortname: string;
  @ApiProperty({ required: false, enum: ["kids", "corporate"], description: "Left unchanged when omitted." })
  uitheme?: string;
  @ApiProperty({ required: false, nullable: true, type: OrganisationBrandingRequest, description: "Left unchanged when omitted; null clears it." })
  brandingconfig?: OrganisationBrandingRequest | null;
  @ApiProperty({ required: false, description: "false suspends the organisation. Left unchanged when omitted." })
  organisationstatus?: boolean;
  @ApiProperty({ type: [String], description: "The complete set of linked countries: it replaces the current set." })
  countryids: string[];
  @ApiProperty({ required: false, description: "Cannot be changed: accepted only if it equals the stored value." })
  organisationcode?: string;
  @ApiProperty({ required: false, description: "Cannot be changed: accepted only if it equals the stored value." })
  organisationpreset?: string;

  constructor() {
    this.organisationname = "";
    this.organisationshortname = "";
    this.countryids = [];
  }
}
