import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from '../../../models/IResponse';

export class RegisterResponse extends IResponse<Boolean> {
  @ApiProperty({ type: Boolean })
  data: Boolean;

  constructor() {
    super();
    this.data = false;
  }
}
