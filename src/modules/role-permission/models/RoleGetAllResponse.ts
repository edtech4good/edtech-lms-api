import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';

export class RoleAllBase {
  @ApiProperty()
  roleid: string = "";
  @ApiProperty()
  rolename: string = "";
}

@ApiExtraModels(RoleAllBase)
export class RoleGetAllResponse extends IResponse<IPagingResult<RoleAllBase>> {
  @ApiProperty({ type: [RoleAllBase] })
  data: IPagingResult<RoleAllBase> | undefined;
  constructor() {
    super();
  }
}
