import { ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { GradeBase } from './GradeBase';

export class GradeAllBase extends GradeBase {
  @ApiProperty()
  curriculumname: string = "";

  @ApiProperty({ nullable: true, description: "The organisation that owns the row; null when it has no owner yet. Listed so the platform view can name it." })
  organisationid?: string | null;
}

export class GradeGetAllResponse extends IResponse<IPagingResult<GradeAllBase>> {
  @ApiProperty()
  data: IPagingResult<GradeAllBase> | undefined;
  constructor() {
    super();
  }
}

export class GradeGetResponse extends IResponse<GradeAllBase> {
  @ApiProperty()
  data: GradeAllBase | undefined;
  constructor() {
    super();
  }
}

export class GradeGetAllByCurriculumResponse extends IResponse<Array<GradeAllBase>> {
  @ApiProperty()
  data: Array<GradeAllBase> | undefined;
  constructor() {
    super();
  }
}