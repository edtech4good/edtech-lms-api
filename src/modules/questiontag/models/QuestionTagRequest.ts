import { ApiProperty } from '@nestjs/swagger';

export class QuestionTagRequest {
  @ApiProperty()
  questiontagname: string;
  
  constructor() {
    this.questiontagname = '';
  }
}
