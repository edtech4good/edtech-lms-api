import { Module } from '@nestjs/common';
import { QuestionTagController } from './questiontag.controller';
@Module({
  controllers: [QuestionTagController],
})
export class QuestionTagModule { }
