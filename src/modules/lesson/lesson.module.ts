import { Module } from "@nestjs/common";
import { LessonController } from "./lesson.controller";
import { LessonLearningController } from "./lesson.learning.controller";
import { LessonPracticeController } from "./lesson.practice.controller";
import { LessonPracticeQuestionController } from "./lesson.practice.questions.controller";
import { LessonQuizController } from "./lesson.quiz.controller";
import { LessonQuizQuestionController } from "./lesson.quiz.questions.controller";
import { LessonPlanController } from "./lesson.plan.controller";
@Module({
  controllers: [
    LessonController,
    LessonLearningController,
    LessonPracticeQuestionController,
    LessonPracticeController,
    LessonQuizQuestionController,
    LessonQuizController,
    LessonPlanController,
  ],
})
export class LessonModule {}
