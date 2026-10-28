import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ALL_UPDATE_PERMISSIONS, ALL_VIEW_PERMISSIONS, deleteTranslations, listTranslations, putTranslations } from "src/business/content-translations";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { RejectPrototypeKeysInterceptor } from "src/interceptors/rejectprototypekeys.interceptor";
import { TokenType } from "src/models/enums";
import { deletetranslations, puttranslations, showtranslations } from "./translations.request.validator";
import { TranslationsPutRequest } from "./models/TranslationsRequest";

/**
 * Translations of content text (bilingual content). Each route is for one row of one translatable table
 * (curriculums, grades, levels, lessons, lessonlearnings, lessonpractices, lessonquizzes, lessonplans, questions) and
 * needs the update (or, to read, the view) permission of that table's own entity, which the handler checks first
 * (the guard admits a holder of any of them). The row must be in the caller's organisation; another organisation's
 * row, and one that is gone, answer as an absent row does. See src/business/content-translations.ts.
 */
@ApiTags("Translations")
@Controller("translations")
@ApiBearerAuth()
export class TranslationsController {
  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Get(":tablename/:rowid")
  @ApiResponse({ status: 200, description: "Every translation of the row, in every language; `stale: true` when the row's text has changed since it was translated" })
  @ApiResponse({ status: 400, description: "That kind of content can't be translated" })
  @ApiResponse({ status: 403, description: "No view permission for that kind of content" })
  @ApiResponse({ status: 404, description: "No such row" })
  @ApiParam({ name: "tablename", type: "string", required: true })
  @ApiParam({ name: "rowid", type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(showtranslations))
  @RequirePermissions(...ALL_VIEW_PERMISSIONS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async list(@Param("tablename") tablename: string, @Param("rowid") rowid: string, @Org() org: OrgContext) {
    return { error: false, data: await listTranslations(org, tablename, rowid) };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Put(":tablename/:rowid")
  @ApiResponse({ status: 200, description: "The translations saved, each with the hash of the text it translated" })
  @ApiResponse({
    status: 400,
    description:
      "The organisation has no content language yet, the language is its own, a text can't be translated (not on the list, or graded by an answer), or it names an option, partner, distractor or message the question doesn't have",
  })
  @ApiResponse({ status: 403, description: "No update permission for that kind of content" })
  @ApiResponse({ status: 404, description: "No such row" })
  @ApiParam({ name: "tablename", type: "string", required: true })
  @ApiParam({ name: "rowid", type: "string", required: true })
  @ApiBody({ type: TranslationsPutRequest })
  @UseInterceptors(new RejectPrototypeKeysInterceptor(), new SchemaValidationInterceptor(puttranslations))
  @RequirePermissions(...ALL_UPDATE_PERMISSIONS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async put(
    @Param("tablename") tablename: string,
    @Param("rowid") rowid: string,
    @Body() body: TranslationsPutRequest,
    @Org() org: OrgContext,
  ) {
    return { error: false, data: await putTranslations(org, tablename, rowid, body) };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
  @Delete(":tablename/:rowid/:language")
  @ApiResponse({ status: 200, description: "Every translation of the row in that language is removed (none is not an error)" })
  @ApiResponse({ status: 403, description: "No update permission for that kind of content" })
  @ApiResponse({ status: 404, description: "No such row" })
  @ApiParam({ name: "tablename", type: "string", required: true })
  @ApiParam({ name: "rowid", type: "string", required: true })
  @ApiParam({ name: "language", type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(deletetranslations))
  @RequirePermissions(...ALL_UPDATE_PERMISSIONS)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param("tablename") tablename: string,
    @Param("rowid") rowid: string,
    @Param("language") language: string,
    @Org() org: OrgContext,
  ) {
    return { error: false, data: await deleteTranslations(org, tablename, rowid, language) };
  }
}
