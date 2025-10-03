import { ApiProperty } from '@nestjs/swagger';

export class GradeRequest {
  @ApiProperty()
  gradename: string = '';
  @ApiProperty()
  gradedescription: string = '';
  @ApiProperty()
  gradestatus: boolean = false;
  @ApiProperty()
  curriculumid: string = "";
  @ApiProperty()
  gradeorder: number = -1;
  @ApiProperty()
  passing_points: number = 10;
}
