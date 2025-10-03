import {
  BadRequestException,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import AdmZip from "adm-zip";
import axios from "axios";
import FormData from "form-data";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { TeacherBusiness } from "src/business/teacher.business";
import { Config } from "src/config";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
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
import { dbinstance } from "src/services/dbservice";
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
@ApiTags("Teacher")
@Controller("teacher")
@ApiBearerAuth()
@ApiResponse({
  status: 500,
  description: "Server error",
})
export class TeacherController {
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
  async getall(@Body() body: IPaging): Promise<any> {
    const tempresult = await new TeacherBusiness().getAllTeachers({
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
    AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin)
  )
  @HttpCode(HttpStatus.OK)
  async createall(
    @Body() _body: TeacherImportBody,
    @Query("cloud") cloud: boolean = false
  ): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    let result: Array<schoolusers>;
    try {
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
              schoolname: _body.schoolname,
            }
        ),
        tnx
      );

      tnx.commit();
    } catch (e) {
      tnx.rollback();
      throw e;
    }
    if (cloud) {
      const teacherusers = await new SchoolUserBusiness().getschoolteachersbyid(
        result.map((x) => x.schooluserid)
      );
      if (teacherusers.length <= 0) {
        throw new BadRequestException({
          error: true,
          errormessage: "No teachers available",
        });
      }

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

      const file = new FormData();
      file.append("importfile", zip.toBuffer(), "importfile.zip");
      const response = await axios.put(
        `${Config.fortyk.api.rpi.cloud}/import/teachers`,
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
  async deleteuser(@Param("schooluserid") schooluserid: string): Promise<any> {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      await new SchoolUserBusiness().deleteschooluser(schooluserid, tnx);
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
}
