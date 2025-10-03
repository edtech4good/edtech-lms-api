import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class LevelBase {
  @ApiProperty()
  levelname: string = '';
  @ApiProperty()
  leveldescription?: string = '';
  @ApiProperty()
  levelstatus: Boolean = true;
  @ApiProperty()
  levelid: string = '';
  @ApiProperty()
  isdeleted: Boolean = false;
  @ApiProperty()
  levelorder: number = -1;
  @ApiProperty()
  gradeid: string = "";
  @ApiProperty()
  quiz_points: number = 10;
  @ApiProperty()
  passing_points: number = 8;
}

export class LevelCreateResponse extends IResponse<LevelBase> {
  @ApiProperty({ type: LevelBase })
  data?: LevelBase;

  constructor() {
    super();
    this.data = undefined;
  }
}
