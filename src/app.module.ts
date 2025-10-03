import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PassportModule } from "@nestjs/passport";
import { MulterModule } from "@nestjs/platform-express";
import { MorganInterceptor, MorganModule } from "nest-morgan";
import { AppController } from "./app.controller";
import { Config } from "./config";
import { AuthModule } from "./modules/auth/auth.module";
import { CommonControllerModule } from "./modules/common";
import { CurriculumModule } from "./modules/curriculum";
import { CurriculumBaseLineModule } from "./modules/curriculumbaseline/curriculumbaseline.module";
import { DocumentModule } from "./modules/document";
import { DocumentTagModule } from "./modules/documenttag";
import { ExportModule } from "./modules/export/export.module";
import { GradeModule } from "./modules/grade";
import { ImportModule } from "./modules/import/import.module";
import { LessonModule } from "./modules/lesson";
import { LevelModule } from "./modules/level";
import { LogModule } from "./modules/log";
import { QuestionModule } from "./modules/question";
import { QuestionTagModule } from "./modules/questiontag";
import { SchoolModule } from "./modules/school";
import { StandardModule } from "./modules/standard";
import { StudentModule } from "./modules/students/student.module";
import { SyncModule } from "./modules/sync";
import { TeacherModule } from "./modules/teachers/teacher.module";
import {
  JwtAccessStrategy,
  JwtChangePasswordStrategy,
  JwtRefreshStrategy,
  JwtRPIAccessStrategy,
  JwtVerifyEmailStrategy,
} from "./services/auth.strategy";
import { RolePermModule } from "./modules/role-permission";
import { CountryModule } from './modules/country/country.module';
import { UserModule } from "./modules/user";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { ReportModule } from "./modules/report/report.module";
import { SchoolContributeController } from './modules/school-contribute/school-contribute.controller';
import { SchoolContributeModule } from './modules/school-contribute/school-contribute.module';
import { BaselinequestionModule } from './modules/baselinequestion/baselinequestion.module';
import { SubjectModule } from "./modules/subject/subject.module";

const providers = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temp: Array<any> = [
    PassportModule,
    JwtAccessStrategy,
    JwtRPIAccessStrategy,
    JwtRefreshStrategy,
    JwtChangePasswordStrategy,
    JwtVerifyEmailStrategy,
  ];
  if (Config.fortyk.api.debug === true) {
    temp.push({
      provide: APP_INTERCEPTOR,
      useClass: MorganInterceptor("combined"),
    });
  }

  return temp;
};
@Module({
  imports: [
    MorganModule,
    AuthModule,
    SubjectModule,
    CurriculumModule,
    DocumentTagModule,
    QuestionTagModule,
    DocumentModule,
    MulterModule,
    CommonControllerModule,
    QuestionModule,
    GradeModule,
    LevelModule,
    LessonModule,
    LogModule,
    SchoolModule,
    SyncModule,
    ExportModule,
    ImportModule,
    StudentModule,
    StandardModule,
    TeacherModule,
    CurriculumBaseLineModule,
    RolePermModule,
    CountryModule,
    UserModule,
    FeedbackModule,
    ReportModule,
    SchoolContributeModule,
    BaselinequestionModule,
  ],

  controllers: [AppController, SchoolContributeController],
  providers: [...providers()],
})
export class AppModule {}
