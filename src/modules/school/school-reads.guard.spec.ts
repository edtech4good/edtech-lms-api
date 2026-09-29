import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config } from "src/config";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { SchoolController } from "./school.controller";

/**
 * Requires view_school on GET school/all and GET school/curriculumid, like
 * the other school reads. Refs #91.
 *
 * Driven over real HTTP through the real JWT strategy and guards, in the
 * style of src/modules/import/import.guard.spec.ts.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({ tokenExists })),
}));

const getSchoolsWithFilter = jest.fn().mockResolvedValue([]);
jest.mock("../../business/school.business", () => ({
  SchoolBusiness: jest.fn().mockImplementation(() => ({
    getSchoolsWithFilter,
  })),
}));

const buildToken = (roles: Array<string>, permissions: Array<string>) =>
  `Bearer ${sign(
    {
      jti: "test-jti",
      lmsuserid: "u1",
      lmsuserroles: roles,
      permissions,
    },
    Config.fortyk.api.applicationsecret,
    { expiresIn: "5m" }
  )}`;

// A "User"-role token: this route had NO role list, so before the fix a User
// account - RBAC permissions: none, per docs/authorization-model.md - could
// already read this endpoint. Used to prove that account is now refused.
const userNoPermission = buildToken([Role.user], []);
const userWithPermission = buildToken([Role.user], ["view_school"]);
const superadminWildcard = buildToken([Role.superadmin], ["superadmin"]);

// A school-user (teacher) token, shaped the way generateTeacherAuthToken
// issues it: schooluserid/schooluserrole, no lmsuserroles, no permissions.
const schoolTeacherToken = `Bearer ${sign(
  {
    jti: "test-jti",
    schooluserid: "school-user-1",
    schooluserrole: 3,
  },
  Config.fortyk.api.applicationsecret,
  { expiresIn: "5m" }
)}`;

const ROUTES: Array<[string, string]> = [
  ["/school/all", "GET school/all"],
  ["/school/curriculumid", "GET school/curriculumid"],
];

describe("School read routes require view_school", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SchoolController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
    getSchoolsWithFilter.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ROUTES)("%s refuses a User token without view_school with 403", async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", userNoPermission)
      .expect(403);
    expect(getSchoolsWithFilter).not.toHaveBeenCalled();
  });

  it.each(ROUTES)("%s passes a token holding view_school, and the business call runs", async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", userWithPermission)
      .expect(200);
    expect(getSchoolsWithFilter).toHaveBeenCalled();
  });

  it.each(ROUTES)("%s passes a Super Admin token via the synthetic superadmin wildcard", async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", superadminWildcard)
      .expect(200);
    expect(getSchoolsWithFilter).toHaveBeenCalled();
  });

  it.each(ROUTES)("%s refuses no token with 401", async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(getSchoolsWithFilter).not.toHaveBeenCalled();
  });

  it.each(ROUTES)("%s refuses a school-user (teacher) token with 403", async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", schoolTeacherToken)
      .expect(403);
    expect(getSchoolsWithFilter).not.toHaveBeenCalled();
  });
});
