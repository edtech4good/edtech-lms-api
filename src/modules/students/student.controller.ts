import {
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
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
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
import { isValid, parse } from "date-fns";
import { json2csv } from "json-2-csv";
import { pushToCloud, studentsFile } from "src/business/cloud-push";
import { assertEnrolmentFits } from "src/business/content-owner";
import { findOwnedSchool, findOwnedStandard, findOwnedStudent, resolveOwnedSchoolRef } from "src/business/school-scope";
import { scopeOf } from "src/business/org-scope";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { StudentBusiness } from "src/business/student.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { Org, OrgContext, OrgOrServer } from "src/decorators/org.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { PlatformGuard } from "src/guards/platform.guard";
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
import { attachmentDisposition } from "src/services/content-disposition";
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
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
@ApiExtraModels(StudentImportBody)
@ApiTags("Student")
@Controller("student")
@ApiBearerAuth()
@ApiResponse({
  status: 500,
  description: "Server error",
})
@UseGuards(
  AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.organisationadmin)
)
export class StudentController {

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
  @ApiQuery({ name: "schoolid", required: false, type: 'string' })
  @ApiQuery({ name: "studentid", required: false, type: 'string' })
  async sync(
    @Query("countryid") countryid: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("schoolid") schoolid: string = '',
    @Query("studentid") studentid: string = '',
    @Response({ passthrough: true }) res: any,
    @OrgOrServer() org: OrgContext,
  ) {
    // The school is named by id or by name; resolved once, here, among the caller's schools (unknown or not theirs: 404).
    const school = await resolveOwnedSchoolRef(org, { schoolid, schoolname });
    // A learner named by id must be one of the caller's (404 otherwise).
    if (studentid) {
      await findOwnedStudent(org, { studentid });
    }
    const students = await new StudentBusiness().getAllStudentsForEdit(countryid, school?.schoolid, studentid, org);
    const csvString = await json2csv(students);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": attachmentDisposition(`students-${school?.schoolname ?? ''}.csv`),
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
  // Adds the same view_student check the other student reads carry, on top
  // of the class-level role guard. Refs #91.
  @RequirePermissions(Permission.VIEW_STUDENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @ApiQuery({ name: "userid", required: false, type: 'string' })
  @ApiQuery({ name: "standard", required: false, type: 'string' })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @ApiQuery({ name: "schoolid", required: false, type: 'string' })
  @ApiQuery({ name: "teacher", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getAllStudents(
    @Query("userid") userid: string = '',
    @Query("standard") standard: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("schoolid") schoolid: string = '',
    @Query("teacher") teacher: string = '',
    @Org() org: OrgContext,
  ): Promise<any> {
    const search_teacher = teacher === 'true' ? true : false;
    // The school is named by id or by name; resolved once, here, among the caller's schools (unknown or not theirs: 404).
    const school = await resolveOwnedSchoolRef(org, { schoolid, schoolname });
    const data = await new StudentBusiness().getStudentsWithFilter(userid, school?.schoolid, standard, search_teacher, org);
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
  async getall(@Body() body: IPaging, @Org() org: OrgContext): Promise<any> {
    const tempresult = await new StudentBusiness().getAllStudents({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    }, org);
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

  @OrgPolicy("owned", { note: "The optional cloud push must send only the learners created by this call.", enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
    AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.organisationadmin)
  )
  @HttpCode(HttpStatus.OK)
  async createall(
    @Body() _body: StudentImportBody,
    @Query("cloud") cloud: boolean = false,
    @Query("online") online: string = 'true',
    @OrgOrServer() org: OrgContext,
  ): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    let result: Array<schoolusers>;
    let school: Awaited<ReturnType<typeof findOwnedSchool>>;
    try {
      // The school must be one of the caller's (live; unknown or not theirs: 404), before anything is written or pushed.
      school = await findOwnedSchool(org, _body.schoolid, { transaction: tnx, field: "schoolid" });
      // A class the learners are put in must be a class of that school (the platform, not acting as an
      // organisation, is not limited).
      if (_body.standard && scopeOf(org).kind !== "platform") {
        await findOwnedStandard(org, _body.standard, tnx, school.schoolid);
      }
      // Enrolling is a link between the school and each curriculum: refused, before anything is written, when they have different owners
      // (the school is the row read just above).
      await assertEnrolmentFits(school.organisationid, _body.curriculumid, tnx);
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
              schoolname: school.schoolname,
              schoolid: school.schoolid,
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
              throw new ApiError(ErrorCode.INVALID_INPUT, "Choose a class for this student.", { fields: [{ field: 'standard', message: 'Choose a class for this student.' }] });
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
              schoolname: school.schoolname,
              schoolid: school.schoolid,
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
        result.map((x) => x.schooluserid),
        { withSchoolId: true },
      );
      if (studentusers.length <= 0) {
        throw new ApiError(ErrorCode.NOT_FOUND, "There are no students to sync.");
      }
      return pushToCloud(
        "students",
        "students.ini",
        JSON.stringify(studentsFile(school.schoolid, studentusers.map((x) => x.get({ plain: true })))),
        school.organisationid,
      );
    }
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
  async deleteuser(
    @Param("schooluserid") schooluserid: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext,
  ): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      // ValidateSchoolUserid confirms the learner exists but not that it is
      // still active, so an already-deleted learner (a stale list, a retry)
      // reaches here. The soft-delete UPDATE is scoped `isdeleted: false`, so it
      // touches 0 rows in that case — report that honestly rather than a false
      // success.
      const [studentDeleted] = await new StudentBusiness().deletestudent(
        schooluserid,
        user.lmsuserid,
        tnx,
        org,
      );
      if (!studentDeleted) {
        throw new ApiError(ErrorCode.NOT_FOUND, "That student doesn't exist. It may have already been removed.");
      }
      await new SchoolUserBusiness().deleteschooluser(
        schooluserid,
        user.lmsuserid,
        tnx,
        org,
      );
      await tnx.commit();

      return {
        error: false,
        data: true,
      };
    } catch (e) {
      await tnx.rollback();
      throw e;
    }
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
  async getuser(@Param("studentid") studentid: string, @Org() org: OrgContext): Promise<any> {
    const tempresult = await new StudentBusiness().getStudent(studentid, org);

    return {
      error: false,
      data: tempresult,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
  async getstudentstats(@Param("studentid") studentid: string, @Org() org: OrgContext): Promise<any> {
    const tb = new StudentBusiness();
    return {
      data: (await tb.getstudentstats(studentid, org))[0],
      error: false,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
    @Param("studentid") studentid: string,
    @Org() org: OrgContext,
  ): Promise<any> {
    const tb = new StudentBusiness();
    return {
      data: await tb.getstudentpracticestats(studentid, org),
      error: false,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
    @Param("studentid") studentid: string,
    @Org() org: OrgContext,
  ): Promise<any> {
    const tb = new StudentBusiness();
    return {
      data: await tb.getstudentquizstats(studentid, org),
      error: false,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
    @Param("studentid") studentid: string,
    @Org() org: OrgContext,
  ): Promise<any> {
    const tb = new StudentBusiness();
    return {
      data: await tb.getstudentlevelstats(studentid, org),
      error: false,
    };
  }

  // Super Admin only: a one-off data migration. Was guarded only by a `:key`
  // matching ADD_PERMISSIONS_KEY (committed to this public repo) with its
  // AccessGuard commented out, so it leaned on the class guard alone. See
  // docs/authorization-model.md.
  @OrgPolicy("platform", { note: "One-off migration across all organisations; platform only." })
  @Post("migrate-standardid")
  @ApiResponse({
    status: 200,
    description: "migrated student standard successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while migrating student standard",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.superadmin), PlatformGuard)
  @HttpCode(HttpStatus.OK)
  async migrateStandards(): Promise<any> {
    await new StudentBusiness().migrateStandards();
    return {
      error: false,
      data: "Migrated successfully!",
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
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
    AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.organisationadmin)
  )
  @HttpCode(HttpStatus.OK)
  async updateStudents(
    @Body() _body: StudentEditedImportBody,
    @User() user: LmsUserToken,
    @OrgOrServer() org: OrgContext,
  ): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      await new StudentBusiness().updateStudents(
        _body.students,
        user,
        tnx,
        org,
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
  @OrgPolicy("platform", { note: "One-off migration across all organisations; platform only." })
  @Post("migrate-subject-curriculum")
  @ApiResponse({
    status: 200,
    description: "migrated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while migrating",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.superadmin), PlatformGuard)
  @HttpCode(HttpStatus.OK)
  async migrateSubjectCurriculum(): Promise<any> {
    await new StudentBusiness().migrateSubjectCurriculum();
    return {
      error: false,
      data: "Migrated successfully!",
    }
  }
}
