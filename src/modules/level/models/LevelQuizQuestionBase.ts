import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LevelQuizQuestionBase {
  @ApiProperty()
  levelquizquestionid: string = '';
  @ApiProperty()
  levelid: string = '';
  @ApiProperty()
  questionid: string = '';
  @ApiProperty()
  levelquizquestionstatus: Boolean = true;
  @ApiProperty()
  levelquizquestionorder: number = -1;
  @ApiProperty()
  levelname: string = '';
  @ApiProperty()
  leveldescription: string = '';
  @ApiProperty()
  questionidentifier: string = "";
  @ApiProperty()
  lesson: any = {};
}

export class LevelQuizQuestionsResponse extends IResponse<Array<LevelQuizQuestionBase>> {
  @ApiProperty({ type: LevelQuizQuestionBase })
  data?: Array<LevelQuizQuestionBase>;

  constructor() {
    super();
    this.data = [];
  }
}

export class LevelQuizQuestionResponse extends IResponse<LevelQuizQuestionBase> {
  @ApiProperty({ type: LevelQuizQuestionBase })
  data?: LevelQuizQuestionBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
