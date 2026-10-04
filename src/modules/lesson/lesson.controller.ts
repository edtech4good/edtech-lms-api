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
  Request,
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
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { PlatformGuard } from "src/guards/platform.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { IRequest } from "src/models";
import { lessonsAttributes } from "src/models/data-models/lessons";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { IPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { LessonBusiness } from "../../business";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import {
  CreateLesson,
  DeleteLesson,
  EditLesson,
} from "./lesson.business.validator";
import {
  createlesson,
  deletelesson,
  showalllesson,
  showlesson,
  updatelesson,
} from "./lesson.request.validator";
import { LessonBase, LessonCreateResponse } from "./models/LessonBase";
import {
  LessonGetAllResponse,
  LessonGetResponse,
} from "./models/LessonGetAllResponse";
import { LessonRequest } from "./models/LessonRequest";
import { LessonResponse } from "./models/LessonResponse";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { assertSameOwner, ownerOfLesson, ownerOfLevel } from "src/business/content-owner";
import { assertInScope, findOwnedLevel } from "src/business/content-scope";
import { Org, OrgContext, OrgOrSchoolUser } from "src/decorators/org.decorator";

@ApiExtraModels(LessonBase)
@ApiExtraModels(LessonCreateResponse)
@ApiExtraModels(LessonResponse)
@ApiExtraModels(LessonGetAllResponse)
@ApiTags("Lesson")
@Controller("lesson")
@ApiBearerAuth()
export class LessonController {

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get('all')
  @ApiResponse({
    status: 200,
    description: "Fetched lessons successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching lessons",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @ApiQuery({ name: "levelid", required: false, type: 'string' })
  @ApiQuery({ name: "lesson", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getAllLessons(
    @Query("levelid") levelid: string = '',
    @Query("lesson") lessonname: string = '',
    @OrgOrSchoolUser() org: OrgContext | undefined
  ): Promise<any> {
    // A staff token reads the lessons of its organisation; a school-user token has no organisation context and keeps
    // reading every lesson.
    const data = await new LessonBusiness(org).getLessonsWithFilter(levelid, lessonname);
    return {
        data: data,
        error: false,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Post("create")
  @ApiResponse({
    status: 200,
    description: "Lesson created successfully",
    schema: { $ref: getSchemaPath(LessonCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating lesson",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createlesson),
    new BusinessValidationInterceptor([CreateLesson])
  )
  @RequirePermissions(Permission.CREATE_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: LessonRequest,
    @Request() payload: IRequest,
    @Org() org: OrgContext
  ): Promise<LessonCreateResponse> {
    // the level it goes under is the caller's, or not found (as one that is not there): nothing is written
    await findOwnedLevel(org, body.levelid);
    const temp: lessonsAttributes = {
      lessonname: body.lessonname,
      lessondescription: body.lessondescription,
      lessonid: "",
      isdeleted: false,
      lessonstatus: false,
      levelid: body.levelid,
      lessonorder: body.lessonorder,
      lessonpasspercentage: 80,
      practicecount: 0,
      quizcount: 0,
      total_points: 100,
      passing_points: 0,
    };

    const data = await new LessonBusiness().createLesson(temp, payload?.user);
    return {
      error: false,
      data: data,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Delete(":lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting lesson",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletelesson),
    new BusinessValidationInterceptor([DeleteLesson])
  )
  @RequirePermissions(Permission.DELETE_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: "string", required: true })
  async delete(
    @Param("lessonid") lessonid: string,
    @User() user: LmsUserToken,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new LessonBusiness(org).deleteLesson(lessonid, user);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put("deactivate/:lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson deactivate successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deactivate lesson",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletelesson),
    new BusinessValidationInterceptor([DeleteLesson])
  )
  @RequirePermissions(Permission.UPDATE_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: "string", required: true })
  async deactivate(
    @Param("lessonid") lessonid: string,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new LessonBusiness(org).deavtivateLesson(lessonid);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put("activate/:lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson activated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while activated lesson",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletelesson),
    new BusinessValidationInterceptor([DeleteLesson])
  )
  @RequirePermissions(Permission.UPDATE_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: "string", required: true })
  async activate(
    @Param("lessonid") lessonid: string,
    @Org() org: OrgContext
  ): Promise<ResponseBoolean> {
    await new LessonBusiness(org).activateLesson(lessonid);
    return {
      error: false,
      data: true,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get(":lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson fetch successfully",
    schema: { $ref: getSchemaPath(LessonGetResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching lesson",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showlesson),
    new BusinessValidationInterceptor([DeleteLesson])
  )
  @RequirePermissions(Permission.VIEW_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: "string", required: true })
  async get(@Param("lessonid") lessonid: string, @Org() org: OrgContext): Promise<LessonGetResponse> {
    const data = await new LessonBusiness(org).getLessonbyid(lessonid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put(":lessonid")
  @ApiResponse({
    status: 200,
    description: "Lesson update successfully",
    schema: { $ref: getSchemaPath(LessonCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching lesson",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatelesson),
    new BusinessValidationInterceptor([DeleteLesson, EditLesson])
  )
  @RequirePermissions(Permission.UPDATE_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `lessonid`, type: "string", required: true })
  async update(
    @Param("lessonid") lessonid: string,
    @Body() body: LessonRequest,
    @Request() payload: IRequest,
    @Org() org: OrgContext
  ): Promise<LessonCreateResponse> {
    // The lesson in the path and the level in the body are both the caller's, or not found (before anything is
    // compared). Moving a lesson moves everything beneath it: it may only go to a level with the same owner.
    await assertInScope(org, "lesson", lessonid);
    await findOwnedLevel(org, body.levelid);
    assertSameOwner(await ownerOfLesson(lessonid), await ownerOfLevel(body.levelid));
    const data = await new LessonBusiness(org).updateLesson(
      <lessonsAttributes>{
        lessonid,
        lessonname: body.lessonname,
        lessondescription: body.lessondescription,
        levelid: body.levelid,
        lessonorder: body.lessonorder,
        total_points: 100,
        passing_points: 0,
      },
      payload?.user
    );
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Post("")
  @ApiResponse({
    status: 200,
    description: "Lessons fetch successfully",
    schema: { $ref: getSchemaPath(LessonGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching lesson",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showalllesson))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging, @Org() org: OrgContext): Promise<LessonGetAllResponse> {
    const tempresult = await new LessonBusiness(org).getLessonall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return <LessonGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @OrgPolicy("platform", { note: "Bulk recompute across all organisations; platform only." })
  @Post("update_reward_points")
  @ApiResponse({
    status: 200,
    description: "Lesson update successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching lesson",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.UPDATE_LESSON)
  @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard, CheckPermissionsGuard)
  async autoupdatelessonprogresspoints(
    @Request() payload: IRequest
  ): Promise<any> {
    const data = await new LessonBusiness().autoupdatealllessonprogress(payload?.user);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }
}
