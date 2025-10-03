import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { SchoolBase } from './SchoolBase';

export class SchoolAllBase {
  @ApiProperty()
  schooltype: string = "";
  @ApiProperty()
  schoolname: string = "";
  @ApiProperty()
  countryid: string = "";
  @ApiProperty()
  city: string = "";
  @ApiProperty()
  state: string = "";
  @ApiProperty()
  country: string = "";
}

@ApiExtraModels(SchoolAllBase)
export class SchoolGetAllResponse extends IResponse<Array<SchoolAllBase>> {
  @ApiProperty({ type: [SchoolAllBase] })
  data: Array<SchoolAllBase> | undefined;
  constructor() {
    super();
  }
}

@ApiExtraModels(SchoolBase)
export class SchoolGetAllByCountry extends IResponse<Array<SchoolBase>> {
  @ApiProperty({ type: [SchoolBase] })
  data: Array<SchoolBase> | undefined;
  constructor() {
    super();
  }
}

@ApiExtraModels(SchoolBase)
export class SchoolGetAllByCurriculum extends IResponse<Array<SchoolBase>> {
  @ApiProperty({ type: [SchoolBase] })
  data: Array<SchoolBase> | undefined;
  constructor() {
    super();
  }
}
