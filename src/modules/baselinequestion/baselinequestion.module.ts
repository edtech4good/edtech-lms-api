import { Module } from '@nestjs/common';
import { BaselinequestionController } from './baselinequestion.controller';

@Module({
  controllers: [BaselinequestionController]
})
export class BaselinequestionModule {}
