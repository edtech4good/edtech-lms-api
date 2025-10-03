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
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { IRequest } from "src/models";
import { levelsAttributes } from "src/models/data-models/levels";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { IPaging } from "src/models/IPaging";
import { ResponseBoolean } from "src/models/ResponseBoolean";
import { LmsUserToken } from "src/models/token.model";
import { LevelBusiness } from "../../business";
import { BusinessValidationInterceptor } from "../../interceptors/businessvalidation.interceptor";
import {
  CreateLevel,
  DeleteLevel,
  EditLevel,
} from "./level.business.validator";
import {
  createlevel,
  deletelevel,
  showalllevel,
  showlevel,
  updatelevel,
} from "./level.request.validator";
import { LevelBase, LevelCreateResponse } from "./models/LevelBase";
import {
  LevelGetAllResponse,
  LevelGetResponse,
} from "./models/LevelGetAllResponse";
import { LevelRequest } from "./models/LevelRequest";
import { LevelResponse } from "./models/LevelResponse";

@ApiExtraModels(LevelBase)
@ApiExtraModels(LevelCreateResponse)
@ApiExtraModels(LevelResponse)
@ApiExtraModels(LevelGetAllResponse)
@ApiTags("Level")
@Controller("level")
@ApiBearerAuth()
export class LevelController {

  @Get('all')
  @ApiResponse({
    status: 200,
    description: "Fetched levels successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error fetching levels",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseGuards(AccessGuard(TokenType.ACCESS))
  @ApiQuery({ name: "gradeid", required: false, type: 'string' })
  @ApiQuery({ name: "level", required: false, type: 'string' })
  @HttpCode(HttpStatus.OK)
  async getAllLevels(
    @Query("gradeid") gradeid: string = '',
    @Query("level") levelname: string = ''
  ): Promise<any> {
    const data = await new LevelBusiness().getLevelsWithFilter(gradeid, levelname);
    return {
        data: data,
        error: false,
    };
  }

  @Post("create")
  @ApiResponse({
    status: 200,
    description: "Level created successfully",
    schema: { $ref: getSchemaPath(LevelCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while creating level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(createlevel),
    new BusinessValidationInterceptor([CreateLevel])
  )
  @RequirePermissions(Permission.CREATE_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() body: LevelRequest,
    @Request() payload: IRequest,
  ): Promise<LevelCreateResponse> {
    const temp: levelsAttributes = {
      levelname: body.levelname,
      leveldescription: body.leveldescription,
      levelid: "",
      isdeleted: false,
      levelstatus: false,
      gradeid: body.gradeid,
      levelorder: body.levelorder,
      quiz_points: 100,
      passing_points: 0,
    };

    const data = await new LevelBusiness().createLevel(temp, payload?.user);
    return {
      error: false,
      data: data,
    };
  }

  @Delete(":levelid")
  @ApiResponse({
    status: 200,
    description: "Level deleted successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deleting level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletelevel),
    new BusinessValidationInterceptor([DeleteLevel])
  )
  @RequirePermissions(Permission.DELETE_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelid`, type: "string", required: true })
  async delete(
    @Param("levelid") levelid: string,
    @User() user: LmsUserToken
  ): Promise<ResponseBoolean> {
    await new LevelBusiness().deleteLevel(levelid, user);
    return {
      error: false,
      data: true,
    };
  }

  @Put("deactivate/:levelid")
  @ApiResponse({
    status: 200,
    description: "Level deactivate successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while deactivate level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletelevel),
    new BusinessValidationInterceptor([DeleteLevel])
  )
  @RequirePermissions(Permission.UPDATE_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelid`, type: "string", required: true })
  async deactivate(
    @Param("levelid") levelid: string
  ): Promise<ResponseBoolean> {
    await new LevelBusiness().deavtivateLevel(levelid);
    return {
      error: false,
      data: true,
    };
  }

  @Put("activate/:levelid")
  @ApiResponse({
    status: 200,
    description: "Level activated successfully",
    schema: { $ref: getSchemaPath(ResponseBoolean) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while activated level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(deletelevel),
    new BusinessValidationInterceptor([DeleteLevel])
  )
  @RequirePermissions(Permission.UPDATE_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelid`, type: "string", required: true })
  async activate(@Param("levelid") levelid: string): Promise<ResponseBoolean> {
    await new LevelBusiness().activateLevel(levelid);
    return {
      error: false,
      data: true,
    };
  }

  @Get(":levelid")
  @ApiResponse({
    status: 200,
    description: "Level fetch successfully",
    schema: { $ref: getSchemaPath(LevelGetResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(showlevel),
    new BusinessValidationInterceptor([DeleteLevel])
  )
  @RequirePermissions(Permission.VIEW_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelid`, type: "string", required: true })
  async get(@Param("levelid") levelid: string): Promise<LevelGetResponse> {
    const data = await new LevelBusiness().getLevelbyid(levelid);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Put(":levelid")
  @ApiResponse({
    status: 200,
    description: "Level update successfully",
    schema: { $ref: getSchemaPath(LevelCreateResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(
    new SchemaValidationInterceptor(updatelevel),
    new BusinessValidationInterceptor([DeleteLevel, EditLevel])
  )
  @RequirePermissions(Permission.UPDATE_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: `levelid`, type: "string", required: true })
  async update(
    @Param("levelid") levelid: string,
    @Body() body: LevelRequest,
    @Request() payload: IRequest
  ): Promise<LevelCreateResponse> {
    const data = await new LevelBusiness().updateLevel(<levelsAttributes>{
      levelid,
      levelname: body.levelname,
      leveldescription: body.leveldescription,
      gradeid: body.gradeid,
      levelorder: body.levelorder,
      quiz_points: 100,
      passing_points: 0,
    }, payload?.user);
    return {
      error: false,
      data: data ? data : undefined,
    };
  }

  @Post("")
  @ApiResponse({
    status: 200,
    description: "Levels fetch successfully",
    schema: { $ref: getSchemaPath(LevelGetAllResponse) },
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching level",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @UseInterceptors(new SchemaValidationInterceptor(showalllevel))
  @ApiBody({ required: false, type: IPaging })
  @RequirePermissions(Permission.VIEW_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async getall(@Body() body: IPaging): Promise<LevelGetAllResponse> {
    const tempresult = await new LevelBusiness().getLevelall({
      pageindex: body?.pageindex || 0,
      pagesize: body?.pagesize || 0,
      filter: body?.filter || [],
    });
    return <LevelGetAllResponse>{
      error: false,
      data: {
        data: tempresult.rows,
        total: tempresult.count,
        pageindex: body?.pageindex || 0,
        pagesize: body?.pagesize || 0,
      },
    };
  }

  @Post("update_quiz_points")
  @ApiResponse({
    status: 200,
    description: "Level Quiz update successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while fetching level quiz",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @RequirePermissions(Permission.UPDATE_LEVEL)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  async autoupdatelessonprogresspoints(
    @Request() payload: IRequest
  ): Promise<any> {
    await new LevelBusiness().updateLevelQuizPoints(payload?.user);
    return {
      error: false,
      data: 'updated levels',
    };
  }
}
