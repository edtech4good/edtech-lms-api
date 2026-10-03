import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { INestApplication, RequestMethod } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { PlatformGuard } from "src/guards/platform.guard";
import { Role } from "src/models/enums";
import { AuthController } from "src/modules/auth/auth.controller";
import { CountryController } from "src/modules/country/country.controller";
import { CurriculumController } from "src/modules/curriculum/curriculum.controller";
import { LessonController } from "src/modules/lesson/lesson.controller";
import { LevelController } from "src/modules/level/level.controller";
import { OrganisationController } from "src/modules/organisation/organisation.controller";
import { RolePermissionController } from "src/modules/role-permission/role-perm.controller";
import { StandardController } from "src/modules/standard/standard.controller";
import { StudentController } from "src/modules/students/student.controller";
import { SyncController } from "src/modules/sync/sync.controller";
import { JwtAccessStrategy } from "src/services/auth.strategy";

/**
 * An Organisation Admin is refused on every one of the 18 platform routes, and
 * the refusal is PlatformGuard's: the token used here holds the role AND the
 * route's own permission, so nothing else stands in the way. (The role itself
 * is not granted the organisation permissions, `create_role`/`update_role`/
 * `delete_role` or the country writes, but a permission list is never the only
 * barrier on these routes.) For each route a platform user, as the control,
 * reaches the handler: the refusal is not a broken fixture.
 *
 * Also: a table of the routes is checked against the controllers' own guard
 * metadata, so a route that gains PlatformGuard later fails here until it is
 * listed. Driven over real HTTP through the real JWT strategy and the real
 * guards and controllers; only the business classes are replaced.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const mocks = {
  createcountry: jest.fn(),
  updatecountryName: jest.fn(),
  deletecountry: jest.fn(),
  isexistscountryID: jest.fn(),
  isexistscountryName: jest.fn(),
  countryIsBinded: jest.fn(),
  getAllcountries: jest.fn(),
  getcountryall: jest.fn(),
  getCurriculumsWithFilter: jest.fn(),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  deleterole: jest.fn(),
  isexistsroleID: jest.fn(),
  isexistsroleName: jest.fn(),
  checkRoleIsBinded: jest.fn(),
  autoupdatealllessonprogress: jest.fn(),
  updateLevelQuizPoints: jest.fn(),
  standardMigrate: jest.fn(),
  standardRemove: jest.fn(),
  studentMigrateStandards: jest.fn(),
  studentMigrateSubjectCurriculum: jest.fn(),
  getorganisationall: jest.fn(),
  getorganisationbyid: jest.fn(),
  createorganisation: jest.fn(),
  updateorganisation: jest.fn(),
  deleteorganisation: jest.fn(),
  isexistsorganisationname: jest.fn(),
  isexistsorganisationcode: jest.fn(),
  findunusablecountries: jest.fn(),
  switchOrganisation: jest.fn(),
  syncontentVersion2: jest.fn(),
  getschooluserbyschoolid: jest.fn(),
  cloudPut: jest.fn(),
};
// The cloud-sync and export routes resolve their `:schoolname` segment to a school first.
jest.mock("src/business/school-identity", () => ({
  ...jest.requireActual("src/business/school-identity"),
  resolveSchoolSegment: jest.fn(async (segment: string) => ({ schoolid: "school-1", schoolname: segment })),
}));
jest.mock("src/business/country.business", () => ({
  CountryBusiness: jest.fn().mockImplementation(() => ({
    createcountry: mocks.createcountry,
    updatecountryName: mocks.updatecountryName,
    deletecountry: mocks.deletecountry,
    isexistscountryID: mocks.isexistscountryID,
    isexistscountryName: mocks.isexistscountryName,
    countryIsBinded: mocks.countryIsBinded,
    getAllcountries: mocks.getAllcountries,
    getcountryall: mocks.getcountryall,
  })),
}));
jest.mock("src/business/curriculum.business", () => ({
  CurriculumBusiness: jest.fn().mockImplementation(() => ({
    getCurriculumsWithFilter: mocks.getCurriculumsWithFilter,
  })),
}));
jest.mock("src/business/role-permission.business", () => ({
  RolePermissionBusiness: jest.fn().mockImplementation(() => ({
    createRole: mocks.createRole,
    updateRole: mocks.updateRole,
    deleterole: mocks.deleterole,
    isexistsroleID: mocks.isexistsroleID,
    isexistsroleName: mocks.isexistsroleName,
    checkRoleIsBinded: mocks.checkRoleIsBinded,
  })),
}));
jest.mock("src/business/lesson.business", () => ({
  LessonBusiness: jest.fn().mockImplementation(() => ({
    autoupdatealllessonprogress: mocks.autoupdatealllessonprogress,
  })),
}));
jest.mock("src/business/level.business", () => ({
  LevelBusiness: jest.fn().mockImplementation(() => ({
    updateLevelQuizPoints: mocks.updateLevelQuizPoints,
  })),
}));
jest.mock("src/business/standard.business", () => ({
  StandardBusiness: jest.fn().mockImplementation(() => ({
    migrateStandards: mocks.standardMigrate,
    removeStandards: mocks.standardRemove,
  })),
}));
jest.mock("src/business/student.business", () => ({
  StudentBusiness: jest.fn().mockImplementation(() => ({
    migrateStandards: mocks.studentMigrateStandards,
    migrateSubjectCurriculum: mocks.studentMigrateSubjectCurriculum,
  })),
}));
jest.mock("src/business/organisation.business", () => ({
  OrganisationBusiness: jest.fn().mockImplementation(() => ({
    getorganisationall: mocks.getorganisationall,
    getorganisationbyid: mocks.getorganisationbyid,
    createorganisation: mocks.createorganisation,
    updateorganisation: mocks.updateorganisation,
    deleteorganisation: mocks.deleteorganisation,
    isexistsorganisationname: mocks.isexistsorganisationname,
    isexistsorganisationcode: mocks.isexistsorganisationcode,
    findunusablecountries: mocks.findunusablecountries,
  })),
}));
jest.mock("src/business/auth.business", () => ({
  AuthBusiness: jest.fn().mockImplementation(() => ({
    switchOrganisation: mocks.switchOrganisation,
  })),
}));

jest.mock("src/business/sync.business", () => ({
  SyncBusiness: jest.fn().mockImplementation(() => ({ syncontentVersion2: mocks.syncontentVersion2 })),
}));
jest.mock("src/business/schooluser.business", () => ({
  SchoolUserBusiness: jest.fn().mockImplementation(() => ({ getschooluserbyschoolid: mocks.getschooluserbyschoolid })),
}));
// The push to the cloud server is the thing these routes must not let an organisation's staff start.
jest.mock("axios", () => ({ __esModule: true, default: { put: (...a: unknown[]) => mocks.cloudPut(...a) } }));

const ID = "11111111-1111-4111-8111-111111111111";
const ORG = "33333333-3333-4333-8333-333333333333";
const COUNTRY_ID = "22222222-2222-4222-8222-222222222222";

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;

/** An Organisation Admin of ORG, holding the role's real permissions and, optionally, one more. */
const orgAdmin = (extraPermission?: string | null) =>
  bearer({
    lmsuserid: "u-org-admin",
    lmsuserroles: [Role.organisationadmin],
    permissions: [...ORGANISATION_ADMIN_PERMISSIONS_20261002, ...(extraPermission ? [extraPermission] : [])],
    organisationid: ORG,
    isplatform: false,
  });
