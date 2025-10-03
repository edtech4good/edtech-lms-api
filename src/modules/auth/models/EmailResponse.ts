import { ApiProperty } from '@nestjs/swagger';
import { string } from 'joi';
import { IResponse } from '../../../models/IResponse';

export class EmailResponse extends IResponse<any> {
  @ApiProperty({ type: string })
  data: string;

  constructor() {
    super();
    this.data = '';
  }
}
