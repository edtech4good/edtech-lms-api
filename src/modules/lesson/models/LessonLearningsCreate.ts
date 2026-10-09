import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LessonLearningDocumentLink {
  @ApiProperty()
  documentid: string = '';
  @ApiProperty({ enum: ['rendition', 'asset'] })
  role: string = 'asset';
  @ApiPropertyOptional()
  order?: number;
}

export class LessonLearningsCreate {
  @ApiPropertyOptional({ nullable: true, description: "The item's primary document; required for a video item." })
  documentid?: string | null;
  @ApiProperty()
  lessonlearningorder: number = -1;
  @ApiProperty()
  lessonlearningname: string = "";
  @ApiProperty()
  lessonlearningdescription: string = "";
  @ApiPropertyOptional({ default: 'video', description: 'The item type; phase 0 knows only video.' })
  lessonlearningtype?: string;
  @ApiPropertyOptional({ nullable: true, description: "The type's own body; null for a video item." })
  lessonlearningbody?: object | null;
  @ApiPropertyOptional({ type: [LessonLearningDocumentLink], description: 'Further documents the item references; none for a video item.' })
  documents?: LessonLearningDocumentLink[];
}
