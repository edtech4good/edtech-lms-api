import { ApiProperty } from '@nestjs/swagger';

export class LessonPracticesUpdate {
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  lessonpracticename: string = "";
  @ApiProperty()
  lessonpracticedescription: string = "";
  @ApiProperty()
  points: number = 10;
}