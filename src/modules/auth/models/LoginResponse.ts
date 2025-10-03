import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { IResponse } from '../../../models/IResponse';

export class LoginTokens {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  refreshToken: string;

  constructor() {
    this.accessToken = "";
    this.refreshToken = "";
  }
}

@ApiExtraModels(LoginTokens)
export class LoginResponseModel extends IResponse<LoginTokens> {
  @ApiProperty({ type: () => LoginTokens })
  data: LoginTokens;

  constructor() {
    super();
    this.data = new LoginTokens();
  }
}
