import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Response,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import AdmZip from "adm-zip";
import { CurriculumBusiness } from "src/business";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { exportpayload, StudentProgress } from "src/business/studentprogress.business";
import { TeacherBusiness } from "src/business/teacher.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import {
  BusinessValidationInterceptor,
  SchemaValidationInterceptor,
} from "src/interceptors";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { SchoolExistsForRead } from "../school/school.business.validator";
import { resolveOwnedSchoolSegment } from "src/business/school-scope";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { findOwnedCurriculum } from "src/business/content-scope";
import { getschoolstudents } from "../school/school.request.validator";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { attachmentDisposition } from "src/services/content-disposition";

@ApiTags("Export")
@Controller("export")
@ApiBearerAuth()
export class ExportController {
  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
  @Get(":schoolname/students")
  @ApiResponse({
    status: 200,
    description: "School students exported sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting school students",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(getschoolstudents),
    new BusinessValidationInterceptor([SchoolExistsForRead])
  )
  @ApiParam({ name: `schoolname`, type: "string", required: true })
  @ApiQuery({ name: "cloud", required: false, type: String })
  @RequirePermissions(Permission.DOWNLOAD_STUDENTS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getstudents(
    @Param("schoolname") schoolname: string,
    @Query("cloud") cloud: string = 'false',
    @Response({ passthrough: true }) res: any,
    @Org() org: OrgContext,
  ): Promise<any> {
    const online = (cloud === 'true') ? true : false;
    // The segment names the school by NAME (as before) or by id; resolved once, here.
    const school = await resolveOwnedSchoolSegment(org, schoolname, { forRead: true });
    const studentusers =
      await new SchoolUserBusiness().getschooluserbyschoolid(
        school.schoolid,
        online
      );
    if (studentusers.length <= 0) {
      throw new ApiError(ErrorCode.NOT_FOUND, "There are no students to export.");
    }
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": attachmentDisposition(`students-${school.schoolname}.zip`),
    });
    const payload: exportpayload = { 
      studentusers: [],
      studentprogresses: {
        studentprogress: [],
        studentgradesprogress: [],
        studentlearningprogress: [],
        studentlessonsprogress: [],
        studentlevelsprogress: []
      }
    };
    payload.studentusers = studentusers ? studentusers.map((x) => x.get({ plain: true })) : [];
    const studentprogresses = await new StudentProgress().getstudentprogress(studentusers);
    payload.studentprogresses = studentprogresses;
    const zip = new AdmZip();
    zip.addFile(
      "students.ini",
      Buffer.from(
        JSON.stringify(payload),
        "utf8"
      )
    );

    return new StreamableFile(zip.toBuffer());
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/people-scope.leak.spec.ts" })
  @Get(":schoolname/teachers")
  @ApiResponse({
    status: 200,
    description: "School teachers exported sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting school teachers",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(getschoolstudents),
    new BusinessValidationInterceptor([SchoolExistsForRead])
  )
  @ApiParam({ name: `schoolname`, type: "string", required: true })
  @RequirePermissions(Permission.VIEW_TEACHER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getteachers(
    @Param("schoolname") schoolname: string,
    @Response({ passthrough: true }) res: any,
    @Org() org: OrgContext,
  ): Promise<any> {
    const school = await resolveOwnedSchoolSegment(org, schoolname, { forRead: true });
    const teacherusers = await new TeacherBusiness().getteacheruserbyschoolid(
      school.schoolid
    );
    if (teacherusers.length <= 0) {
      throw new ApiError(ErrorCode.NOT_FOUND, "There are no teachers to export.");
    }
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": attachmentDisposition(`teachers-${school.schoolname}.zip`),
    });

    const zip = new AdmZip();
    zip.addFile(
      "teachers.ini",
      Buffer.from(
        JSON.stringify(
          teacherusers ? teacherusers.map((x) => x.get({ plain: true })) : []
        ),
        "utf8"
      )
    );

    return new StreamableFile(zip.toBuffer());
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get("documents/:curriculumid")
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_DOCUMENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getQuestions(
    @Param("curriculumid") curriculumid: string,
    @Org() org: OrgContext
  ): Promise<any> {
    // the curriculum in the path is the caller's, or not found (before anything is assembled from it)
    await findOwnedCurriculum(org, curriculumid, { where: { isdeleted: false } });
    return await new CurriculumBusiness(org).getDocuments(curriculumid);
  }
}
