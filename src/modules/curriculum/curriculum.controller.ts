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
import { orderBy } from "lodash";
import { LessonPracticeBusiness } from "src/business/lessonpractice.business";
import { LessonQuizBusiness } from "src/business/lessonquiz.business";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { curriculumsAttributes } from "src/models/data-models/curriculums";
import { Role, TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { IPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import {
  CurriculumBusiness,
  GradeBusiness,
  LessonBusiness,
  LevelBusiness,
} from "../../business";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import { ShowCountry } from "../country/country.business.validator";
import {
  CreateCurriculum,
  DeleteCurriculum,
  EditCurriculum,
} from "./curriculum.business.validator";
import {
  createcurriculum,
  deletecurriculum,
  showallcurriculum,
  showcurriculum,
  showcurriculumbycountry,
  updatecurriculum,
} from "./curriculum.request.validator";
import {
  CurriculumBase,
  CurriculumCountryResponse,
  CurriculumCreateResponse,
} from "./models/CurriculumBase";
import { CurriculumGetAllResponse } from "./models/CurriculumGetAllResponse";
import { CurriculumRequest } from "./models/CurriculumRequest";
import { CurriculumResponse } from "./models/CurriculumResponse";

@ApiExtraModels(
  CurriculumBase,
  CurriculumCreateResponse,
  CurriculumResponse,
  CurriculumGetAllResponse
)
@ApiTags("Curriculum")
@Controller("curriculum")
@ApiBearerAuth()
export class CurriculumController {

  @Get('all')
  @ApiResponse({
    status: 200,
    description: "Fetched curriculums successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching curriculums",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  // Role.teacher reads: feeds the curriculum filter on the report screens.
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher))
  @ApiQuery({ name: "cur", required: false, type: 'string' })
  @ApiQuery({ name: "studentid", required: false, type: 'string' })
  @ApiQuery({ name: "standardid", required: false, type: 'string' })
  @ApiQuery({ name: "schoolname", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getAllCurriculums(
    @Query("cur") cur: string = '',
    @Query("studentid") studentid: string = '',
    @Query("standardid") standardid: string = '',
    @Query("schoolname") schoolname: string = '',
  ): Promise<any> {
    const data = await new CurriculumBusiness().getCurriculumsWithFilter(cur, studentid, standardid, schoolname);
    return {
        data: data,
        error: false,
    };
  }
  
  @Post("create")
  @ApiResponse({
    status: 200,
    description: "Curriculum created successfully",
    schema: { $ref: getSchemaPath(CurriculumCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createcurriculum),
    new BusinessValidationInterceptor([CreateCurriculum])
  )
  @RequirePermissions(Permission.CREATE_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: CurriculumRequest,
    @User() user: LmsUserToken
  ): Promise<CurriculumCreateResponse> {
    const temp: curriculumsAttributes = {
      curriculumname: body.curriculumname,
      curriculumdescription: body.curriculumdescription,
      subjectid: body.subjectid,
      curriculumid: "",
      isdeleted: false,
      curriculumstatus: false,
    };

    const data = await new CurriculumBusiness().createCurriculum(temp, user);
    await new CurriculumBusiness().createcurriculumcountry(body.countryid, data.curriculumid);
    return {
      error: false,
      data: data,
    };
  }

  @Delete(":curriculumid")
  @ApiResponse({
    status: 200,
    description: "Curriculum deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletecurriculum),
    new BusinessValidationInterceptor([DeleteCurriculum])
  )
  @RequirePermissions(Permission.DELETE_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  async delete(
    @Param("curriculumid") curriculumid: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new CurriculumBusiness().deleteCurriculum(curriculumid, user);
    return {
      error: false,
      data: true,
    };
  }

  @Put("deactivate/:curriculumid")
  @ApiResponse({
    status: 200,
    description: "Curriculum deactivate successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deactivate curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletecurriculum),
    new BusinessValidationInterceptor([DeleteCurriculum])
  )
  @RequirePermissions(Permission.UPDATE_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  async deactivate(
    @Param("curriculumid") curriculumid: string
  ): Promise<ResponseBoolean> {
    await new CurriculumBusiness().deavtivateCurriculum(curriculumid);
    return {
      error: false,
      data: true,
    };
  }

  @Put("activate/:curriculumid")
  @ApiResponse({
    status: 200,
    description: "Curriculum activated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while activated curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletecurriculum),
    new BusinessValidationInterceptor([DeleteCurriculum])
  )
  @RequirePermissions(Permission.UPDATE_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  async activate(
    @Param("curriculumid") curriculumid: string
  ): Promise<ResponseBoolean> {
    await new CurriculumBusiness().activateCurriculum(curriculumid);
    return {
      error: false,
      data: true,
    };
  }
  @Get("map")
  @ApiResponse({
    status: 200,
    description: "Curriculums map fetch successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching curriculum map",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.VIEW_CURRICULUM, Permission.VIEW_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async map() {
    const curriculums = await new CurriculumBusiness().getCurriculums();
    const grades = await new GradeBusiness().getGrades();
    const levels = await new LevelBusiness().getLevels();
    const lessons = await new LessonBusiness().getLessons();
    const lessonquizzes = await new LessonQuizBusiness().getLessonQuizzes();
    const lessonpractices =
      await new LessonPracticeBusiness().getLessonPractices();
    /*const data = curriculums.map(curriculum => {
      const tempc: any = { ...curriculum.toJSON() };
      tempc.grades = grades.filter(x => x.curriculumid === curriculum.curriculumid).map(grade => {
        const tempg: any = { ...grade.toJSON() };
        tempg.levels = orderBy(levels.filter(x => x.gradeid === grade.gradeid).map(level => {
          const templev: any = { ...level.toJSON() };
          templev.lessons = orderBy(lessons.filter(x => x.levelid === level.levelid).map(lesson => {

            return {
              ...lesson.toJSON(),
              quizzes: orderBy(lessonquizzes.filter(x => x.lessonid === lesson.lessonid).map(x => x.toJSON()), "lessonquizorder"),
              practices: orderBy(lessonpractices.filter(x => x.lessonid === lesson.lessonid).map(x => x.toJSON()), "lessonpracticeorder"),
            }
          }), "lessonorder")
          return templev;
        }), "levelorder")
        return tempg;
      })
      return tempc;
    });*/

    return {
      error: false,
      data: {
        grades,
        levels,
        lessons,
        lessonquizzes,
        lessonpractices,
        curriculums,
      },
    };
  }

  @Get("tree")
  @ApiResponse({
    status: 200,
    description: "Curriculums tree fetch successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching curriculum tree",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.VIEW_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async tree() {
    const curriculums = await new CurriculumBusiness().getCurriculums();
    const grades = await new GradeBusiness().getGrades();
    const levels = await new LevelBusiness().getLevels();
    const lessons = await new LessonBusiness().getLessons();
    const lessonquizzes = await new LessonQuizBusiness().getLessonQuizzes();
    const lessonpractices =
      await new LessonPracticeBusiness().getLessonPractices();
    const data = curriculums.map((curriculum) => {
      const tempc: any = { ...curriculum.toJSON() };
      tempc.grades = grades
        .filter((x) => x.curriculumid === curriculum.curriculumid)
        .map((grade) => {
          const tempg: any = { ...grade.toJSON() };
          tempg.levels = orderBy(
            levels
              .filter((x) => x.gradeid === grade.gradeid)
              .map((level) => {
                const templev: any = { ...level.toJSON() };
                templev.lessons = orderBy(
                  lessons
                    .filter((x) => x.levelid === level.levelid)
                    .map((lesson) => ({
                      ...lesson.toJSON(),
                      quizzes: orderBy(
                        lessonquizzes
                          .filter((x) => x.lessonid === lesson.lessonid)
                          .map((x) => x.toJSON()),
                        "lessonquizorder"
                      ),
                      practices: orderBy(
                        lessonpractices
                          .filter((x) => x.lessonid === lesson.lessonid)
                          .map((x) => x.toJSON()),
                        "lessonpracticeorder"
                      ),
                    })),
                  "lessonorder"
                );
                return templev;
              }),
            "levelorder"
          );
          return tempg;
        });
      return tempc;
    });

    return {
      error: false,
      data: data,
    };
  }

  @Get("tree/:curriculumid")
  @ApiResponse({
    status: 200,
    description: "Curriculum tree fetch successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showcurriculum),
    new BusinessValidationInterceptor([DeleteCurriculum])
  )
  @RequirePermissions(Permission.VIEW_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  async getcurriculumtree(
    @Param("curriculumid") curriculumid: string
  ): Promise<any> {
    const curriculums = await new CurriculumBusiness().getCurriculums();
    const grades = await new GradeBusiness().getGrades();
    const levels = await new LevelBusiness().getLevels();
    const lessons = await new LessonBusiness().getLessons();
    const lessonquizzes = await new LessonQuizBusiness().getLessonQuizzes();
    const lessonpractices =
      await new LessonPracticeBusiness().getLessonPractices();
    const data = curriculums
      .filter((x) => x.curriculumid === curriculumid)
      .map((curriculum) => {
        const tempc: any = { ...curriculum.toJSON() };
        tempc.grades = grades
          .filter((x) => x.curriculumid === curriculum.curriculumid)
          .map((grade) => {
            const tempg: any = { ...grade.toJSON() };
            tempg.levels = orderBy(
              levels
                .filter((x) => x.gradeid === grade.gradeid)
                .map((level) => {
                  const templev: any = { ...level.toJSON() };
                  templev.lessons = orderBy(
                    lessons
                      .filter((x) => x.levelid === level.levelid)
                      .map((lesson) => ({
                        ...lesson.toJSON(),
                        quizzes: orderBy(
                          lessonquizzes
                            .filter((x) => x.lessonid === lesson.lessonid)
                            .map((x) => x.toJSON()),
                          "lessonquizorder"
                        ),
                        practices: orderBy(
                          lessonpractices
                            .filter((x) => x.lessonid === lesson.lessonid)
                            .map((x) => x.toJSON()),
                          "lessonpracticeorder"
                        ),
                      })),
                    "lessonorder"
                  );
                  return templev;
                }),
              "levelorder"
            );
            return tempg;
          });
        return tempc;
      });

    return {
      error: false,
      data: data,
    };
  }

  @Get(":curriculumid")
  @ApiResponse({
    status: 200,
    description: "Curriculum fetch successfully",
    schema: { $ref: getSchemaPath(CurriculumCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showcurriculum),
    new BusinessValidationInterceptor([DeleteCurriculum])
  )
  @RequirePermissions(Permission.VIEW_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  async get(
    @Param("curriculumid") curriculumid: string
  ): Promise<CurriculumCreateResponse> {
    const data = await new CurriculumBusiness().getCurriculumbyid(curriculumid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Put(":curriculumid")
  @ApiResponse({
    status: 200,
    description: "Curriculum update successfully",
    schema: { $ref: getSchemaPath(CurriculumCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatecurriculum),
    new BusinessValidationInterceptor([DeleteCurriculum, EditCurriculum])
  )
  @RequirePermissions(Permission.UPDATE_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `curriculumid`, type: "string", required: true })
  async update(
    @Param("curriculumid") curriculumid: string,
    @Body() body: CurriculumRequest,
    @User() user: LmsUserToken
  ): Promise<CurriculumCreateResponse> {
    const data = await new CurriculumBusiness().updateCurriculum(<
      curriculumsAttributes
    >{
      curriculumid,
      curriculumname: body.curriculumname,
      curriculumdescription: body.curriculumdescription,
      subjectid: body.subjectid
    }, user);
    if (data) {
      await new CurriculumBusiness().updatecurriculumcountry(body.countryid, data.curriculumid);
    }
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Post("")
  @ApiResponse({
    status: 200,
    description: "Curriculums fetch successfully",
    schema: { $ref: getSchemaPath(CurriculumGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showallcurriculum))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_CURRICULUM)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging): Promise<CurriculumGetAllResponse> {
    const tempresult = await new CurriculumBusiness().getCurriculumall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return <CurriculumGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @Get("country/:countryid")
  @ApiResponse({
    status: 200,
    description: "Curriculum fetch successfully",
    schema: { $ref: getSchemaPath(CurriculumCountryResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching curriculum",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showcurriculumbycountry),
    new BusinessValidationInterceptor([ShowCountry])
  )
  // Role.teacher reads: feeds the curriculum filter on the report screens.
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher))
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `countryid`, type: "string", required: true })
  async getCurriculumByCountry(
    @Param("countryid") countryid: string
  ): Promise<CurriculumCountryResponse> {
    const data = await new CurriculumBusiness().getAllCurriculumbyCountryid(countryid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  
}
