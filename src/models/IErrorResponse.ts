import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from './IResponse';
import { ErrorCode } from './enums/errorcode.enum';

export class IErrorFieldResponse {
  @ApiProperty()
  field!: string;

  @ApiProperty()
  message!: string;
}

/**
 * The cross-repo error envelope (docs/api-errors.md). `error`, `data` and
 * `errormessage` are the pre-existing fields every throw site and client
 * interceptor already reads; `code`, `hint`, `reference` and `fields` are
 * new. `stack`/`logid` stay debug-mode-only, as before.
 */
export class IErrorResponse extends IResponse<Boolean> {
  @ApiProperty({ type: Boolean })
  data?: Boolean = false;

  @ApiProperty({ enum: ErrorCode })
  code!: ErrorCode;

  @ApiProperty()
  hint?: string;

  @ApiProperty()
  reference!: string;

  @ApiProperty({ type: [IErrorFieldResponse] })
  fields?: IErrorFieldResponse[];

  @ApiProperty()
  stack?: string;
}
