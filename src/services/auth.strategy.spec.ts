import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import AdmZip from "adm-zip";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { GradeController } from "src/modules/grade/grade.controller";
import { LogController } from "src/modules/log/log.controller";
import { hasOrganisationClaims, JwtAccessStrategy } from "./auth.strategy";

/**
 * `JwtAccessStrategy.validate` used to hand back any ACCESS-token payload
 * unchecked, so a school-user token's role was only ever enforced by
 * whichever route happened to check it - `auth/school/login` and
 * `PUT log/import`, at the time. Every OTHER route guarded by
 * `AccessGuard(TokenType.ACCESS)` (most are read-only, e.g. `grade/all`)
 * accepted a student's token exactly like a teacher's. It also meant a
 * school-user token ALREADY ISSUED before the login/log-import fixes landed
 * stayed valid for its full lifetime regardless.
 *
 * Fixed at the strategy: a school-user token (has `schooluserid`) for a
 * non-staff role is refused at the JWT layer, before any controller or
 * guard downstream ever sees it - covering every current and future
 * ACCESS-guarded route in one place. (#90.)
 *
 * Driven over real HTTP through the real strategy with signed tokens; only
 * the token-table lookup and each route's business/DB dependencies are
 * stubbed.
 */
const tokenExists = jest.fn();
const validateStaffAccessToken = jest.fn();
const getGradesWithFilter = jest.fn().mockResolvedValue([]);
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => validateStaffAccessToken(...args),
  })),
  GradeBusiness: jest.fn().mockImplementation(() => ({
    getGradesWithFilter: (...args: any[]) => getGradesWithFilter(...args),
  })),
}));

const schoolUserFindOne = jest.fn();
jest.mock("src/models/data-models/schoolusers", () => ({
  schoolusers: { findOne: (...args: any[]) => schoolUserFindOne(...args) },
}));

const syncsCreate = jest.fn().mockResolvedValue({});
jest.mock("src/models/data-models/syncrecord", () => ({
  syncs: { create: (...args: any[]) => syncsCreate(...args) },
}));

const transaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("src/services/dbservice", () => ({
  dbinstance: { getdbinstance: () => ({ transaction: async () => transaction }) },
  rollbackQuietly: jest.fn(),
}));

const sign_ = (payload: Record<string, unknown>) =>
  `Bearer ${sign(
    { jti: "test-jti", ...payload },
    Config.fortyk.api.applicationsecret,
    { expiresIn: "5m" }
  )}`;

const studentToken = sign_({
  schooluserid: "student-1",
  schoolusername: "student1",
  schooluserrole: SchoolRole.STUDENT,
});
const teacherToken = sign_({
  schooluserid: "teacher-1",
  schoolusername: "teacher1",
  schooluserrole: SchoolRole.TEACHER,
});
// No `schooluserid` at all - an ordinary staff (lmsuser) login token. Must
// be completely unaffected by a check that only ever looks at
// `schooluserid`/`schooluserrole`.
const lmsuserToken = sign_({
  lmsuserid: "lmsuser-1",
  lmsusername: "admin@example.com",
  lmsuserroles: [],
  organisationid: "33333333-3333-4333-8333-333333333333",
  isplatform: false,
});

const ORG = "33333333-3333-4333-8333-333333333333";
const zip = new AdmZip();
zip.addFile("junk.txt", Buffer.from("not a real log"));
const zipBuffer = zip.toBuffer();

