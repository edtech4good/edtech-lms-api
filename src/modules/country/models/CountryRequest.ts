import { ApiProperty } from '@nestjs/swagger';

export class CountryRequest {
  @ApiProperty()
  countryname: string;
  
  @ApiProperty()
  expectedusage: number;
  
  constructor() {
    this.countryname = '';
    this.expectedusage = 0;
  }
}
