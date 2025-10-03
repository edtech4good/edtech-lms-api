import { ApiProperty } from '@nestjs/swagger';

export class LevelRequest {
  @ApiProperty()
  levelname: string = '';
  @ApiProperty()
  leveldescription: string = '';
  @ApiProperty()
  levelstatus: boolean = false;
  @ApiProperty()
  gradeid: string = "";
  @ApiProperty()
  levelorder: number = -1;
  @ApiProperty()
  quiz_points: number = 10;
  @ApiProperty()
  passing_points: number = 8;
}

export class LevelQuizSetLesson {
  @ApiProperty()
  lessonid: string = '';
}
