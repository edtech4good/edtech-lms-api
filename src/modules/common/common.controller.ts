import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { TemplateType } from 'src/models/enums/templatetypes.enum';
import { TemplateTypeDropDown, TemplateTypeDropDownResponse } from './models/TemplateTypeDropDown';


@ApiTags('Common')
@Controller('dropdown')
//@ApiBearerAuth()
//@UseGuards(AccessGuard(TokenType.ACCESS))
@ApiExtraModels(TemplateTypeDropDownResponse)
export class CommonController {

  @Get('templatetype')
  @ApiResponse({
    status: 200,
    description: 'Template type',
    schema: { $ref: getSchemaPath(TemplateTypeDropDownResponse) },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while fetching Template type',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error',
  })
  @HttpCode(HttpStatus.OK)
  async getTemplateType(): Promise<TemplateTypeDropDownResponse> {
    return {
      error: false,
      data: Object.values(TemplateType).map(x => (<TemplateTypeDropDown>x))
    };
  }
}