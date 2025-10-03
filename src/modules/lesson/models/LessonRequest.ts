import { ApiProperty } from '@nestjs/swagger';

export class LessonRequest {
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  lessondescription: string = '';
  @ApiProperty()
  lessonstatus: boolean = false;
  @ApiProperty()
  levelid: string = "";
  @ApiProperty()
  lessonorder: number = -1;
  @ApiProperty()
  total_points: number = 100;
  @ApiProperty()
  passing_points: number = 80;
}
