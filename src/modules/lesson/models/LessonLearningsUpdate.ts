import { ApiProperty } from '@nestjs/swagger';

export class LessonLearningsUpdate {
  @ApiProperty()
  documentid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  lessonlearningname: string = "";
  @ApiProperty()
  lessonlearningdescription: string = "";
}