const platform = (permissions: string[]) =>
  bearer({ lmsuserid: "u-platform", lmsuserroles: [Role.superadmin], permissions, organisationid: null, isplatform: true });

type Route = {
  label: string;
  method: "get" | "post" | "put" | "delete";
  path: string;
  body?: object;
  /** The route's permission, or null for the role-gated routes and the switcher. */
  permission: string | null;
  handler: jest.Mock;
};

const orgCreate = {
  organisationname: "Sample Network",
  organisationcode: "samplenet",
  organisationshortname: "SN",
  organisationpreset: "schoolnetwork",
  countryids: [COUNTRY_ID],
};
const orgUpdate = { organisationname: "Sample Network", organisationshortname: "SN", countryids: [COUNTRY_ID] };

const ROUTES: Route[] = [
  { label: "POST /auth/organisation", method: "post", path: "/auth/organisation", body: { organisationid: ORG }, permission: null, handler: mocks.switchOrganisation },
  { label: "POST /country/create", method: "post", path: "/country/create", body: { countryname: "Sample Land" }, permission: "create_country", handler: mocks.createcountry },
  { label: "PUT /country/:countryid", method: "put", path: `/country/${ID}`, body: { countryname: "Sample Land" }, permission: "update_country", handler: mocks.updatecountryName },
  { label: "DELETE /country/:countryid", method: "delete", path: `/country/${ID}`, permission: "delete_country", handler: mocks.deletecountry },
  { label: "POST /roles/create", method: "post", path: "/roles/create", body: { rolename: "Sample Role", permissionsid: [] }, permission: "create_role", handler: mocks.createRole },
  { label: "PUT /roles/:roleid", method: "put", path: `/roles/${ID}`, body: { rolename: "Sample Role", permissionsid: [] }, permission: "update_role", handler: mocks.updateRole },
  { label: "DELETE /roles/:roleid", method: "delete", path: `/roles/${ID}`, permission: "delete_role", handler: mocks.deleterole },
  { label: "POST /standard/migrate-standardid", method: "post", path: "/standard/migrate-standardid", permission: null, handler: mocks.standardMigrate },
  { label: "POST /standard/remove-standardid", method: "post", path: "/standard/remove-standardid", permission: null, handler: mocks.standardRemove },
  { label: "POST /student/migrate-standardid", method: "post", path: "/student/migrate-standardid", permission: null, handler: mocks.studentMigrateStandards },
  { label: "POST /student/migrate-subject-curriculum", method: "post", path: "/student/migrate-subject-curriculum", permission: null, handler: mocks.studentMigrateSubjectCurriculum },
  { label: "POST /lesson/update_reward_points", method: "post", path: "/lesson/update_reward_points", permission: "update_lesson", handler: mocks.autoupdatealllessonprogress },
  { label: "POST /level/update_quiz_points", method: "post", path: "/level/update_quiz_points", permission: "update_level", handler: mocks.updateLevelQuizPoints },
  { label: "GET /organisation", method: "get", path: "/organisation", permission: "view_organisation", handler: mocks.getorganisationall },
  { label: "GET /organisation/:organisationid", method: "get", path: `/organisation/${ORG}`, permission: "view_organisation", handler: mocks.getorganisationbyid },
  { label: "POST /organisation", method: "post", path: "/organisation", body: orgCreate, permission: "create_organisation", handler: mocks.createorganisation },
  { label: "PUT /organisation/:organisationid", method: "put", path: `/organisation/${ORG}`, body: orgUpdate, permission: "update_organisation", handler: mocks.updateorganisation },
  { label: "DELETE /organisation/:organisationid", method: "delete", path: `/organisation/${ORG}`, permission: "delete_organisation", handler: mocks.deleteorganisation },
];

