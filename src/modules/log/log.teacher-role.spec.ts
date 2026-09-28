import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import AdmZip from "adm-zip";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { LogController } from "./log.controller";

/**
 * `PUT log/import` used to accept any school-user token that merely carried
 * a `schooluserid` - including a student's, since `auth/school/login`
 * (`AuthBusiness.teacherlogin`) never checked `schooluserrole` either. A
 * student token could overwrite or invent progress for any student in any
 * school (workspace#78, private). Fixed at both ends: the login route now
 * refuses a student account, and `LogBusiness.recordSyncActivity` asserts
 * the role again here, defence in depth, so a school-token route never has
 * to trust that the token in front of it was minted after the login fix.
 *
 * Driven over real HTTP through the real JWT strategy with signed tokens.
 * The token-table lookup and the `schoolusers` row lookup are stubbed (no
 * database here); the transaction and its commit/rollback are stubbed too,
 * so a failing run can never touch a real database or upload to S3.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({ tokenExists })),
}));

const schoolUserFindOne = jest.fn();
jest.mock("src/models/data-models/schoolusers", () => ({
  schoolusers: { findOne: (...args: any[]) => schoolUserFindOne(...args) },
}));

// recordSyncActivity writes a `syncs` row once the role check passes (the
// teacher case below) - stubbed so that never touches a real Sequelize
// model/DB either.
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

// A minimal real zip, so unzipper's `Open.buffer` succeeds and the request
// reaches `recordSyncActivity` (called before any file is read). Its one
// entry is neither `log.ini` nor `RPI-API`, so a token that gets past the
// role check still fails afterwards - with FILE_REJECTED, not a role error -
// proving it reached the file-content stage rather than being let all the
// way through.
const zip = new AdmZip();
zip.addFile("junk.txt", Buffer.from("not a real log"));
const zipBuffer = zip.toBuffer();

describe("PUT log/import enforces the teacher role on a school-user token", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LogController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
    schoolUserFindOne.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuses a student's school-user token with 403, before any file is read", async () => {
    schoolUserFindOne.mockResolvedValue({
      schooluserid: "student-1",
      schooluserrole: SchoolRole.STUDENT,
    });

    const res = await request(app.getHttpServer())
      .put("/log/import")
      .set("Authorization", studentToken)
      .attach("importfile", zipBuffer, "log.zip")
      .expect(403);

    expect(res.body.code).toBe("NOT_ALLOWED");
  });

  it("lets a teacher's school-user token reach file-content validation (unchanged)", async () => {
    schoolUserFindOne.mockResolvedValue({
      schooluserid: "teacher-1",
      schooluserrole: SchoolRole.TEACHER,
    });

    const res = await request(app.getHttpServer())
      .put("/log/import")
      .set("Authorization", teacherToken)
      .attach("importfile", zipBuffer, "log.zip")
      .expect(400);

    // FILE_REJECTED, not NOT_ALLOWED: the role gate let the teacher through
    // and the request failed for an unrelated reason (this test's zip has
    // no recognisable content), not because of their role.
    expect(res.body.code).toBe("FILE_REJECTED");
  });

  it("refuses no token with 401", async () => {
    await request(app.getHttpServer())
      .put("/log/import")
      .attach("importfile", zipBuffer, "log.zip")
      .expect(401);
  });
});