describe("JwtAccessStrategy refuses a non-staff school-user token on every ACCESS-guarded route", () => {
  let app: INestApplication;
  let originalLogImportEnabled: string | undefined;

  beforeAll(async () => {
    // Future-proofing against edtech-lms-api#89 (LOG_IMPORT_ENABLED),
    // whichever order the two PRs land in - see log.teacher-role.spec.ts.
    originalLogImportEnabled = process.env.LOG_IMPORT_ENABLED;
    process.env.LOG_IMPORT_ENABLED = "true";

    const moduleRef = await Test.createTestingModule({
      controllers: [LogController, GradeController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
    validateStaffAccessToken.mockResolvedValue(true);
    schoolUserFindOne.mockReset();
    schoolUserFindOne.mockResolvedValue({
      schooluserid: "teacher-1",
      schooluserrole: SchoolRole.TEACHER,
      isdisabled: false,
      isdeleted: false,
    });
    getGradesWithFilter.mockClear();
  });

  afterAll(async () => {
    if (originalLogImportEnabled === undefined) {
      delete process.env.LOG_IMPORT_ENABLED;
    } else {
      process.env.LOG_IMPORT_ENABLED = originalLogImportEnabled;
    }
    await app.close();
  });

  it("refuses a student school-user token with 401 on a read-only route (grade/all)", async () => {
    await request(app.getHttpServer())
      .get("/grade/all")
      .set("Authorization", studentToken)
      .expect(401);
    expect(getGradesWithFilter).not.toHaveBeenCalled();
  });

  it("refuses a student school-user token with 401 on PUT log/import", async () => {
    await request(app.getHttpServer())
      .put("/log/import")
      .set("Authorization", studentToken)
      .attach("importfile", zipBuffer, "log.zip")
      .expect(401);
  });

  it("leaves a teacher school-user token unaffected on grade/all", async () => {
    await request(app.getHttpServer())
      .get("/grade/all")
      .set("Authorization", teacherToken)
      .expect(200);
    expect(getGradesWithFilter).toHaveBeenCalledTimes(1);
  });

  it("leaves a teacher school-user token unaffected on log/import (reaches file validation)", async () => {
    const res = await request(app.getHttpServer())
      .put("/log/import")
      .set("Authorization", teacherToken)
      .attach("importfile", zipBuffer, "log.zip")
      .expect(400);
    expect(res.body.code).toBe("FILE_REJECTED");
  });

  it("leaves an lmsuser (non-school) token unaffected on grade/all", async () => {
    await request(app.getHttpServer())
      .get("/grade/all")
      .set("Authorization", lmsuserToken)
      .expect(200);
    expect(getGradesWithFilter).toHaveBeenCalledTimes(1);
  });
});

/**
 * Fail closed on old staff tokens. A staff (lmsusers) access token must carry
 * the organisation claims: `organisationid` (a string, or null for none - NOT
 * absent) and `isplatform` (a boolean). A token minted before they existed has
 * neither, so it is refused with 401 and its owner signs in again. School-user
 * tokens are a different shape and are not subject to this.
 */
describe("JwtAccessStrategy requires the organisation claims on a staff token", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GradeController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    tokenExists.mockReset();
    validateStaffAccessToken.mockReset();
    tokenExists.mockResolvedValue(true);
    validateStaffAccessToken.mockResolvedValue(true);
    getGradesWithFilter.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  const staff = (extra: Record<string, unknown>) =>
    sign_({ lmsuserid: "lmsuser-1", lmsusername: "admin@example.com", lmsuserroles: [], ...extra });

  const get = (token: string) =>
    request(app.getHttpServer()).get("/grade/all").set("Authorization", token);

  it("refuses a staff token with neither claim (minted before this change) with 401, and the route does not run", async () => {
    await get(staff({})).expect(401);
    expect(getGradesWithFilter).not.toHaveBeenCalled();
  });

  it("refuses a staff token that has isplatform but no organisationid at all (absent is not null)", async () => {
    await get(staff({ isplatform: false })).expect(401);
    expect(getGradesWithFilter).not.toHaveBeenCalled();
  });

  it("refuses a staff token that has organisationid but no isplatform", async () => {
    await get(staff({ organisationid: null })).expect(401);
    await get(staff({ organisationid: "33333333-3333-4333-8333-333333333333" })).expect(401);
    expect(getGradesWithFilter).not.toHaveBeenCalled();
  });

  it("refuses claims of the wrong type: isplatform as a string or number, organisationid as a number or object", async () => {
    await get(staff({ organisationid: null, isplatform: "false" })).expect(401);
    await get(staff({ organisationid: null, isplatform: 0 })).expect(401);
    await get(staff({ organisationid: 5, isplatform: false })).expect(401);
    await get(staff({ organisationid: {}, isplatform: false })).expect(401);
    expect(getGradesWithFilter).not.toHaveBeenCalled();
  });

  it("accepts organisationid: null with isplatform: false (a staff user with no organisation yet): the route, which limits content to an organisation, has none to limit to and refuses it (403, not 401)", async () => {
    await get(staff({ organisationid: null, isplatform: false })).expect(403);
    expect(getGradesWithFilter).not.toHaveBeenCalled();
  });

  it("accepts a platform token (null organisation, isplatform true) and one acting as an organisation", async () => {
    await get(staff({ organisationid: null, isplatform: true })).expect(200);
    await get(staff({ organisationid: "33333333-3333-4333-8333-333333333333", isplatform: true })).expect(200);
    expect(getGradesWithFilter).toHaveBeenCalledTimes(2);
  });

  it("accepts an organisation's staff token", async () => {
    await get(staff({ organisationid: "33333333-3333-4333-8333-333333333333", isplatform: false })).expect(200);
  });

  it("still refuses a revoked token (the per-request check says no) with the claims present", async () => {
    validateStaffAccessToken.mockResolvedValue(false);
    await get(staff({ organisationid: null, isplatform: false })).expect(401);
    expect(getGradesWithFilter).not.toHaveBeenCalled();
  });

  it("asks the per-request check about a staff token, with the verified payload, and never the plain token lookup", async () => {
    await get(staff({ organisationid: ORG, isplatform: false })).expect(200);
    expect(validateStaffAccessToken).toHaveBeenCalledTimes(1);
    expect(validateStaffAccessToken.mock.calls[0][0]).toMatchObject({
      lmsuserid: "lmsuser-1",
      organisationid: ORG,
      isplatform: false,
      jti: "test-jti",
    });
    expect(tokenExists).not.toHaveBeenCalled();
  });

  it("does not run the per-request staff check for a malformed staff token: the claims are checked first", async () => {
    await get(staff({})).expect(401);
    expect(validateStaffAccessToken).not.toHaveBeenCalled();
  });

  it("a school-user token keeps the plain token lookup and never reaches the staff check", async () => {
    const teacher = sign_({ schooluserid: "teacher-1", schooluserrole: SchoolRole.TEACHER });
    await get(teacher).expect(200);
    expect(tokenExists).toHaveBeenCalledTimes(1);
    expect(validateStaffAccessToken).not.toHaveBeenCalled();
    tokenExists.mockResolvedValue(false);
    await get(teacher).expect(401);
  });

  it("refuses organisationid that is the empty string, or not UUID-shaped", async () => {
    await get(staff({ organisationid: "", isplatform: false })).expect(401);
    await get(staff({ organisationid: "o1", isplatform: false })).expect(401);
    await get(staff({ organisationid: "33333333-3333-4333-8333-33333333333", isplatform: false })).expect(401);
    expect(validateStaffAccessToken).not.toHaveBeenCalled();
  });

  describe("mixed-shape tokens are refused", () => {
    const teacher = { schooluserid: "teacher-1", schooluserrole: SchoolRole.TEACHER };

    it("a school-user id together with a staff id", async () => {
      await get(sign_({ ...teacher, lmsuserid: "lmsuser-1" })).expect(401);
      await get(sign_({ ...teacher, lmsuserid: "lmsuser-1", organisationid: null, isplatform: true })).expect(401);
    });

    it("a school-user id together with either organisation claim", async () => {
      await get(sign_({ ...teacher, organisationid: null })).expect(401);
      await get(sign_({ ...teacher, isplatform: true })).expect(401);
      await get(sign_({ ...teacher, organisationid: ORG, isplatform: false })).expect(401);
      expect(getGradesWithFilter).not.toHaveBeenCalled();
    });

    it("the plain teacher token is still fine", async () => {
      await get(sign_(teacher)).expect(200);
    });
  });

  it("does not ask for the claims on a school-user (teacher) token: it keeps working unchanged", async () => {
    const teacher = sign_({
      schooluserid: "teacher-1",
      schoolusername: "teacher1",
      schooluserrole: SchoolRole.TEACHER,
    });
    await get(teacher).expect(200);
    expect(getGradesWithFilter).toHaveBeenCalledTimes(1);
  });

  it("refuses a token with neither a staff id nor a school-user id and no claims", async () => {
    await get(sign_({ sub: "someone" })).expect(401);
  });
});

describe("hasOrganisationClaims", () => {
  it("is true only for organisationid string|null AND isplatform boolean", () => {
    expect(hasOrganisationClaims({ organisationid: null, isplatform: false })).toBe(true);
    expect(hasOrganisationClaims({ isplatform: false })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: null })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: undefined, isplatform: false })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: null, isplatform: undefined })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: 1, isplatform: false })).toBe(false);
    // null or a UUID-shaped string only: the empty string and other text are not organisations
    expect(hasOrganisationClaims({ organisationid: "", isplatform: false })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: "x", isplatform: false })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: "33333333-3333-4333-8333-333333333333", isplatform: true })).toBe(true);
    expect(hasOrganisationClaims({})).toBe(false);
    expect(hasOrganisationClaims(null)).toBe(false);
    expect(hasOrganisationClaims(undefined)).toBe(false);
    expect(hasOrganisationClaims("token")).toBe(false);
  });
});
