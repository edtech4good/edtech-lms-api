import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
@Module({
  controllers: [DocumentController],
})
export class DocumentModule { }
