import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config } from "src/config";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { SchoolContributeController } from "./school-contribute.controller";

/**
 * Requires view_school_contribution on the school-contribute (fee collection)
 * reads:
 *   GET school-contribute/all
 *   GET school-contribute/getallschooldashboard
 *   GET school-contribute/getschooldashboardid/:schoolid
 *   GET school-contribute/getschooldashboard/schoolcontributeid/:id
 *   GET school-contribute/getschoolcontribute/:schoolid
 *   GET school-contribute/getallschoolcontribute
 *   POST school-contribute/getallschoolcontribute/:schoolid
 * Refs #91.
 *
 * Driven over real HTTP through the real JWT strategy and guards, in the
 * style of src/modules/import/import.guard.spec.ts.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    // The staff-token check is one database query in production; here it answers like the token lookup.
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const getSchoolDashboardCountry = jest.fn().mockResolvedValue([]);
const getAllSchooldashboard = jest.fn().mockResolvedValue([]);
const getSchooldashboard = jest.fn().mockResolvedValue([]);
const getschoolcontributeid = jest.fn().mockResolvedValue({});
const getOwnedSchoolContribute = jest.fn().mockResolvedValue({});
const getAllSchoolContribute = jest.fn().mockResolvedValue([]);
const getAllSchoolContributeId = jest.fn().mockResolvedValue({ rows: [], count: 0 });

jest.mock("../../business/schoolcontribute.business", () => ({
  SchoolcontributeBusiness: jest.fn().mockImplementation(() => ({
    getSchoolDashboardCountry,
    getAllSchooldashboard,
    getSchooldashboard,
    getschoolcontributeid,
    getOwnedSchoolContribute,
    getAllSchoolContribute,
    getAllSchoolContributeId,
  })),
}));

const buildToken = (roles: Array<string>, permissions: Array<string>) =>
  `Bearer ${sign(
    {
      jti: "test-jti",
      lmsuserid: "u1",
      lmsuserroles: roles,
      permissions,
      // The organisation claims every staff token carries: a user of an organisation (the reads are limited to it).
      organisationid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      isplatform: false,
    },
    Config.fortyk.api.applicationsecret,
    { expiresIn: "5m" }
  )}`;

// A "User"-role token: none of these routes had a role list either, so
// before the fix a User account - zero RBAC permissions - could already
// read every one of them.
const userNoPermission = buildToken([Role.user], []);
const userWithPermission = buildToken([Role.user], ["view_school_contribution"]);
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

// getschooldashboardid/:schoolid and getschooldashboard/schoolcontributeid/:id
// are schema-validated as UUIDs (school-contribute.request.validator.ts);
// getschoolcontribute/:schoolid carries no such validator.
const SCHOOL_UUID = "84796237-5b21-495d-845b-901ed4a3cb71";
const CONTRIBUTE_UUID = "a1b2c3d4-1234-4a1b-8c1d-1234567890ab";

const GET_ROUTES: Array<[string, jest.Mock]> = [
  ["/school-contribute/all", getSchoolDashboardCountry],
  ["/school-contribute/getallschooldashboard", getAllSchooldashboard],
  [`/school-contribute/getschooldashboardid/${SCHOOL_UUID}`, getSchooldashboard],
  [`/school-contribute/getschooldashboard/schoolcontributeid/${CONTRIBUTE_UUID}`, getschoolcontributeid],
  ["/school-contribute/getschoolcontribute/school-1", getOwnedSchoolContribute],
  ["/school-contribute/getallschoolcontribute", getAllSchoolContribute],
];

describe("School-contribute read routes require view_school_contribution", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SchoolContributeController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
    [
      getSchoolDashboardCountry,
      getAllSchooldashboard,
      getSchooldashboard,
      getschoolcontributeid,
      getOwnedSchoolContribute,
      getAllSchoolContribute,
      getAllSchoolContributeId,
    ].forEach((m) => m.mockClear());
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(GET_ROUTES)("GET %s refuses a User token without the permission with 403", async (path, mock) => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", userNoPermission)
      .expect(403);
    expect(mock).not.toHaveBeenCalled();
  });

  it.each(GET_ROUTES)("GET %s passes a token holding the permission, and the business call runs", async (path, mock) => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", userWithPermission)
      .expect(200);
    expect(mock).toHaveBeenCalled();
  });

  it.each(GET_ROUTES)("GET %s passes a Super Admin token via the synthetic superadmin wildcard", async (path, mock) => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", superadminWildcard)
      .expect(200);
    expect(mock).toHaveBeenCalled();
  });

  it.each(GET_ROUTES)("GET %s refuses no token with 401", async (path, mock) => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(mock).not.toHaveBeenCalled();
  });

  it.each(GET_ROUTES)("GET %s refuses a school-user (teacher) token with 403", async (path, mock) => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", schoolTeacherToken)
      .expect(403);
    expect(mock).not.toHaveBeenCalled();
  });

  describe("POST school-contribute/getallschoolcontribute/:schoolid", () => {
    // showscholcontribute validates :schoolid as a UUID.
    const path = `/school-contribute/getallschoolcontribute/${SCHOOL_UUID}`;

    it("refuses a User token without the permission with 403", async () => {
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", userNoPermission)
        .send({})
        .expect(403);
      expect(getAllSchoolContributeId).not.toHaveBeenCalled();
    });

    it("passes a token holding the permission, and the business call runs", async () => {
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", userWithPermission)
        .send({})
        .expect(200);
      expect(getAllSchoolContributeId).toHaveBeenCalled();
    });

    it("passes a Super Admin token via the synthetic superadmin wildcard", async () => {
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", superadminWildcard)
        .send({})
        .expect(200);
      expect(getAllSchoolContributeId).toHaveBeenCalled();
    });

    it("refuses no token with 401", async () => {
      await request(app.getHttpServer()).post(path).send({}).expect(401);
      expect(getAllSchoolContributeId).not.toHaveBeenCalled();
    });

    it("refuses a school-user (teacher) token with 403", async () => {
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", schoolTeacherToken)
        .send({})
        .expect(403);
      expect(getAllSchoolContributeId).not.toHaveBeenCalled();
    });
  });
});
