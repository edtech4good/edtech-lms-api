import {
  BadRequestException,
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
import { SchoolExists } from "../school/school.business.validator";
import { getschoolstudents } from "../school/school.request.validator";

@ApiTags("Export")
@Controller("export")
@ApiBearerAuth()
export class ExportController {
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
    new BusinessValidationInterceptor([SchoolExists])
  )
  @ApiParam({ name: `schoolname`, type: "string", required: true })
  @ApiQuery({ name: "cloud", required: false, type: String })
  @RequirePermissions(Permission.DOWNLOAD_STUDENTS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getstudents(
    @Param("schoolname") schoolname: string,
    @Query("cloud") cloud: string = 'false',
    @Response({ passthrough: true }) res: any
  ): Promise<any> {
    const online = (cloud === 'true') ? true : false;
    const studentusers =
      await new SchoolUserBusiness().getschooluserbyschoolname(
        schoolname.trim(),
        online
      );
    if (studentusers.length <= 0) {
      throw new BadRequestException({
        error: true,
        errormessage: "No student available",
      });
    }
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="students-${schoolname.trim()}.zip"`,
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
    new BusinessValidationInterceptor([SchoolExists])
  )
  @ApiParam({ name: `schoolname`, type: "string", required: true })
  @RequirePermissions(Permission.VIEW_TEACHER)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getteachers(
    @Param("schoolname") schoolname: string,
    @Response({ passthrough: true }) res: any
  ): Promise<any> {
    const teacherusers = await new TeacherBusiness().getteacheruserbyschoolname(
      schoolname.trim()
    );
    if (teacherusers.length <= 0) {
      throw new BadRequestException({
        error: true,
        errormessage: "No teacher available",
      });
    }
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="teachers-${schoolname.trim()}.zip"`,
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

  @Get("documents/:curriculumid")
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_DOCUMENT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getQuestions(
    @Param("curriculumid") curriculumid: string
  ): Promise<any> {
    return await new CurriculumBusiness().getDocuments(curriculumid);
  }
}
