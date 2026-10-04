import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import {
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { pushToCloud, rostersNameTheirSchool, teachersFile } from "src/business/cloud-push";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { TeacherBusiness } from "src/business/teacher.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { Org, OrgContext, OrgOrServer } from "src/decorators/org.decorator";
import { findOwnedSchool, findOwnedTeacher, requireOwnedSchoolByName } from "src/business/school-scope";
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
import { Role, TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { IPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { v4 as uuidv4 } from "uuid";
import { TeacherImportBody } from "./models/teachersimport";
import {
  BulkUpload,
  ValidateTeacherUserid,
} from "./teacher.business.validator";
import {
  deleteTeacher,
  importTeachers,
  showallteachers,
} from "./teacher.request.validator";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
@ApiTags("Teacher")
@Controller("teacher")
@ApiBearerAuth()
@ApiResponse({
  status: 500,
  description: "Server error",
})
export class TeacherController {
  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
  @Post("")
  @ApiResponse({
    status: 200,
    description: "Teachers fetch successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching teachers",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallteachers))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_TEACHER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging, @Org() org: OrgContext): Promise<any> {
    const tempresult = await new TeacherBusiness().getAllTeachers({
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

  @OrgPolicy("owned", { note: "The optional cloud push must send only the teachers created by this call.", enforcedBy: "src/modules/people-scope.leak.spec.ts" })
  @Post("create")
  @ApiResponse({
    status: 200,
    description: "Teachers created successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating teachers",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(importTeachers),
    new BusinessValidationInterceptor([
      //SchoolExists,
      BulkUpload,
    ])
  )
  @ApiBody({ required: false, type: TeacherImportBody })
  @ApiQuery({ name: "cloud", required: false, type: Boolean })
  @UseGuards(
    AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.organisationadmin)
  )
  @HttpCode(HttpStatus.OK)
  async createall(
    @Body() _body: TeacherImportBody,
    @Query("cloud") cloud: boolean = false,
    @OrgOrServer() org: OrgContext,
  ): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    let result: Array<schoolusers>;
    let school: Awaited<ReturnType<typeof requireOwnedSchoolByName>>;
    try {
      // The school is named by NAME, among the caller's schools (none: 404), before anything is written or pushed.
      school = await requireOwnedSchoolByName(org, _body.schoolname, tnx);
      result = await new SchoolUserBusiness().createSchoolUser(
        _body.teachers.map(
          (x) =>
            <schoolusersAttributes>{
              isdisabled: false,
              schoolusername: x.schoolusername,
              schooluserpasswordhash: x.schooluserpasswordhash,
              schooluserrole: SchoolRole.TEACHER,
              schooluserstatus: 1,
              schooluserid: uuidv4(),
              schoolid: school.schoolid,
              schoolname: school.schoolname,
            }
        ),
        tnx
      );

      await tnx.commit();
    } catch (e) {
      await rollbackQuietly(tnx);
      throw e;
    }
    if (cloud) {
      const teacherusers = await new SchoolUserBusiness().getschoolteachersbyid(
        result.map((x) => x.schooluserid),
        { withSchoolId: rostersNameTheirSchool() },
      );
      if (teacherusers.length <= 0) {
        throw new ApiError(ErrorCode.NOT_FOUND, "There are no teachers to sync.");
      }
      return pushToCloud(
        "teachers",
        "teachers.ini",
        JSON.stringify(teachersFile(school.schoolid, teacherusers.map((x) => x.get({ plain: true })))),
        // the organisation the school belongs to (the school was found among the caller's, just above)
        (await findOwnedSchool(org, school.schoolid, { includeDeleted: true })).organisationid,
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
    description: "Teachers deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting teachers",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deleteTeacher),
    new BusinessValidationInterceptor([ValidateTeacherUserid])
  )
  @ApiParam({ name: `schooluserid`, type: "string", required: true })
  @RequirePermissions(Permission.DELETE_TEACHER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async deleteuser(
    @Param("schooluserid") schooluserid: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext,
  ): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      // 404 for a teacher that is not the caller's, like one that does not exist.
      await findOwnedTeacher(org, schooluserid, tnx);
      // 0 rows updated means the teacher was already soft-deleted (stale list /
      // retry); report that rather than a false success. See the student delete.
      const [teacherDeleted] = await new SchoolUserBusiness().deleteschooluser(
        schooluserid,
        user.lmsuserid,
        tnx,
        org,
      );
      if (!teacherDeleted) {
        throw new ApiError(ErrorCode.NOT_FOUND, "That teacher doesn't exist. It may have already been removed.");
      }
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
}
