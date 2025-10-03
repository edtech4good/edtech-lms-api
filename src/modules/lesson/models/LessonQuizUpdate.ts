import { ApiProperty } from '@nestjs/swagger';

export class LessonQuizsUpdate {
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  lessonquizname: string = "";
  @ApiProperty()
  lessonquizdescription: string = "";
}