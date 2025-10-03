import { ApiProperty } from '@nestjs/swagger';

export class LessonQuizCreate {
  @ApiProperty()
  lessonquizorder: number = -1;
  @ApiProperty()
  points: number = 10;
  @ApiProperty()
  lessonquizname: string = "";
  @ApiProperty()
  lessonquizdescription: string = "";
}