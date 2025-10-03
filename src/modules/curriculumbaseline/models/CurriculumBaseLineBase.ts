import { ApiProperty } from "@nestjs/swagger";
import { IResponse } from "src/models/IResponse";

export class CurriculumBaseLineBase {
  @ApiProperty()
  curriculumid: string = "";
  @ApiProperty()
  baselinename: string = "";
  @ApiProperty()
  baselineid: string = "";
  @ApiProperty()
  baselinetype: number = 0;
  // @ApiProperty()
  // baselinestatus: boolean = false;
  @ApiProperty()
  startdate: Date = new Date();
  @ApiProperty()
  enddate: Date = new Date();
  @ApiProperty()
  schoolid: Array<string> = [];
  @ApiProperty()
  isdeleted?: boolean = false;
}

export class CurriculumBaseLineGetBase extends CurriculumBaseLineBase {
  @ApiProperty()
  curriculumname: string = "";

  @ApiProperty()
  curriculumbaselinename: string = "";
}

export class CurriculumBaseLineCreateResponse extends IResponse<CurriculumBaseLineBase> {
  @ApiProperty({ type: CurriculumBaseLineBase })
  data?: CurriculumBaseLineBase;

  constructor() {
    super();
    this.data = undefined;
  }
}

export class CurriculumBaseLineGetResponse extends IResponse<
  Array<CurriculumBaseLineGetBase>
> {
  @ApiProperty({ type: [CurriculumBaseLineGetBase] })
  data?: Array<CurriculumBaseLineGetBase>;

  constructor() {
    super();
    this.data = [];
  }
}

export class GetCurriculumBaseLine extends CurriculumBaseLineBase {
  @ApiProperty()
  curriculumbaselineid: string = "";
}