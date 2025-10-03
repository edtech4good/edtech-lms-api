import { Module } from "@nestjs/common";
import { CurriculumBaseLineController } from "./curriculumbaseline.controller";
@Module({
  controllers: [CurriculumBaseLineController],
})
export class CurriculumBaseLineModule {}
