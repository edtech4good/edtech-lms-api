import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LessonPlanBase {
  @ApiProperty()
  lessonplanid: string = '';
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  documentid: string = '';
  @ApiProperty()
  lessonplanstatus: Boolean = true;
  @ApiProperty()
  lessonplanorder: number = -1;
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  lessondescription: string = '';
  @ApiProperty()
  documentname: string = "";
  @ApiProperty()
  lessonplanname: string = "";
  @ApiProperty()
  lessonplandescription: string = "";
  @ApiProperty()
  documenttypeid: number = 0;
}

export class LessonPlansResponse extends IResponse<Array<LessonPlanBase>> {
  @ApiProperty({ type: LessonPlanBase })
  data?: Array<LessonPlanBase>;

  constructor() {
    super();
    this.data = [];
  }
}

export class LessonPlanResponse extends IResponse<LessonPlanBase> {
  @ApiProperty({ type: LessonPlanBase })
  data?: LessonPlanBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
