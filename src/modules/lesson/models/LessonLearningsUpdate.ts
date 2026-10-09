import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonLearningDocumentLink } from './LessonLearningsCreate';

export class LessonLearningsUpdate {
  @ApiPropertyOptional({ nullable: true, description: "The item's primary document; left as it is when absent." })
  documentid?: string | null;
  @ApiProperty()
  lessonid: string = '';
  @ApiProperty()
  lessonlearningname: string = "";
  @ApiProperty()
  lessonlearningdescription: string = "";
  @ApiPropertyOptional({ description: 'The item type; left as it is when absent.' })
  lessonlearningtype?: string;
  @ApiPropertyOptional({ nullable: true, description: "The type's own body; left as it is when absent." })
  lessonlearningbody?: object | null;
  @ApiPropertyOptional({ type: [LessonLearningDocumentLink] })
  documents?: LessonLearningDocumentLink[];
}
