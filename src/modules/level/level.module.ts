import { Module } from '@nestjs/common';
import { LevelController } from './level.controller';
import { LevelQuizQuestionController } from './level.quiz.questions.controller';
@Module({
  controllers: [LevelQuizQuestionController, LevelController],
})
export class LevelModule { }
