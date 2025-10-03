import { ApiProperty } from '@nestjs/swagger';

export class CurriculumRequest {
  @ApiProperty()
  curriculumname: string = '';
  @ApiProperty()
  subjectid: string = '';
  @ApiProperty()
  curriculumdescription: string = '';
  @ApiProperty()
  curriculumstatus: boolean = false;
  @ApiProperty()
  countryid: [] = [];
}
