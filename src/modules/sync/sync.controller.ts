import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Response,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import AdmZip from "adm-zip";
import axios from "axios";
import FormData from "form-data";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { SyncBusiness } from "src/business/sync.business";
import { Config } from "src/config";
import { AccessGuard } from "src/guards/access.guard";
import { Role, TokenType } from "src/models/enums";

@ApiTags("Sync")
@Controller("sync")
@ApiBearerAuth()
export class SyncController {

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
  async sync(@Response({ passthrough: true }) res: any) {
    const zip = new AdmZip();
    zip.addFile(
      "syncfile.ini",
      Buffer.from(await new SyncBusiness().synconline())
    );
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sync-data.zip"`,
    });
    return new StreamableFile(zip.toBuffer());
  }

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
  async syncContent(@Response({ passthrough: true }) res: any) {
    const zip = new AdmZip();
    zip.addFile(
      "syncfile.ini",
      Buffer.from(await new SyncBusiness().syncontentVersion2())
    );
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sync-data.zip"`,
    });
    return new StreamableFile(zip.toBuffer());
  }

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
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.admin, Role.superadmin))
  @HttpCode(HttpStatus.OK)
  async synconline() {
    const zip = new AdmZip();
    zip.addFile(
      "syncfile.ini",
      Buffer.from(await new SyncBusiness().syncontentVersion2())
    );
    const file = new FormData();
    file.append("importfile", zip.toBuffer(), "importfile.zip");
    const response = await axios.put(
      `${Config.fortyk.api.rpi.cloud}/import/master`,
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
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.admin, Role.superadmin))
  @HttpCode(HttpStatus.OK)
  async synconlineschool(@Param("schoolname") schoolname: string) {
    const studentusers =
      await new SchoolUserBusiness().getschooluserbyschoolname(
        schoolname.trim(),
        true
      );
    if (studentusers.length <= 0) {
      throw new BadRequestException({
        error: true,
        errormessage: "No student available",
      });
    }

    const zip = new AdmZip();
    zip.addFile(
      "students.ini",
      Buffer.from(
        JSON.stringify({
          studentusers: studentusers ? studentusers.map((x) => x.get({ plain: true })) : []
        }),
        "utf8"
      )
    );

    const file = new FormData();
    file.append("importfile", zip.toBuffer(), "importfile.zip");
    const response = await axios.put(
      `${Config.fortyk.api.rpi.cloud}/import/students`,
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
}
