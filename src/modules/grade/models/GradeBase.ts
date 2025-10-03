import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class GradeBase {
  @ApiProperty()
  gradename: string = '';
  @ApiProperty()
  gradedescription?: string = '';
  @ApiProperty()
  gradestatus: Boolean = true;
  @ApiProperty()
  gradeid: string = '';
  @ApiProperty()
  isdeleted: Boolean = false;
  @ApiProperty()
  gradeorder: number = -1;
  @ApiProperty()
  curriculumid: string = "";
  @ApiProperty()
  passing_points: number = 8;
  @ApiProperty()
  points: number = 10;
}

export class GradeCreateResponse extends IResponse<GradeBase> {
  @ApiProperty({ type: GradeBase })
  data?: GradeBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
