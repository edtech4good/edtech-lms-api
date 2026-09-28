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
import { JwtAccessStrategy } from "./auth.strategy";

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
 * ACCESS-guarded route in one place. (workspace#78, workspace#80, private.)
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
