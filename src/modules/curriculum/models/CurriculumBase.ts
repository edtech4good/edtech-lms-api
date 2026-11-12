import { ApiExtraModels, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';

export class CurriculumBase {
  @ApiProperty()
  curriculumname: string = '';
  @ApiProperty()
  curriculumdescription?: string = '';
  @ApiProperty()
  curriculumstatus: boolean = true;
  @ApiProperty()
  curriculumid: string = '';
  @ApiProperty()
  isdeleted: boolean = false;
  @ApiProperty()
  countryid?: [string];
  @ApiPropertyOptional({ enum: ['none', 'award', 'certificate'] })
  levelrecognition?: string;
  @ApiPropertyOptional({ enum: ['none', 'certificate'] })
  graderecognition?: string;
  @ApiPropertyOptional({ enum: ['none', 'certificate'] })
  curriculumrecognition?: string;
}


@ApiExtraModels(CurriculumBase)
export class CurriculumCreateResponse extends IResponse<CurriculumBase> {
  @ApiProperty({ type: () => CurriculumBase })
  data?: CurriculumBase;
  constructor() {
    super();
    this.data = undefined;
  }
}

@ApiExtraModels(CurriculumBase)
export class CurriculumCountryResponse extends IResponse<Array<CurriculumBase>> {
  @ApiProperty({ type: () => CurriculumBase })
  data?: Array<CurriculumBase>;
  constructor() {
    super();
    this.data = undefined;
  }
}