const CONTROLLERS = [
  AuthController,
  CountryController,
  CurriculumController,
  LessonController,
  LevelController,
  OrganisationController,
  RolePermissionController,
  StandardController,
  StudentController,
  SyncController,
];

/** "METHOD /path" for every handler of the controllers that carries PlatformGuard (on the handler or its class). */
const platformRoutesByMetadata = (): string[] => {
  const found: string[] = [];
  for (const controller of CONTROLLERS) {
    const proto = controller.prototype as unknown as Record<string, unknown>;
    const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
    const base = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? "";
    for (const name of Object.getOwnPropertyNames(proto)) {
      const fn = proto[name] as (...a: never[]) => unknown;
      if (typeof fn !== "function") continue;
      const methodPath = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
      if (methodPath === undefined) continue;
      const guards: unknown[] = [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, fn) ?? [])];
      if (!guards.includes(PlatformGuard)) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number];
      found.push(`${method} /${[base, methodPath].map((p) => p.replace(/^\/+|\/+$/g, "")).filter((p) => p !== "").join("/")}`);
    }
  }
  return found.sort();
};

const send = (app: INestApplication, r: Route, authorization?: string) => {
  const req = request(app.getHttpServer())[r.method](r.path);
  if (authorization) req.set("Authorization", authorization);
  return r.body ? req.send(r.body) : req;
};

