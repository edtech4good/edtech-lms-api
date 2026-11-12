import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiPropertyOptional({ enum: ['none', 'award', 'certificate'] })
  levelrecognition?: 'none' | 'award' | 'certificate';
  @ApiPropertyOptional({ enum: ['none', 'certificate'] })
  graderecognition?: 'none' | 'certificate';
  @ApiPropertyOptional({ enum: ['none', 'certificate'] })
  curriculumrecognition?: 'none' | 'certificate';
}
