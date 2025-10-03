import { ApiProperty } from '@nestjs/swagger';

export class LessonPlansCreate {
  @ApiProperty()
  documentid: string = '';
  @ApiProperty()
  lessonplanorder: number = -1;
  @ApiProperty()
  lessonplanname: string = "";
  @ApiProperty()
  lessonplandescription: string = "";
}