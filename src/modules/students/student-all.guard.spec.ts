import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config } from "src/config";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { StudentController } from "./student.controller";

/**
 * Adds the same view_student check the other student reads carry, on top of
 * the class-level role guard on StudentController (apikey/superadmin/admin).
 * Refs workspace#80 (private).
 *
 * Driven over real HTTP through the real JWT strategy and guards, in the
 * style of src/modules/import/import.guard.spec.ts.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({ tokenExists })),
}));

const getStudentsWithFilter = jest.fn().mockResolvedValue([]);
jest.mock("src/business/student.business", () => ({
  StudentBusiness: jest.fn().mockImplementation(() => ({
    getStudentsWithFilter,
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

const adminNoPermission = buildToken([Role.admin], []);
const adminWithPermission = buildToken([Role.admin], ["view_student"]);
const superadminWildcard = buildToken([Role.superadmin], ["superadmin"]);

describe("GET student/all requires view_student", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StudentController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
    getStudentsWithFilter.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuses an Admin token without view_student with 403", async () => {
    await request(app.getHttpServer())
      .get("/student/all")
      .set("Authorization", adminNoPermission)
      .expect(403);
    expect(getStudentsWithFilter).not.toHaveBeenCalled();
  });

  it("passes an Admin token holding view_student, and the business call runs", async () => {
    await request(app.getHttpServer())
      .get("/student/all")
      .set("Authorization", adminWithPermission)
      .expect(200);
    expect(getStudentsWithFilter).toHaveBeenCalled();
  });

  it("passes a Super Admin token via the synthetic superadmin wildcard", async () => {
    await request(app.getHttpServer())
      .get("/student/all")
      .set("Authorization", superadminWildcard)
      .expect(200);
    expect(getStudentsWithFilter).toHaveBeenCalled();
  });

  it("refuses no token with 401", async () => {
    await request(app.getHttpServer()).get("/student/all").expect(401);
    expect(getStudentsWithFilter).not.toHaveBeenCalled();
  });
});
