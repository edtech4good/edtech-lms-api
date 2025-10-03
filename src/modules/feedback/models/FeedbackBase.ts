import { ApiProperty } from '@nestjs/swagger';

export class FeedbackBase {
  @ApiProperty()
  teachername: string;
  @ApiProperty()
  schoolname: string;
  @ApiProperty()
  curriculumname: string;

  constructor() {
    this.teachername = '';
    this.schoolname = '';
    this.curriculumname = '';
  }
}

export interface FeedbackDataContent {
  feedback: string;
  selected_error: Array<number>;
  images: Array<string>;
}

export interface FeedbackData {
  rpi: FeedbackDataContent;
  router: FeedbackDataContent;
  tablet: FeedbackDataContent;
  content: FeedbackDataContent;
  app: FeedbackDataContent;
  general: FeedbackDataContent;

  [key: string]: FeedbackDataContent;
}

export interface TechDowntimeNumbers {
  rpi: number;
  router: number;
  tablet: number;
  content: number;
  app: number;
  general: number;
}
