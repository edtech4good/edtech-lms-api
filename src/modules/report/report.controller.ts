import { resolveOwnedSchoolRef, resolveOwnedSchoolSegment } from "src/business/school-scope";
import { Org, OrgContext } from "src/decorators/org.decorator";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Response,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiResponse, ApiBody, ApiParam, ApiQuery } from "@nestjs/swagger";
import axios from "axios";
import { json2csv } from "json-2-csv";
import { ReportBusiness } from "src/business/report.business";
import { ReportDownload } from "src/business/report.download";
import { Config } from "src/config";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { IMultiPaging } from "src/models/IPaging";
import { TechDownTime } from "./models/ReportRequest";
import { LmsUserToken } from "src/models/token.model";
import { User } from "src/decorators/user.decorator";
import { showallsyncrecords } from "./report.request.validator";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";

@ApiTags("Report")
@Controller("report")
@ApiBearerAuth()
// @UseGuards(AccessGuard(TokenType.ACCESS))
export class ReportController {
  @OrgPolicy("owned")
  @Get('dashboard')
  @ApiResponse({
    status: 200,
    description: "Fetched schools successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching schools",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiQuery({ name: "countryid", required: false, type: 'string' })
  @ApiQuery({ name: "year", required: false, type: 'number' })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_PLUS_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getSchoolsReport(
    @Org() org: OrgContext,
    @Query("countryid") countryid: string = '',
    @Query("year") year: number = new Date().getFullYear(),
  ): Promise<any> {
    const data = await new ReportBusiness(org).getDashboardReport(countryid, year);
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned")
  @Get('gender')
  @ApiResponse({
    status: 200,
    description: "Fetched students gender successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students gender",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiQuery({ name: "countryid", required: false, type: 'string' })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @ApiQuery({ name: "schoolid", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_PLUS_REACH, Permission.VIEW_SCHOOL_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentGender(
    @Org() org: OrgContext,
    @Query("countryid") countryid: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("schoolid") schoolid: string = '',
  ): Promise<any> {
    // The school is named by id or by name; resolved once, here (unknown: 404).
    const school = await resolveOwnedSchoolRef(org, { schoolid, schoolname });
    const data = await new ReportBusiness(org).getAllStudentsGender(countryid, school?.schoolid);
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned")
  @Get('disability')
  @ApiResponse({
    status: 200,
    description: "Fetched students disability disaggregation successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students disability disaggregation",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiQuery({ name: "countryid", required: false, type: 'string' })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @ApiQuery({ name: "schoolid", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_PLUS_REACH, Permission.VIEW_SCHOOL_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentDisability(
    @Org() org: OrgContext,
    @Query("countryid") countryid: string = '',
    @Query("schoolname") schoolname: string = '',
    @Query("schoolid") schoolid: string = '',
  ): Promise<any> {
    // The school is named by id or by name; resolved once, here (unknown: 404).
    const school = await resolveOwnedSchoolRef(org, { schoolid, schoolname });
    const data = await new ReportBusiness(org).getAllStudentsDisability(countryid, school?.schoolid);
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned")
  @Get('offlineonline')
  @ApiResponse({
    status: 200,
    description: "Fetched students offline-online successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students offline-online",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @ApiQuery({ name: "schoolid", required: false, type: 'string' })
  @ApiQuery({ name: "countryid", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_PLUS_REACH, Permission.VIEW_SCHOOL_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentsOfflineOnline(
    @Org() org: OrgContext,
    @Query("schoolname") schoolname: string = '',
    @Query("schoolid") schoolid: string = '',
    @Query("countryid") countryid: string = '',
  ): Promise<any> {
    // The school is named by id or by name; resolved once, here (unknown: 404).
    const school = await resolveOwnedSchoolRef(org, { schoolid, schoolname });
    // const response = await axios.get(
    //   `${Config.fortyk.api.rpi.cloud}/report/offlineonline?schoolname=${schoolname}&countryid=${countryid}`,
    //   {
    //     headers: {
    //       Authorization: Config.fortyk.api.serversynckey,
    //     },
    //   }
    // )
    const onlinestudents = await new ReportBusiness(org).getStudentsOfflineOnline(school?.schoolid, countryid, 'online');
    const offlinestudents = await new ReportBusiness(org).getStudentsOfflineOnline(school?.schoolid, countryid, 'offline');
    const data = new ReportBusiness(org).formatChartsOfflineOnline(onlinestudents, offlinestudents);
    return {
      error: false,
      data: data,
    };
  }

  @OrgPolicy("owned")
  @Post('studentprogress')
  @ApiResponse({
    status: 200,
    description: "Fetched students progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_VIEW_QUIZ_SCORE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentsProgress(@Org() org: OrgContext, @Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness(org).getStudentsScoresData(body);
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('studentprogress/class')
  @ApiResponse({
    status: 200,
    description: "Fetched students progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_VIEW_QUIZ_SCORE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getClassProgress(@Org() org: OrgContext, @Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness(org).getClassScoresData(body);
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('studentlastcompletedquiz')
  @ApiResponse({
    status: 200,
    description: "Fetched students last completed successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students last completed quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_CURRENT_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentsLastProgress(@Org() org: OrgContext, @Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness(org).getStudentLastCompletedQuiz(body, false, 2);
    return {
      error: false,
      data: {
        data: data.lastcompletedlessonquiz,
        total: data.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('studentlevelquiz')
  @ApiResponse({
    status: 200,
    description: "Fetched students level quiz successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students level quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_LEVEL_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getLevelQuiz(@Org() org: OrgContext, @Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness(org).getLevelQuizScoresData(body);
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('studentlevelquiz/class')
  @ApiResponse({
    status: 200,
    description: "Fetched students level quiz successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students level quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_LEVEL_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getClassLevelQuiz(@Org() org: OrgContext, @Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness(org).getClassLevelQuizScoresData(body);
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('studentstatus')
  @ApiResponse({
    status: 200,
    description: "Fetched students status successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students status",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_ACTIVE_STATUS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentStatus(
    @Org() org: OrgContext,
    @Body() body: IMultiPaging,
    @User() user: LmsUserToken,
  ): Promise<any> {
    if(user && user.schools && user.schools.length > 0) {
      body.filter?.push({
        key: 'schoolid',
        value: user?.schools ?? ''
      });
    }
    const data = await new ReportBusiness(org).getStudentStatus({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('syncrecords')
  @ApiResponse({
    status: 200,
    description: "Fetched sync records successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching sync records",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_SYNC_RECORD)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @UseInterceptors(new SchemaValidationInterceptor(showallsyncrecords))
  async getSyncRecords(
    @Org() org: OrgContext,
    @Body() body: IMultiPaging,
    @User() user: LmsUserToken
  ): Promise<any> {
    const data = await new ReportBusiness(org).getSyncRecord({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    }, user);
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Get('dashboard/country/:countryid')
  @ApiResponse({
    status: 200,
    description: "Fetched schools successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching schools",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `countryid`, type: "string", required: true })
  @RequirePermissions(Permission.VIEW_PLUS_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getCountryData(
    @Org() org: OrgContext,
    @Param("countryid") countryid: string,
  ): Promise<any> {
    const data = await new ReportBusiness(org).getDashboardByCountry(countryid);
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned")
  @Get('dashboard/school/:schoolname')
  @ApiResponse({
    status: 200,
    description: "Fetched schools successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching schools",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `schoolname`, type: "string", required: true })
  @RequirePermissions(Permission.VIEW_SCHOOL_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getSchoolData(
    @Org() org: OrgContext,
    @Param("schoolname") schoolname: string,
  ): Promise<any> {
    // The segment names the school by NAME (as before) or by id; resolved once, here.
    const school = await resolveOwnedSchoolSegment(org, schoolname, { forRead: true });
    const data = await new ReportBusiness(org).getDashboardBySchool(school.schoolid);
    return {
        data: data,
        error: false,
    };
  }


  @OrgPolicy("owned")
  @Get('studentusage')
  @ApiResponse({
    status: 200,
    description: "Fetched student usage successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching student usage",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_IMPACT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentUsage(@Org() org: OrgContext): Promise<any> {
    const data = await new ReportBusiness(org).getStudentUsage();
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned")
  @Post('student-grade-progress')
  @ApiResponse({
    status: 200,
    description: "Fetched student grade progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching student grade progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OFFLINE_REPORT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentGradeProgress(@Org() org: OrgContext, @Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness(org).getStudentGradeProgress({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        // student: data.student,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('student-level-progress')
  @ApiResponse({
    status: 200,
    description: "Fetched student level progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching student level progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OFFLINE_REPORT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentLevelProgress(@Org() org: OrgContext, @Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness(org).getStudentLevelProgress({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        student: data.student,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('student-lesson-progress')
  @ApiResponse({
    status: 200,
    description: "Fetched student lesson progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching student lesson progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OFFLINE_REPORT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentLessonProgress(@Org() org: OrgContext, @Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness(org).getStudentLessonProgress({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return {
      error: false,
      data: {
        data: data.rows,
        total: data.count,
        student: data.student,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('online/studentprogress')
  @ApiResponse({
    status: 200,
    description: "Fetched students progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_VIEW_QUIZ_SCORE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getOnlineStudentsProgress(@Body() body: IMultiPaging): Promise<any> {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentprogress`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('online/studentprogress/class')
  @ApiResponse({
    status: 200,
    description: "Fetched students progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_VIEW_QUIZ_SCORE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getOnlineClassProgress(@Body() body: IMultiPaging): Promise<any> {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentprogress/class`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('online/studentlastcompletedquiz')
  @ApiResponse({
    status: 200,
    description: "Fetched students last completed successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students last completed quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_CURRENT_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getOnlineStudentsLastProgress(@Body() body: IMultiPaging): Promise<any> {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentlastcompletedquiz`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('studentlevelquiz/online')
  @ApiResponse({
    status: 200,
    description: "Fetched students level quiz successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students level quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_LEVEL_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getLevelQuizOnline(@Body() body: IMultiPaging): Promise<any> {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentlevelquiz`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('online/studentlevelquiz/class')
  @ApiResponse({
    status: 200,
    description: "Fetched students level quiz successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students level quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_LEVEL_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getClassLevelQuizOnline(@Body() body: IMultiPaging): Promise<any> {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentlevelquiz/class`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('online/studentstatus')
  @ApiResponse({
    status: 200,
    description: "Fetched students status successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching students status",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_ACTIVE_STATUS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getOnlineStudentStatus(
    @Body() body: IMultiPaging,
    @User() user: LmsUserToken,
  ): Promise<any> {
    if(user && user.schools && user.schools.length > 0) {
      body.filter?.push({
        key: 'schoolid',
        value: user?.schools ?? ''
      });
    }
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentstatus`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('online/student-grade-progress')
  @ApiResponse({
    status: 200,
    description: "Fetched student grade progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching student grade progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_ONLINE_REPORT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getOnlineStudentGradeProgress(@Body() body: IMultiPaging): Promise<any> {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/student-grade-progress`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        student: response.data.data.student,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('online/student-level-progress')
  @ApiResponse({
    status: 200,
    description: "Fetched student level progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching student level progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_ONLINE_REPORT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getOnlineStudentLevelProgress(@Body() body: IMultiPaging): Promise<any> {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/student-level-progress`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        student: response.data.data.student,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post('online/student-lesson-progress')
  @ApiResponse({
    status: 200,
    description: "Fetched student lesson progress successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching student lesson progress",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_ONLINE_REPORT)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getOnlineStudentLessonProgress(@Body() body: IMultiPaging): Promise<any> {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/student-lesson-progress`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    )
    return {
      error: false,
      data: {
        data: response.data.data.data,
        student: response.data.data.student,
        total: response.data.data.total,
        pageindex: response.data.data?.pageindex || 0,
        pagesize: response.data.data?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("owned")
  @Post("studentprogress/download")
  @ApiResponse({
    status: 200,
    description: "download quizzes successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting quizzes",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_VIEW_QUIZ_SCORE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOfflineStudentsQuizzes(
    @Org() org: OrgContext,
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness(org).getStudentsScoresData(body, true);
    const formatedData = new ReportDownload().formatQuizzes(data.rows);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }
  @OrgPolicy("owned")
  @Post("studentprogress/class/download")
  @ApiResponse({
    status: 200,
    description: "download quizzes successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting quizzes",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_VIEW_QUIZ_SCORE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOfflineClassQuizzes(
    @Org() org: OrgContext,
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness(org).getClassScoresData(body, true);
    const formatedData = new ReportDownload().formatQuizzesOfClass(data.rows);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post("online/studentprogress/download")
  @ApiResponse({
    status: 200,
    description: "download quizzes successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting quizzes",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_VIEW_QUIZ_SCORE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOnlineStudentsProgress(
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentprogress/download`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    );
    const formatedData = new ReportDownload().formatQuizzesOnline(response.data.data);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post("online/studentprogress/class/download")
  @ApiResponse({
    status: 200,
    description: "download quizzes successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting quizzes",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_VIEW_QUIZ_SCORE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOnlineClassProgress(
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentprogress/class/download`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    );
    const formatedData = new ReportDownload().formatQuizzesOfClassOnline(response.data.data);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post("studentlastcompletedquiz/download")
  @ApiResponse({
    status: 200,
    description: "download current level successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting current level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_CURRENT_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOfflineCurrentLevel(
    @Org() org: OrgContext,
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness(org).getStudentLastCompletedQuiz(body, true, 2);
    const formatedData = new ReportDownload().formatCurrentLevel(data.lastcompletedlessonquiz);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }
  @OrgPolicy("owned")
  @Post("online/studentlastcompletedquiz/download")
  @ApiResponse({
    status: 200,
    description: "download current level sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting current level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_CURRENT_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOnlineCurrentLevel(
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentlastcompletedquiz/download`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    );
    const formatedData = new ReportDownload().formatCurrentLevelOnline(response.data.data);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post("studentlevelquiz/download")
  @ApiResponse({
    status: 200,
    description: "download quizzes successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting quizzes",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_LEVEL_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOfflineStudentsLevelQuizzes(
    @Org() org: OrgContext,
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness(org).getLevelQuizScoresData(body, true);
    const formatedData = new ReportDownload().formatLevelQuizzes(data.rows);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }
  
  @OrgPolicy("owned")
  @Post("studentlevelquiz/class/download")
  @ApiResponse({
    status: 200,
    description: "download quizzes successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting quizzes",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_LEVEL_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOfflineClassLevelQuizzes(
    @Org() org: OrgContext,
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness(org).getClassLevelQuizScoresData(body, true);
    const formatedData = new ReportDownload().formatLevelQuizzesClass(data.rows);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post("online/studentlevelquiz/download")
  @ApiResponse({
    status: 200,
    description: "download quizzes successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting quizzes",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_LEVEL_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOnlineStudentsLevelQuiz(
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentlevelquiz/download`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    );
    const formatedData = new ReportDownload().formatLevelQuizzesOnline(response.data.data);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post("online/studentlevelquiz/class/download")
  @ApiResponse({
    status: 200,
    description: "download quizzes sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting quizzes",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_LEVEL_QUIZ)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOnlineClassLevelQuiz(
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentlevelquiz/class/download`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    );
    const formatedData = new ReportDownload().formatLevelQuizzesClassOnline(response.data.data);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post("studentstatus/download")
  @ApiResponse({
    status: 200,
    description: "download student activity successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting student activity",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OFFLINE_ACTIVE_STATUS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadStudentActivity(
    @Org() org: OrgContext,
    @Body() body: IMultiPaging,
    @User() user: LmsUserToken,
    @Response({ passthrough: true }) res: any
  ) {
    if(user && user.schools && user.schools.length > 0) {
      body.filter?.push({
        key: 'schoolid',
        value: user?.schools ?? ''
      });
    }
    const data = await new ReportBusiness(org).getStudentStatus(body, true);
    const formatedData = new ReportDownload().formatStudentActivity(data.rows, body?.filter);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post("online/studentstatus/download")
  @ApiResponse({
    status: 200,
    description: "download student activity successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting student activity",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: IMultiPaging })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ONLINE_ACTIVE_STATUS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async downloadOnlineStudentsActivity(
    @Body() body: IMultiPaging,
    @User() user: LmsUserToken,
    @Response({ passthrough: true }) res: any
  ) {
    if(user && user.schools && user.schools.length > 0) {
      body.filter?.push({
        key: 'schoolid',
        value: user?.schools ?? ''
      });
    }
    const response = await axios.post(
      `${Config.fortyk.api.rpi.cloud}/report/studentstatus/download`,
      body,
      {
        headers: {
          Authorization: Config.fortyk.api.serversynckey,
        },
      }
    );
    const formatedData = new ReportDownload().formatStudentActivityOnline(response.data.data, body?.filter);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

  @OrgPolicy("owned")
  @Post('techdowntime')
  @ApiResponse({
    status: 200,
    description: "Fetched student usage successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching student usage",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @ApiBody({ required: false, type: TechDownTime})
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_TECH_DOWNTIME)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getFeedbackTechDowntime(
    @Org() org: OrgContext,
    @Body() body: TechDownTime
  ): Promise<any> {
    const data = await new ReportBusiness(org).getFeedbackTechDowntime(body);
    return {
        data: data,
        error: false,
    };
  }
}
