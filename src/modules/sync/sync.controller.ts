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
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import AdmZip from "adm-zip";
import { pushToCloud, rostersNameTheirSchool, studentsFile } from "src/business/cloud-push";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { findOwnedSchool, resolveOwnedSchoolSegment } from "src/business/school-scope";
import { SyncBusiness } from "src/business/sync.business";
import { planContentSync } from "src/business/sync-target";
import { AccessGuard } from "src/guards/access.guard";
import { Role, TokenType } from "src/models/enums";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";

const zipped = (json: string) => {
  const zip = new AdmZip();
  zip.addFile("syncfile.ini", Buffer.from(json));
  return new StreamableFile(zip.toBuffer());
};

@ApiTags("Sync")
@Controller("sync")
@ApiBearerAuth()
export class SyncController {

  @OrgPolicy("server", { note: "Authenticated only by the application API key; must be served as platform until the key is retired or scoped." })
  @Get("report-data")
  @ApiResponse({
    status: 200,
    description: "Sync exported sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting Sync",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey))
  async getReportData(@Response({ passthrough: true }) res: any) {
    const zip = new AdmZip();
    zip.addFile(
      "syncfile.ini",
      Buffer.from(await new SyncBusiness().getreportdata())
    );
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sync-data.zip"`,
    });
    return new StreamableFile(zip.toBuffer());
  }

  @OrgPolicy("owned", {
    note: "The whole platform's content in the older shape, which carries no organisation: a platform user who is not acting as an organisation only. School-user tokens pass the guards but @Org() answers 401.",
    enforcedBy: "src/modules/sync/sync-scope.leak.spec.ts",
  })
  @Get("")
  @ApiResponse({
    status: 200,
    description: "Sync exported sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting Sync",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessGuard(TokenType.ACCESS))
  async sync(
    @Response({ passthrough: true }) res: any,
    @Org() org: OrgContext,
    @Query("organisationid") organisationid?: unknown,
  ) {
    // This file has no header naming an organisation, and the student API reads such a file as the WHOLE platform's content
    // (it replaces everything it holds). So it is served to the platform, not acting as an organisation, only: the same rule
    // as format 2 of `sync/content`.
    await planContentSync(org, { organisationid, format: 2 });
    const file = zipped(await new SyncBusiness().synconline());
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sync-data.zip"`,
    });
    return file;
  }

  @OrgPolicy("owned", {
    note: "One organisation's content (format 3); a platform user who is not acting as an organisation must name the organisation, and can ask for the whole platform's in format 2.",
    enforcedBy: "src/modules/sync/sync-scope.leak.spec.ts",
  })
  @Get("content")
  @ApiResponse({
    status: 200,
    description: "Sync exported sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while exporting Sync",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessGuard(TokenType.ACCESS))
  async syncContent(
    @Response({ passthrough: true }) res: any,
    @Org() org: OrgContext,
    @Query("organisationid") organisationid?: unknown,
    @Query("format") format?: unknown,
  ) {
    const plan = await planContentSync(org, { organisationid, format });
    const sync = new SyncBusiness();
    const file = zipped(plan.format === 2 ? await sync.syncontentVersion2() : await sync.syncontentVersion3(plan.organisation));
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sync-data.zip"`,
    });
    return file;
  }

  @OrgPolicy("owned", {
    note: "Pushes one organisation's content (format 3) with the organisation named in the request header; a platform user who is not acting as an organisation must name the organisation, and can ask for the whole platform's in format 2.",
    enforcedBy: "src/modules/sync/sync-scope.leak.spec.ts",
  })
  @Post("cloud")
  @ApiResponse({
    status: 200,
    description: "Sync to cloud sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while Syncing cloud",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  // Not Role.organisationadmin: this pushes to the cloud server with the server key.
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.admin, Role.superadmin))
  @HttpCode(HttpStatus.OK)
  async synconline(@Org() org: OrgContext, @Body() body?: { organisationid?: unknown; format?: unknown }) {
    const plan = await planContentSync(org, { organisationid: body?.organisationid, format: body?.format });
    const sync = new SyncBusiness();
    if (plan.format === 2) {
      return pushToCloud("master", "syncfile.ini", await sync.syncontentVersion2());
    }
    return pushToCloud("master", "syncfile.ini", await sync.syncontentVersion3(plan.organisation), plan.organisation.organisationid);
  }

  @OrgPolicy("owned", {
    note: "Pushes only the learners of one school of the caller's organisation, with that school's organisation named in the request header.",
    enforcedBy: "src/modules/sync/sync-scope.leak.spec.ts",
  })
  @Post("cloud/:schoolname/students")
  @ApiResponse({
    status: 200,
    description: "Sync to cloud students sucesfully",
  })
  @ApiResponse({
    status: 400,
    description: "Error while Syncing cloud",
  })
  @ApiResponse({
    status: 500,
    description: "Server error",
  })
  // Not Role.organisationadmin: this pushes to the cloud server with the server key.
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.admin, Role.superadmin))
  @HttpCode(HttpStatus.OK)
  async synconlineschool(@Param("schoolname") schoolname: string, @Org() org: OrgContext) {
    // The segment names the school by NAME (as before) or by id, among the caller's schools; resolved once, here.
    const found = await resolveOwnedSchoolSegment(org, schoolname, { forRead: true });
    const school = await findOwnedSchool(org, found.schoolid, { includeDeleted: true });
    const studentusers = await new SchoolUserBusiness().getschooluserbyschoolid(school.schoolid, true, {
      withSchoolId: rostersNameTheirSchool(),
    });
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
}
