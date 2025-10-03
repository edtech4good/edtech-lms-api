import { ApiProperty } from '@nestjs/swagger';
import { IResponse } from 'src/models/IResponse';
import { Question } from 'src/models/question.model';

export class QuestionRequestResponse extends IResponse<Question> {
    @ApiProperty({ type: Question })
    data: Question | undefined;

    constructor() {
        super();
    }
}
