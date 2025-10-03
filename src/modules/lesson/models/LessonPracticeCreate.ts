import { ApiProperty } from '@nestjs/swagger';

export class LessonPracticeCreate {
  @ApiProperty()
  lessonpracticeorder: number = -1;
  @ApiProperty()
  lessonpracticename: string = "";
  @ApiProperty()
  lessonpracticedescription: string = "";
  @ApiProperty()
  points: number = 10;
}