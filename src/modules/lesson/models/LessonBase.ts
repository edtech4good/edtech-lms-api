import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LessonBase {
  @ApiProperty()
  lessonname: string = '';
  @ApiProperty()
  lessondescription?: string = '';
  @ApiProperty()
  lessonstatus: Boolean = true;
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  isdeleted: Boolean = false;
  @ApiProperty()
  lessonorder: number = -1;
  @ApiProperty()
  total_points: number = 100;
  @ApiProperty()
  learning_points: number = 10;
  @ApiProperty()
  levelid: string = "";
  @ApiProperty()
  passing_points: number = 8;
}

export class LessonCreateResponse extends IResponse<LessonBase> {
  @ApiProperty({ type: LessonBase })
  data?: LessonBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
