import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { IPagingResult } from 'src/models/IPagingResult';
import { IResponse } from 'src/models/IResponse';
import { CurriculumBase } from './CurriculumBase';

@ApiExtraModels(IResponse, IPagingResult, CurriculumBase)
export class CurriculumGetAllResponse extends IResponse<IPagingResult<CurriculumBase>> {
  @ApiProperty({ type: () => new IPagingResult<CurriculumBase>() })
  data?: IPagingResult<CurriculumBase>;
  constructor() {
    super();
  }
}


/*
{
  pageIndex: number;
  pageSize: number;
  sort: Array<{ key: string; value: 'ascend' | 'descend' | null }>;
  filter: Array<{ key: string; value: any | any[] }>;
}
*/