import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";

export class TeacherImport {
  @ApiProperty()
  schoolusername: string = "";
  @ApiProperty()
  schooluserpasswordhash: string = "";
}

@ApiExtraModels(TeacherImport)
export class TeacherImportBody {
  @ApiProperty()
  schoolname: string = "";
  @ApiProperty({ type: [TeacherImport] })
  teachers: Array<TeacherImport> = [];
}
