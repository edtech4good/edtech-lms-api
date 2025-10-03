import { Module } from '@nestjs/common';
import { StandardController } from './standard.controller';
@Module({
  controllers: [StandardController],
})
export class StandardModule { }
