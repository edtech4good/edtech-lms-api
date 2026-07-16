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
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { IMultiPaging } from "src/models/IPaging";
import { TechDownTime } from "./models/ReportRequest";
import { LmsUserToken } from "src/models/token.model";
import { User } from "src/decorators/user.decorator";

@ApiTags("Report")
@Controller("report")
@ApiBearerAuth()
// @UseGuards(AccessGuard(TokenType.ACCESS))
export class ReportController {
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
    @Query("countryid") countryid: string = '',
    @Query("year") year: number = new Date().getFullYear(),
  ): Promise<any> {
    const data = await new ReportBusiness().getDashboardReport(countryid, year);
    return {
        data: data,
        error: false,
    };
  }

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
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_PLUS_REACH, Permission.VIEW_SCHOOL_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentGender(
    @Query("countryid") countryid: string = '',
    @Query("schoolname") schoolname: string = '',
  ): Promise<any> {
    const data = await new ReportBusiness().getAllStudentsGender(countryid, schoolname);
    return {
        data: data,
        error: false,
    };
  }

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
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_PLUS_REACH, Permission.VIEW_SCHOOL_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentDisability(
    @Query("countryid") countryid: string = '',
    @Query("schoolname") schoolname: string = '',
  ): Promise<any> {
    const data = await new ReportBusiness().getAllStudentsDisability(countryid, schoolname);
    return {
        data: data,
        error: false,
    };
  }

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
  @ApiQuery({ name: "countryid", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_PLUS_REACH, Permission.VIEW_SCHOOL_REACH)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async getStudentsOfflineOnline(
    @Query("schoolname") schoolname: string = '',
    @Query("countryid") countryid: string = '',
  ): Promise<any> {
    // const response = await axios.get(
    //   `${Config.fortyk.api.rpi.cloud}/report/offlineonline?schoolname=${schoolname}&countryid=${countryid}`,
    //   {
    //     headers: {
    //       Authorization: Config.fortyk.api.serversynckey,
    //     },
    //   }
    // )
    const onlinestudents = await new ReportBusiness().getStudentsOfflineOnline(schoolname, countryid, 'online');
    const offlinestudents = await new ReportBusiness().getStudentsOfflineOnline(schoolname, countryid, 'offline');
    const data = new ReportBusiness().formatChartsOfflineOnline(onlinestudents, offlinestudents);
    return {
      error: false,
      data: data,
    };
  }

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
  async getStudentsProgress(@Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness().getStudentsScoresData(body);
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
  async getClassProgress(@Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness().getClassScoresData(body);
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
  async getStudentsLastProgress(@Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness().getStudentLastCompletedQuiz(body, false, 2);
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
  async getLevelQuiz(@Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness().getLevelQuizScoresData(body);
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
  async getClassLevelQuiz(@Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness().getClassLevelQuizScoresData(body);
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
    @Body() body: IMultiPaging,
    @User() user: LmsUserToken,
  ): Promise<any> {
    if(user && user.schools && user.schools.length > 0) {
      body.filter?.push({
        key: 'schoolid',
        value: user?.schools ?? ''
      });
    }
    const data = await new ReportBusiness().getStudentStatus({
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
  async getSyncRecords(
    @Body() body: IMultiPaging,
    @User() user: LmsUserToken
  ): Promise<any> {
    const data = await new ReportBusiness().getSyncRecord({
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
    @Param("countryid") countryid: string,
  ): Promise<any> {
    const data = await new ReportBusiness().getDashboardByCountry(countryid);
    return {
        data: data,
        error: false,
    };
  }

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
    @Param("schoolname") schoolname: string,
  ): Promise<any> {
    const data = await new ReportBusiness().getDashboardBySchool(schoolname);
    return {
        data: data,
        error: false,
    };
  }


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
  async getStudentUsage(): Promise<any> {
    const data = await new ReportBusiness().getStudentUsage();
    return {
        data: data,
        error: false,
    };
  }

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
  async getStudentGradeProgress(@Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness().getStudentGradeProgress({
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
  async getStudentLevelProgress(@Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness().getStudentLevelProgress({
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
  async getStudentLessonProgress(@Body() body: IMultiPaging): Promise<any> {
    const data = await new ReportBusiness().getStudentLessonProgress({
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
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness().getStudentsScoresData(body, true);
    const formatedData = new ReportDownload().formatQuizzes(data.rows);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }
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
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness().getClassScoresData(body, true);
    const formatedData = new ReportDownload().formatQuizzesOfClass(data.rows);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

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
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness().getStudentLastCompletedQuiz(body, true, 2);
    const formatedData = new ReportDownload().formatCurrentLevel(data.lastcompletedlessonquiz);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }
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
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness().getLevelQuizScoresData(body, true);
    const formatedData = new ReportDownload().formatLevelQuizzes(data.rows);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }
  
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
    @Body() body: IMultiPaging,
    @Response({ passthrough: true }) res: any
  ) {
    const data = await new ReportBusiness().getClassLevelQuizScoresData(body, true);
    const formatedData = new ReportDownload().formatLevelQuizzesClass(data.rows);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

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
    const data = await new ReportBusiness().getStudentStatus(body, true);
    const formatedData = new ReportDownload().formatStudentActivity(data.rows, body?.filter);
    const csvString = await json2csv(formatedData);
    res.set({
      "Content-Type": "application/csv",
      "Content-Disposition": `attachment; filename="report.csv"`,
    });
    return new StreamableFile(Buffer.from(csvString));
  }

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
    @Body() body: TechDownTime
  ): Promise<any> {
    const data = await new ReportBusiness().getFeedbackTechDowntime(body);
    return {
        data: data,
        error: false,
    };
  }
}
