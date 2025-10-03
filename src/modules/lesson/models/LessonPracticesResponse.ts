import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LessonPracticeBase {
  @ApiProperty()
  lessonpracticeid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  lessonpracticestatus: Boolean = true;
  @ApiProperty()
  lessonpracticeorder: number = -1;
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  lessondescription: string = '';
  @ApiProperty()
  lessonpracticename: string = "";
  @ApiProperty()
  lessonpracticedescription: string = "";
  @ApiProperty()
  points: number = 10;
}

export class LessonPracticesResponse extends IResponse<Array<LessonPracticeBase>> {
  @ApiProperty({ type: LessonPracticeBase })
  data?: Array<LessonPracticeBase>;

  constructor() {
    super();
    this.data = [];
  }
}

export class LessonPracticeResponse extends IResponse<LessonPracticeBase> {
  @ApiProperty({ type: LessonPracticeBase })
  data?: LessonPracticeBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
