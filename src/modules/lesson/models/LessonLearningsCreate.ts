import { ApiProperty } from '@nestjs/swagger';

export class LessonLearningsCreate {
  @ApiProperty()
  documentid: string = '';
  @ApiProperty()
  lessonlearningorder: number = -1;
  @ApiProperty()
  lessonlearningname: string = "";
  @ApiProperty()
  lessonlearningdescription: string = "";
}