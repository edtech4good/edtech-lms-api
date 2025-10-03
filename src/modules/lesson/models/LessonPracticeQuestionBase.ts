import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LessonPracticeQuestionBase {
  @ApiProperty()
  lessonpracticequestionid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  questionid: string = '';
  @ApiProperty()
  lessonpracticequestionstatus: Boolean = true;
  @ApiProperty()
  lessonpracticequestionorder: number = -1;
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  questionidentifier: string = "";
  @ApiProperty()
  lessonpracticename: string = '';
}

export class LessonPracticeQuestionsResponse extends IResponse<Array<LessonPracticeQuestionBase>> {
  @ApiProperty({ type: LessonPracticeQuestionBase })
  data?: Array<LessonPracticeQuestionBase>;

  constructor() {
    super();
    this.data = [];
  }
}

export class LessonPracticeQuestionResponse extends IResponse<LessonPracticeQuestionBase> {
  @ApiProperty({ type: LessonPracticeQuestionBase })
  data?: LessonPracticeQuestionBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
