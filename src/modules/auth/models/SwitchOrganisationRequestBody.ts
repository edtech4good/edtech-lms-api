import { ApiProperty } from '@nestjs/swagger';

export class SwitchOrganisationRequestBody {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '11111111-1111-4111-8111-111111111111',
    description: 'The organisation to act as, or null to return to all organisations.',
  })
  organisationid: string | null;

  constructor() {
    this.organisationid = null;
  }
}
