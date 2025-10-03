import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LessonQuizBase {
  @ApiProperty()
  lessonquizid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  lessonquizstatus: Boolean = true;
  @ApiProperty()
  lessonquizorder: number = -1;
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  lessondescription: string = '';
  @ApiProperty()
  lessonquizname: string = "";
  @ApiProperty()
  lessonquizdescription: string = "";
  @ApiProperty()
  points: number = 10;
}

export class LessonQuizsResponse extends IResponse<Array<LessonQuizBase>> {
  @ApiProperty({ type: LessonQuizBase })
  data?: Array<LessonQuizBase>;

  constructor() {
    super();
    this.data = [];
  }
}

export class LessonQuizResponse extends IResponse<LessonQuizBase> {
  @ApiProperty({ type: LessonQuizBase })
  data?: LessonQuizBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
