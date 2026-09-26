import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config } from "src/config";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { SyncController } from "../sync/sync.controller";
import { ImportController } from "./import.controller";

/**
 * A Teacher can't bulk-import or push to the student API.
 *
 * The student API's own imports (`PUT import/master`, `import/students`,
 * `import/teachers`) accepted any teacher's app token until edtech-lms-rpi-api
 * limited them to the server sync key. The central routes that feed them, and
 * central's own roster import, are gated by role or RBAC permission instead.
 * These tests lock that in for the Teacher role, whose permissions include
 * `view_import` but not `create_import` / `update_import`.
 *
 * Driven over real HTTP through the real JWT strategy with signed tokens. The
 * token-table lookup is stubbed (no database here). Every request below is one
 * the guards must stop. In case a guard regresses, the sync handlers' content
 * build and their outbound push are stubbed too, so a failing run can never
 * push a zip to a real student API.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({ tokenExists })),
}));
jest.mock("src/business/sync.business", () => ({
  SyncBusiness: jest.fn().mockImplementation(() => ({
    syncontentVersion2: async () => "",
  })),
}));
jest.mock("src/business/schooluser.business", () => ({
  SchoolUserBusiness: jest.fn().mockImplementation(() => ({
    getschooluserbyschoolname: async () => [],
  })),
}));
jest.mock("axios", () => ({
  __esModule: true,
  default: { put: jest.fn().mockResolvedValue({ status: 200 }) },
}));

const teacher = `Bearer ${sign(
  {
    jti: "test-jti",
    lmsuserid: "teacher-1",
    lmsuserroles: [Role.teacher],
    permissions: ["view_import"],
  },
  Config.fortyk.api.applicationsecret,
  { expiresIn: "5m" }
)}`;

const ROUTES: Array<[string, string]> = [
  ["put", "/import/Demo School/teachers"],
  ["post", "/sync/cloud"],
  ["post", "/sync/cloud/Demo School/students"],
];

describe("Teacher can't bulk-import or push to the student API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ImportController, SyncController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
  });

  afterAll(async () => {
    await app.close();
  });

  const call = (method: string, path: string) =>
    (request(app.getHttpServer()) as any)[method](encodeURI(path));

  it.each(ROUTES)("%s %s refuses a Teacher token with 403", async (method, path) => {
    await call(method, path).set("Authorization", teacher).expect(403);
  });

  it.each(ROUTES)("%s %s refuses no token with 401", async (method, path) => {
    await call(method, path).expect(401);
  });

  it.each(ROUTES)("%s %s refuses the student API's server sync key with 401", async (method, path) => {
    await call(method, path)
      .set("Authorization", Config.fortyk.api.serversynckey)
      .expect(401);
  });
});
