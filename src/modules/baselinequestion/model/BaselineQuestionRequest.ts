import { ApiProperty } from "@nestjs/swagger";

export class baselinequestionRequest {
  @ApiProperty()
  curriculumbaselineid: string;
  @ApiProperty()
  questionid: string;
  @ApiProperty()
  baselinequestionorder: number;

  constructor(){
    this.curriculumbaselineid = '';
    this.questionid = '';
    this.baselinequestionorder = 1;
  }
}
export class baselinequestioncloneRequest {
  @ApiProperty()
  curriculumbaselineid: string;
  @ApiProperty()
  clonecurriculumbaselineid: string;

  constructor(){
    this.curriculumbaselineid = '';
    this.clonecurriculumbaselineid = '';
  }
}