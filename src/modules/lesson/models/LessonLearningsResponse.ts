import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LessonLearningBase {
  @ApiProperty()
  lessonlearningid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  documentid: string = '';
  @ApiProperty()
  lessonlearningstatus: Boolean = true;
  @ApiProperty()
  lessonlearningorder: number = -1;
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  lessondescription: string = '';
  @ApiProperty()
  documentname: string = "";
  @ApiProperty()
  lessonlearningname: string = "";
  @ApiProperty()
  lessonlearningdescription: string = "";
  @ApiProperty()
  documenttypeid: number = 0;
}

export class LessonLearningsResponse extends IResponse<Array<LessonLearningBase>> {
  @ApiProperty({ type: LessonLearningBase })
  data?: Array<LessonLearningBase>;

  constructor() {
    super();
    this.data = [];
  }
}

export class LessonLearningResponse extends IResponse<LessonLearningBase> {
  @ApiProperty({ type: LessonLearningBase })
  data?: LessonLearningBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
