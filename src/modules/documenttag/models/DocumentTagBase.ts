import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class DocumentTagBase {
  @ApiProperty()
  documenttagname: string;
  @ApiProperty()
  documenttagid: string;
  @ApiProperty()
  isdeleted: Boolean;

  constructor() {
    this.documenttagname = '';
    this.documenttagid = '';
    this.isdeleted = true;
  }
}


export class DocumentTagCreateResponse extends IResponse<DocumentTagBase> {

  @ApiProperty()
  data?: DocumentTagBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
