import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { CertificateBusiness, verifyCertificate } from "src/business/certificate.business";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { User } from "src/decorators/user.decorator";
import { AccessGuard } from "src/guards/access.guard";
import { CheckPermissionsGuard } from "src/guards/checkPermission.guard";
import { SchemaValidationInterceptor } from "src/interceptors";
import { TokenType } from "src/models/enums";
import { Permission } from "src/models/enums/permissions.enum";
import { LmsUserToken } from "src/models/token.model";
import {
  certificatecandidates,
  issuecertificates,
  revokecertificate,
  showcertificate,
  showstudentcertificates,
} from "./certificate.request.validator";

/**
 * Certificates, for staff. Organisation-scoped like every staff route: the acting organisation's curricula, learners and
 * certificates only; another organisation's answers as an absent row does. Whether a learner may be certified is the
 * learning server's answer (src/business/certificate.business.ts), asked again when a certificate is issued.
 */
@ApiTags("Certificate")
@Controller("certificate")
@ApiBearerAuth()
export class CertificateController {
  @OrgPolicy("owned", { enforcedBy: "src/modules/certificate/certificate.leak.spec.ts" })
  @Post("candidates")
  @ApiResponse({ status: 200, description: "The learners enrolled in the curriculum (and the class), each issued, ready, not yet or can't be checked, with the reasons" })
  @ApiResponse({ status: 400, description: "The curriculum does not give certificates for that tier (scope), or the scope id is not part of it (scopeid)" })
  @ApiResponse({ status: 404, description: "The curriculum is not the caller's" })
  @ApiResponse({ status: 502, description: "The learning server could not be asked; nothing changed" })
  @ApiBody({ required: true })
  @UseInterceptors(new SchemaValidationInterceptor(certificatecandidates))
  @RequirePermissions(Permission.LIST_CERTIFICATE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async candidates(@Body() body: { curriculumid: string; scope: "level" | "grade" | "curriculum"; scopeid: string; standardid?: string }, @Org() org: OrgContext) {
    return { error: false, data: await new CertificateBusiness(org).candidates(body) };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/certificate/certificate.leak.spec.ts" })
  @Post("issue")
  @ApiResponse({ status: 200, description: "`issued`: the certificates made; `refused`: the learners that got none, with the status and reasons" })
  @ApiResponse({ status: 400, description: "The curriculum does not give certificates for that tier (scope), or the scope id is not part of it (scopeid)" })
  @ApiResponse({ status: 404, description: "The curriculum is not the caller's" })
  @ApiResponse({ status: 502, description: "The learning server could not be asked; nothing was issued" })
  @ApiBody({ required: true })
  @UseInterceptors(new SchemaValidationInterceptor(issuecertificates))
  @RequirePermissions(Permission.CREATE_CERTIFICATE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async issue(
    @Body() body: { curriculumid: string; scope: "level" | "grade" | "curriculum"; scopeid: string; studentids: string[] },
    @User() user: LmsUserToken,
    @Org() org: OrgContext,
  ) {
    return { error: false, data: await new CertificateBusiness(org).issue(body, user.lmsuserid) };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/certificate/certificate.leak.spec.ts" })
  @Post(":certificateid/revoke")
  @ApiResponse({ status: 200, description: "The certificate, revoked" })
  @ApiResponse({ status: 400, description: "No reason (1 to 500 characters)" })
  @ApiResponse({ status: 404, description: "No such certificate" })
  @ApiResponse({ status: 409, description: "Already revoked" })
  @ApiParam({ name: "certificateid", type: "string", required: true })
  @ApiBody({ required: true })
  @UseInterceptors(new SchemaValidationInterceptor(revokecertificate))
  @RequirePermissions(Permission.REVOKE_CERTIFICATE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async revoke(@Param("certificateid") certificateid: string, @Body() body: { reason: string }, @User() user: LmsUserToken, @Org() org: OrgContext) {
    return { error: false, data: await new CertificateBusiness(org).revoke(certificateid, body.reason, user.lmsuserid) };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/certificate/certificate.leak.spec.ts" })
  @Get("student/:studentid")
  @ApiResponse({ status: 200, description: "The learner's certificates, newest first, revoked ones included" })
  @ApiResponse({ status: 404, description: "No such learner" })
  @ApiParam({ name: "studentid", type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(showstudentcertificates))
  @RequirePermissions(Permission.LIST_CERTIFICATE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async forStudent(@Param("studentid") studentid: string, @Org() org: OrgContext) {
    return { error: false, data: await new CertificateBusiness(org).forStudent(studentid) };
  }

  @OrgPolicy("owned", { enforcedBy: "src/modules/certificate/certificate.leak.spec.ts" })
  @Get(":certificateid")
  @ApiResponse({ status: 200, description: "The certificate: snapshot, and the revoke fields with the reason" })
  @ApiResponse({ status: 404, description: "No such certificate" })
  @ApiParam({ name: "certificateid", type: "string", required: true })
  @UseInterceptors(new SchemaValidationInterceptor(showcertificate))
  @RequirePermissions(Permission.LIST_CERTIFICATE)
  @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
  @HttpCode(HttpStatus.OK)
  async get(@Param("certificateid") certificateid: string, @Org() org: OrgContext) {
    return { error: false, data: await new CertificateBusiness(org).get(certificateid) };
  }
}

/**
 * The public check of a certificate by its code. No sign-in: it answers with what the certificate itself says (its
 * snapshot) and nothing else, and a code that matches nothing and one that is not shaped like a code are the same 404.
 */
@ApiTags("Certificate")
@Controller("certificates")
export class CertificateVerifyController {
  @OrgPolicy("public", { note: "Answers with the certificate's snapshot only (or, when revoked, the status and time), for whoever holds the code." })
  @Get("verify/:shortcode")
  @ApiResponse({ status: 200, description: "`valid` with the snapshot's fields, or `revoked` with the time and the code" })
  @ApiResponse({ status: 404, description: "No certificate has that code (the same answer for a code that is not shaped like one)" })
  @ApiParam({ name: "shortcode", type: "string", required: true })
  @UseGuards(ThrottlerGuard)
  @Throttle(30, 60)
  @HttpCode(HttpStatus.OK)
  async verify(@Param("shortcode") shortcode: string) {
    return { error: false, data: await verifyCertificate(shortcode) };
  }
}
