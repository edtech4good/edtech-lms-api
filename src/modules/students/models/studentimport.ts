import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";

export class StudentImport {
  @ApiProperty()
  studentfirstname: string = "";
  @ApiProperty()
  studentlastname: string = "";
  @ApiProperty()
  mothername: string = "";
  @ApiProperty()
  fathername: string = "";
  @ApiProperty()
  contact: string = "";
  @ApiProperty()
  dateofbirth: string = "";
  @ApiProperty()
  genderid: string = "0";
  @ApiProperty({ required: false, description: 'Washington Group Short Set, "1"-"4"; blank = not collected' })
  wg_seeing?: string = "";
  @ApiProperty({ required: false })
  wg_hearing?: string = "";
  @ApiProperty({ required: false })
  wg_walking?: string = "";
  @ApiProperty({ required: false })
  wg_remembering?: string = "";
  @ApiProperty({ required: false })
  wg_selfcare?: string = "";
  @ApiProperty({ required: false })
  wg_communicating?: string = "";
  @ApiProperty()
  schooltype: string = "";
  @ApiProperty()
  city: string = "";
  @ApiProperty()
  country: string = "";
  @ApiProperty()
  state: string = "";
  @ApiProperty()
  dateofjoin: string = "";
  @ApiProperty()
  schoolusername: string = "";
  @ApiProperty()
  schooluserpasswordhash: string = "";
  @ApiProperty()
  familyname?: string = "";
  @ApiProperty()
  type?: string = "online";
  @ApiProperty()
  is_teacher_acc?: string = '0';
}

@ApiExtraModels(StudentImport)
export class StudentImportBody {
  @ApiProperty()
  curriculumid: Array<string> = [];
  @ApiProperty()
  schoolid: string = "";
  @ApiProperty()
  standard: string = "";
  @ApiProperty({ type: [StudentImport] })
  students: Array<StudentImport> = [];
}

export class StudentImportFormat {
  @ApiProperty()
  studentid: string = '';
  @ApiProperty()
  schooluserid: string = '';
  @ApiProperty()
  studentfirstname: string = '';
  @ApiProperty()
  studentlastname: string = '';
  @ApiProperty()
  familyname: string = '';
  @ApiProperty()
  mothername: string = '';
  @ApiProperty()
  fathername: string = '';
  @ApiProperty()
  contact: string = '';
  @ApiProperty()
  dateofbirth: string = '';
  @ApiProperty()
  genderid: string = '';
  @ApiProperty({ required: false, description: 'Washington Group Short Set, "1"-"4"; blank = not collected' })
  wg_seeing?: string = '';
  @ApiProperty({ required: false })
  wg_hearing?: string = '';
  @ApiProperty({ required: false })
  wg_walking?: string = '';
  @ApiProperty({ required: false })
  wg_remembering?: string = '';
  @ApiProperty({ required: false })
  wg_selfcare?: string = '';
  @ApiProperty({ required: false })
  wg_communicating?: string = '';
  @ApiProperty()
  standard: string = '';
  @ApiProperty()
  schoolname: string = '';
  @ApiProperty()
  schooltype: string = '';
  @ApiProperty()
  city: string = '';
  @ApiProperty()
  country: string = '';
  @ApiProperty()
  state: string = '';
  @ApiProperty()
  dateofjoin: string = '';
  @ApiProperty()
  schoolusername: string = '';
  @ApiProperty()
  type: string = '';
  @ApiProperty()
  isactive: number = 0;
  @ApiProperty()
  schooluserpasswordhash: string = '';
  @ApiProperty()
  is_teacher_acc: string = '0';
  @ApiProperty()
  curriculums: string = '';
}

@ApiExtraModels(StudentImportFormat)
export class StudentEditedImportBody {
  @ApiProperty({ type: [StudentImportFormat] })
  students: Array<StudentImportFormat> = [];
}

export interface IStudentImportFormat {
  studentid: string,
  schooluserid: string;
  studentfirstname: string;
  studentlastname: string;
  familyname: string;
  mothername: string;
  fathername: string;
  contact: string;
  dateofbirth: string;
  genderid: string;
  wg_seeing?: string;
  wg_hearing?: string;
  wg_walking?: string;
  wg_remembering?: string;
  wg_selfcare?: string;
  wg_communicating?: string;
  standard: string;
  schoolname: string;
  schooltype: string;
  city: string;
  country: string;
  state: string;
  dateofjoin: string;
  schoolusername: string;
  type: string;
  isactive: number;
  schooluserpasswordhash: string;
  is_teacher_acc: string;
  curriculums: string;
}
