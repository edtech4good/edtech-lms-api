import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Response,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import AdmZip from "adm-zip";
import axios from "axios";
import { isValid, parse } from "date-fns";
import FormData from "form-data";
import { json2csv } from "json-2-csv";
import { SchoolBusiness } from "src/business/school.business";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { StudentBusiness } from "src/business/student.business";
import { Config } from "src/config";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import {
  BusinessValidationInterceptor,
  SchemaValidationInterceptor,
} from "src/interceptors";
import {
  schoolusers,
  schoolusersAttributes,
} from "src/models/data-models/schoolusers";
import { studentsAttributes } from "src/models/data-models/students";
import { Role, TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { IPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { dbinstance } from "src/services/dbservice";
import { v4 as uuidv4 } from "uuid";
import { SchoolExistsById } from "../school/school.business.validator";
import { SchoolRole } from "./../../models/enums/school.role.enum";
import { StudentEditedImportBody, StudentImportBody } from "./models/studentimport";
import { washingtonGroupColumnsForCreate } from "./models/washington-group.mapper";
import {
  BulkUpload,
  ValidateSchoolUserid,
  ValidatestudentID,
} from "./student.business.validator";
import {
  deleteStudents,
  importStudents,
  importUpdatedStudents,
  showallstudents,
  studentstats,
} from "./student.request.validator";
@ApiExtraModels(StudentImportBody)
@ApiTags("Student")
@Controller("student")
@ApiBearerAuth()
@ApiResponse({
  status: 500,
  description: "Server error",
})
@UseGuards(
  AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin)
)
export class StudentController {

  @Get("download-students")
  @ApiResponse({
    status: 200,
    description: "students sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting students",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  // @UseGuards(AccessGuard(TokenType.ACCESS))
  @ApiQuery({ name: "countryid", required: false, type: 'string' })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @ApiQuery({ name: "studentid", required: false, type: 'string' })
  async sync(
    @Query("countryid") countryid: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("studentid") studentid: string = '',
    @Response({ passthrough: true }) res: any
  ) {
    const students = await new StudentBusiness().getAllStudentsForEdit(countryid, schoolname, studentid);
    const csvString = await json2csv(students);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="students-${schoolname}.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @Get('all')
  @ApiResponse({
    status: 200,
    description: "Fetched students successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @ApiQuery({ name: "userid", required: false, type: 'string' })
  @ApiQuery({ name: "standard", required: false, type: 'string' })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @ApiQuery({ name: "teacher", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getAllStudents(
    @Query("userid") userid: string = '',
    @Query("standard") standard: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("teacher") teacher: string = '',
  ): Promise<any> {
    const search_teacher = teacher === 'true' ? true : false;
    const data = await new StudentBusiness().getStudentsWithFilter(userid, schoolname, standard, search_teacher);
    return {
        data: data,
        error: false,
    };
  }

  @Post("")
  @ApiResponse({
    status: 200,
    description: "Students fetch successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching students",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallstudents))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_STUDENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging): Promise<any> {
    const tempresult = await new StudentBusiness().getAllStudents({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return {
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @Post("create")
  @ApiResponse({
    status: 200,
    description: "Students created successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating students",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(importStudents),
    new BusinessValidationInterceptor([
      SchoolExistsById,
      BulkUpload,
    ])
  )
  @ApiBody({ required: false, type: StudentImportBody })
  @ApiQuery({ name: "cloud", required: false, type: Boolean })
  @ApiQuery({ name: "online", required: false, type: String })
  @UseGuards(
    AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin)
  )
  @HttpCode(HttpStatus.OK)
  async createall(
    @Body() _body: StudentImportBody,
    @Query("cloud") cloud: boolean = false,
    @Query("online") online: string = 'true',
  ): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    let result: Array<schoolusers>;
    try {
      const school = await new SchoolBusiness().getschoolbyid(_body.schoolid)
      result = await new SchoolUserBusiness().createSchoolUser(
        _body.students.map(
          (x) =>
            <schoolusersAttributes>{
              isdisabled: false,
              schoolusername: x.schoolusername,
              schooluserpasswordhash: x.schooluserpasswordhash,
              schooluserrole: SchoolRole.STUDENT,
              schooluserstatus: 1,
              schooluserid: uuidv4(),
              schoolname: school?.schoolname,
            }
        ),
        tnx
      );
      const resultEntry = Object.fromEntries(
        result.map((x) => [x.schoolusername, x.schooluserid])
      );

      await new StudentBusiness().createStudents(
        _body.students.map(
          (x) => {
            if(parseInt(x.is_teacher_acc ?? '0') !== 1 && !_body.standard) {
              throw new BadRequestException('Student must has a class!');
            }
            return <studentsAttributes>{
              city: x.city,
              country: x.country,
              curriculumid: _body.curriculumid[0],
              curriculumids: _body.curriculumid,
              genderid: parseInt(x.genderid),
              ...washingtonGroupColumnsForCreate(x),
              isactive: 1,
              schooluserid: resultEntry[x.schoolusername],
              state: x.state,
              studentfirstname: x.studentfirstname,
              studentid: uuidv4(),
              contact: x.contact,
              dateofbirth: isValid(
                parse(x.dateofbirth, "dd-MM-yyyy", new Date())
              )
                ? parse(x.dateofbirth, "dd-MM-yyyy", new Date())
                : null,
              dateofjoin: isValid(parse(x.dateofjoin, "dd-MM-yyyy", new Date()))
                ? parse(x.dateofjoin, "dd-MM-yyyy", new Date())
                : new Date(),
              familyname: x.familyname,
              fathername: x.fathername,
              gradeid: undefined,
              mothername: x.mothername,
              schoolname: school?.schoolname,
              schooltype: x.schooltype,
              standard: _body.standard,
              startinglevelid: undefined,
              studentcurrentlessonid: undefined,
              studentcurrentlevelid: undefined,
              studentlastname: x.studentlastname,
              type: ((online === 'true') || parseInt(x.is_teacher_acc ?? '0') === 1) ? "online" : "offline",
              is_teacher_acc: (parseInt(x.is_teacher_acc ?? '0') === 1) ? true : false,
            }
          }
        ),
        tnx
      );
      await tnx.commit();
    } catch (e) {
      await tnx.rollback();
      throw e;
    }
    if (cloud) {
      const studentusers = await new SchoolUserBusiness().getschooluserbyid(
        result.map((x) => x.schooluserid)
      );
      if (studentusers.length <= 0) {
        throw new BadRequestException({
          error: true,
          errormessage: "No student available",
        });
      }

      const zip = new AdmZip();
      zip.addFile(
        "students.ini",
        Buffer.from(
          JSON.stringify({
            studentusers: studentusers ? studentusers.map((x) => x.get({ plain: true })) : []
          }),
          "utf8"
        )
      );

      const file = new FormData();
      file.append("importfile", zip.toBuffer(), "importfile.zip");
      const response = await axios.put(
        `${Config.fortyk.api.rpi.cloud}/import/students`,
        file,
        {
          headers: {
            Authorization: Config.fortyk.api.serversynckey,
            ...file.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );
      if (response.status === 200) {
        return {
          error: false,
          data: true,
        };
      } else {
        throw Error(response.data);
      }
    }
    return {
      error: false,
      data: true,
    };
  }

  @Delete(":schooluserid")
  @ApiResponse({
    status: 200,
    description: "Students deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting students",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deleteStudents),
    new BusinessValidationInterceptor([ValidateSchoolUserid])
  )
  @ApiParam({ name: `schooluserid`, type: "string", required: true })
  @RequirePermissions(Permission.DELETE_STUDENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async deleteuser(@Param("schooluserid") schooluserid: string): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      // await new StudentBusiness().deletestudent(schooluserid, tnx);
      // await new SchoolUserBusiness().deleteschooluser(schooluserid, tnx);
      tnx.commit();

      return {
        error: false,
        data: true,
      };
    } catch (e) {
      tnx.rollback();
      throw e;
    }
  }

  @Get(":studentid")
  @ApiResponse({
    status: 200,
    description: "Students get successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching students",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(studentstats),
    new BusinessValidationInterceptor([ValidatestudentID])
  )
  @ApiParam({ name: `studentid`, type: "string", required: true })
  @RequirePermissions(Permission.VIEW_STUDENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getuser(@Param("studentid") studentid: string): Promise<any> {
    const tempresult = await new StudentBusiness().getStudent(studentid);

    return {
      error: false,
      data: tempresult,
    };
  }

  @Get("stats/:studentid")
  @ApiResponse({
    status: 200,
    description: "Student stats fetch successfully",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(studentstats),
    new BusinessValidationInterceptor([ValidatestudentID])
  )
  @ApiParam({ name: `studentid`, type: "string", required: true })
  @RequirePermissions(Permission.VIEW_STUDENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getstudentstats(@Param("studentid") studentid: string): Promise<any> {
    const tb = new StudentBusiness();
    return {
      data: (await tb.getstudentstats(studentid))[0],
      error: false,
    };
  }

  @Get("stats/:studentid/practice")
  @ApiResponse({
    status: 200,
    description: "Student practice stats fetch successfully",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(studentstats),
    new BusinessValidationInterceptor([ValidatestudentID])
  )
  @ApiParam({ name: `studentid`, type: "string", required: true })
  @RequirePermissions(Permission.VIEW_STUDENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getstudentpracticestats(
    @Param("studentid") studentid: string
  ): Promise<any> {
    const tb = new StudentBusiness();
    return {
      data: await tb.getstudentpracticestats(studentid),
      error: false,
    };
  }

  @Get("stats/:studentid/quiz")
  @ApiResponse({
    status: 200,
    description: "Student quiz stats fetch successfully",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(studentstats),
    new BusinessValidationInterceptor([ValidatestudentID])
  )
  @RequirePermissions(Permission.VIEW_STUDENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `studentid`, type: "string", required: true })
  async getstudentquizstats(
    @Param("studentid") studentid: string
  ): Promise<any> {
    const tb = new StudentBusiness();
    return {
      data: await tb.getstudentquizstats(studentid),
      error: false,
    };
  }

  @Get("stats/:studentid/level")
  @ApiResponse({
    status: 200,
    description: "Student level stats fetch successfully",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(studentstats),
    new BusinessValidationInterceptor([ValidatestudentID])
  )
  @RequirePermissions(Permission.VIEW_STUDENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `studentid`, type: "string", required: true })
  async getstudentlevelstats(
    @Param("studentid") studentid: string
  ): Promise<any> {
    const tb = new StudentBusiness();
    return {
      data: await tb.getstudentlevelstats(studentid),
      error: false,
    };
  }

  // Super Admin only: a one-off data migration. Was guarded only by a `:key`
  // matching ADD_PERMISSIONS_KEY (committed to this public repo) with its
  // AccessGuard commented out, so it leaned on the class guard alone. See
  // docs/authorization-model.md.
  @Post("migrate-standardid")
  @ApiResponse({
    status: 200,
    description: "migrated student standard successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while migrating student standard",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.superadmin))
  @HttpCode(HttpStatus.OK)
  async migrateStandards(): Promise<any> {
    await new StudentBusiness().migrateStandards();
    return {
      error: false,
      data: "Migrated successfully!",
    };
  }

  @Put("update")
  @ApiResponse({
    status: 200,
    description: "Students updated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while updating students",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(importUpdatedStudents),
  )
  @ApiBody({ required: false, type: StudentEditedImportBody })
  @UseGuards(
    AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin)
  )
  @HttpCode(HttpStatus.OK)
  async updateStudents(
    @Body() _body: StudentEditedImportBody,
    @User() user: LmsUserToken
  ): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      await new StudentBusiness().updateStudents(
        _body.students,
        user,
        tnx
      );
      await tnx.commit();
    } catch (e) {
      await tnx.rollback();
      throw e;
    }
    return {
      error: false,
      data: true,
    };
  }

  // Super Admin only (same public-key history as migrate-standardid above).
  @Post("migrate-subject-curriculum")
  @ApiResponse({
    status: 200,
    description: "migrated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while migrating",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.superadmin))
  @HttpCode(HttpStatus.OK)
  async migrateSubjectCurriculum(): Promise<any> {
    await new StudentBusiness().migrateSubjectCurriculum();
    return {
      error: false,
      data: "Migrated successfully!",
    }
  }
}
