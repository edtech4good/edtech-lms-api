import { ApiProperty } from '@nestjs/swagger';
import { boolean } from 'joi';
import { IResponse } from '../../../models/IResponse';

export class EmailverficationResponse extends IResponse<any> {
  @ApiProperty({ type: boolean })
  data: boolean;

  constructor() {
    super();
    this.data = false;
  }
}
