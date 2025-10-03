import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class TemplateTypeDropDown {
  @ApiProperty()
  templatename: string = '';
  @ApiProperty()
  oldtemplatename: string = '';
  @ApiProperty()
  templateinstructions: string = '';
  @ApiProperty()
  templateid: number = 0;
}

export class TemplateTypeDropDownResponse extends IResponse<Array<TemplateTypeDropDown>> {

  @ApiProperty({ type: () => [TemplateTypeDropDown] })
  data: Array<TemplateTypeDropDown>;

  constructor() {
    super();
    this.data = [];
  }
}

