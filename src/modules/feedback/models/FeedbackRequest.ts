import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";

export class ImageMeta {
  @ApiProperty()
  filename: string;
  @ApiProperty()
  content: string;
  constructor() {
    this.filename = '';
    this.content = '';
  }
}

@ApiExtraModels(ImageMeta)
export class FeedbackItem {
  @ApiProperty()
  feedback: string;

  @ApiProperty()
  selected_error: Array<number>;

  @ApiProperty({ type: () => [ImageMeta]})
  images: Array<ImageMeta>;

  constructor() {
    this.feedback = '';
    this.selected_error = [];
    this.images = [];
  }
}

@ApiExtraModels(FeedbackItem)
export class FeedbackRequest {
  @ApiProperty({ type: 'string' })
  teachername: string;
  @ApiProperty({ type: 'string' })
  curriculumid: string;
  @ApiProperty({ type: () => FeedbackItem })
  rpi: FeedbackItem;
  @ApiProperty({ type: () => FeedbackItem, required: false })
  router: FeedbackItem;
  @ApiProperty({ type: () => FeedbackItem, required: false })
  tablet: FeedbackItem;
  @ApiProperty({ type: () => FeedbackItem, required: false })
  content: FeedbackItem;
  @ApiProperty({ type: () => FeedbackItem, required: false })
  app: FeedbackItem;
  @ApiProperty({ type: () => FeedbackItem, required: false })
  general: FeedbackItem;

  [key: string]: FeedbackItem | string

  constructor() {
    this.teachername = '';
    this.curriculumid = '';
    this.rpi = new FeedbackItem();
    this.router = new FeedbackItem();
    this.tablet = new FeedbackItem();
    this.content = new FeedbackItem();
    this.app = new FeedbackItem();
    this.general = new FeedbackItem();
  }

  // constructor() {
  //   this.feedback = "";
  // }
}
