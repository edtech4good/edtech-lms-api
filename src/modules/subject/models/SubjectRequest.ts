import { ApiProperty } from '@nestjs/swagger';

export class SubjectRequest {
  @ApiProperty()
  subjectname: string;
  subjectdescription: string;
  
  constructor() {
    this.subjectname = '';
    this.subjectdescription = '';
  }
}