describe("an Organisation Admin on the platform routes", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: CONTROLLERS,
      providers: [JwtAccessStrategy],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tokenExists.mockResolvedValue(true);
    mocks.isexistscountryID.mockResolvedValue(true);
    mocks.isexistscountryName.mockResolvedValue(false);
    mocks.countryIsBinded.mockResolvedValue(false);
    mocks.isexistsroleID.mockResolvedValue(true);
    mocks.isexistsroleName.mockResolvedValue(false);
    mocks.checkRoleIsBinded.mockResolvedValue(false);
    mocks.isexistsorganisationname.mockResolvedValue(false);
    mocks.isexistsorganisationcode.mockResolvedValue(false);
    mocks.findunusablecountries.mockResolvedValue([]);
    for (const r of ROUTES) r.handler.mockResolvedValue({});
    mocks.getAllcountries.mockResolvedValue([]);
    mocks.getcountryall.mockResolvedValue({ rows: [], count: 0 });
    mocks.getCurriculumsWithFilter.mockResolvedValue([]);
    mocks.syncontentVersion2.mockResolvedValue("content");
    mocks.getschooluserbyschoolid.mockResolvedValue([{ get: () => ({ schooluserid: "s1" }) }]);
    mocks.cloudPut.mockResolvedValue({ status: 200 });
  });

  const handlerCalls = () => ROUTES.reduce((n, r) => n + r.handler.mock.calls.length, 0);

  it("the table lists exactly the 18 routes that carry PlatformGuard", () => {
    expect(ROUTES).toHaveLength(18);
    expect(ROUTES.map((r) => r.label).sort()).toEqual(platformRoutesByMetadata());
  });

  describe.each(ROUTES)("$label", (route) => {
    it("lets a platform user reach the handler (the control)", async () => {
      const res = await send(app, route, platform(route.permission ? [route.permission] : []));
      expect([200, 201]).toContain(res.status);
      expect(route.handler).toHaveBeenCalledTimes(1);
    });

    it("refuses an Organisation Admin holding the route's own permission as well: 403 from PlatformGuard, the handler never runs", async () => {
      const res = await send(app, route, orgAdmin(route.permission));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
      expect(handlerCalls()).toBe(0);
    });

    it("refuses an Organisation Admin with the permissions the role really has: 403", async () => {
      const res = await send(app, route, orgAdmin());
      expect(res.status).toBe(403);
      expect(handlerCalls()).toBe(0);
    });
  });

  describe("the two sync-to-cloud routes (they push to the cloud server with the server key, for every organisation)", () => {
    const SYNC_ROUTES: Array<[string, string]> = [
      ["POST /sync/cloud", "/sync/cloud"],
      ["POST /sync/cloud/:schoolname/students", "/sync/cloud/Sample%20School/students"],
    ];
    const admin = () =>
      bearer({
        lmsuserid: "u-admin",
        lmsuserroles: [Role.admin],
        permissions: ["view_school"],
        organisationid: null,
        isplatform: false,
      });
    const post = (path: string, token: string) => request(app.getHttpServer()).post(path).set("Authorization", token);

    it.each(SYNC_ROUTES)("%s: refuses an Organisation Admin with 403, and nothing is pushed", async (_label, path) => {
      await post(path, orgAdmin()).expect(403);
      await post(path, orgAdmin("sync_content")).expect(403);
      expect(mocks.cloudPut).not.toHaveBeenCalled();
      expect(mocks.syncontentVersion2).not.toHaveBeenCalled();
    });

    it.each(SYNC_ROUTES)("%s: still admits Admin (the control), which pushes once", async (_label, path) => {
      await post(path, admin()).expect(200);
      expect(mocks.cloudPut).toHaveBeenCalledTimes(1);
    });
  });

  describe("an Organisation Admin still reaches ordinary Admin-level routes from other modules", () => {
    it("GET /country (role list names the role)", async () => {
      await request(app.getHttpServer()).get("/country").set("Authorization", orgAdmin()).expect(200);
      expect(mocks.getAllcountries).toHaveBeenCalledTimes(1);
    });

    it("GET /curriculum/all (role list names the role)", async () => {
      await request(app.getHttpServer()).get("/curriculum/all").set("Authorization", orgAdmin()).expect(200);
      expect(mocks.getCurriculumsWithFilter).toHaveBeenCalledTimes(1);
    });

    it("POST /country (a permission the role holds: view_country)", async () => {
      await request(app.getHttpServer()).post("/country").set("Authorization", orgAdmin()).send({}).expect(200);
      expect(mocks.getcountryall).toHaveBeenCalledTimes(1);
    });
  });
});
