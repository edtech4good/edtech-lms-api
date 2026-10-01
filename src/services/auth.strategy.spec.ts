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
const getGradesWithFilter = jest.fn().mockResolvedValue([]);
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({ tokenExists })),
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
  organisationid: null,
  isplatform: false,
});

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
    tokenExists.mockResolvedValue(true);
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

  it("accepts organisationid: null with isplatform: false (a staff user with no organisation yet)", async () => {
    await get(staff({ organisationid: null, isplatform: false })).expect(200);
    expect(getGradesWithFilter).toHaveBeenCalledTimes(1);
  });

  it("accepts a platform token (null organisation, isplatform true) and one acting as an organisation", async () => {
    await get(staff({ organisationid: null, isplatform: true })).expect(200);
    await get(staff({ organisationid: "33333333-3333-4333-8333-333333333333", isplatform: true })).expect(200);
    expect(getGradesWithFilter).toHaveBeenCalledTimes(2);
  });

  it("accepts an organisation's staff token", async () => {
    await get(staff({ organisationid: "33333333-3333-4333-8333-333333333333", isplatform: false })).expect(200);
  });

  it("still refuses a revoked token (not in the tokens table) with the claims present", async () => {
    tokenExists.mockResolvedValue(false);
    await get(staff({ organisationid: null, isplatform: false })).expect(401);
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

  it("a school-user token that DOES carry organisation claims is not treated as staff and is unaffected", async () => {
    const teacher = sign_({
      schooluserid: "teacher-1",
      schooluserrole: SchoolRole.TEACHER,
      organisationid: null,
      isplatform: true,
    });
    await get(teacher).expect(200);
  });

  it("refuses a token with neither a staff id nor a school-user id and no claims", async () => {
    await get(sign_({ sub: "someone" })).expect(401);
  });
});

describe("hasOrganisationClaims", () => {
  it("is true only for organisationid string|null AND isplatform boolean", () => {
    expect(hasOrganisationClaims({ organisationid: null, isplatform: false })).toBe(true);
    expect(hasOrganisationClaims({ organisationid: "x", isplatform: true })).toBe(true);
    expect(hasOrganisationClaims({ isplatform: false })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: null })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: undefined, isplatform: false })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: null, isplatform: undefined })).toBe(false);
    expect(hasOrganisationClaims({ organisationid: 1, isplatform: false })).toBe(false);
    expect(hasOrganisationClaims({})).toBe(false);
    expect(hasOrganisationClaims(null)).toBe(false);
    expect(hasOrganisationClaims(undefined)).toBe(false);
    expect(hasOrganisationClaims("token")).toBe(false);
  });
});
