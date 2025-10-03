import { ApiProperty } from '@nestjs/swagger';

export class CountryBase {
  @ApiProperty()
  countryname: string;
  @ApiProperty()
  countryid: string;
  @ApiProperty()
  isdeleted: Boolean;

  constructor() {
    this.countryname = '';
    this.countryid = '';
    this.isdeleted = true;
  }
}
