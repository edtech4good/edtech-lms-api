import { ApiProperty } from "@nestjs/swagger";

export class CurriculumBaseLineRequest {
  @ApiProperty()
  curriculumid: string = "";
  @ApiProperty()
  baselineid: string = "";
  @ApiProperty()
  baselinename: string = "";
  @ApiProperty()
  baselinetype: number = 0;
  @ApiProperty()
  startdate: Date = new Date();
  @ApiProperty()
  enddate: Date = new Date();
  @ApiProperty()
  schoolid: Array<string> = [];
}