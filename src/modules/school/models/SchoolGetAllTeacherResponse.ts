import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class SchoolGetAllTeacher {
  @ApiProperty()
  schooluserid: string = "";
  @ApiProperty()
  schoolusername: string = "";
  @ApiProperty()
  schooluserpasswordhash: string = "";
  @ApiProperty()
  schooluserrole: number = -1;
  @ApiProperty()
  schooluserstatus: boolean = false;
  @ApiProperty()
  schoolname: string = "";
  @ApiProperty()
  isdisabled: boolean = true;
}

@ApiExtraModels(SchoolGetAllTeacher)
export class SchoolGetAllTeacherResponse extends IResponse<Array<SchoolGetAllTeacher>> {
  @ApiProperty({ type: [SchoolGetAllTeacher] })
  data: Array<SchoolGetAllTeacher> | undefined;
  constructor() {
    super();
  }
}
