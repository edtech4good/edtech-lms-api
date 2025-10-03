import { ApiProperty } from '@nestjs/swagger';

export class LessonPlansUpdate {
  @ApiProperty()
  documentid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  lessonplanname: string = "";
  @ApiProperty()
  lessonplandescription: string = "";
}