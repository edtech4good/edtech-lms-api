import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class SubjectBase {
  @ApiProperty()
  subjectname: string;
  @ApiProperty()
  subjectdescription?: string;
  @ApiProperty()
  subjectid: string;
  @ApiProperty()
  isdeleted: Boolean;

  constructor() {
    this.subjectname = '';
    this.subjectdescription = '';
    this.subjectid = '';
    this.isdeleted = true;
  }
}


export class SubjectCreateResponse extends IResponse<SubjectBase> {

  @ApiProperty()
  data?: SubjectBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
