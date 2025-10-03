import { Module } from '@nestjs/common';
import { DocumentTagController } from './documenttag.controller';
@Module({
  controllers: [DocumentTagController],
})
export class DocumentTagModule { }
