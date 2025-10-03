import { Module } from '@nestjs/common';
import { SubjectController } from './subject.controller';
@Module({
  controllers: [SubjectController],
})
export class SubjectModule { }
