import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LessonLearningDocumentBase {
  @ApiProperty()
  documentid: string = '';
  @ApiProperty()
  role: string = '';
  @ApiProperty()
  order: number = 0;
  @ApiProperty()
  documentname: string = '';
  @ApiProperty()
  documenttypeid: number = 0;
}

export class LessonLearningBase {
  @ApiProperty()
  lessonlearningid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty({ nullable: true })
  documentid: string | null = '';
  @ApiProperty()
  lessonlearningstatus: Boolean = true;
  @ApiProperty()
  lessonlearningorder: number = -1;
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  lessondescription: string = '';
  @ApiProperty({ nullable: true })
  documentname: string | null = "";
  @ApiProperty()
  lessonlearningname: string = "";
  @ApiProperty()
  lessonlearningdescription: string = "";
  @ApiProperty({ nullable: true })
  documenttypeid: number | null = 0;
  @ApiProperty({ example: 'video' })
  lessonlearningtype: string = 'video';
  @ApiProperty({ nullable: true })
  lessonlearningbody: object | null = null;
  @ApiProperty({ type: [LessonLearningDocumentBase] })
  documents: LessonLearningDocumentBase[] = [];
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
