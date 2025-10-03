import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LessonQuizQuestionBase {
  @ApiProperty()
  lessonquizquestionid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  questionid: string = '';
  @ApiProperty()
  lessonquizquestionstatus: Boolean = true;
  @ApiProperty()
  lessonquizquestionorder: number = -1;
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  questionidentifier: string = "";
  @ApiProperty()
  lessonquizname: string = '';
}

export class LessonQuizQuestionsResponse extends IResponse<Array<LessonQuizQuestionBase>> {
  @ApiProperty({ type: LessonQuizQuestionBase })
  data?: Array<LessonQuizQuestionBase>;

  constructor() {
    super();
    this.data = [];
  }
}

export class LessonQuizQuestionResponse extends IResponse<LessonQuizQuestionBase> {
  @ApiProperty({ type: LessonQuizQuestionBase })
  data?: LessonQuizQuestionBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
