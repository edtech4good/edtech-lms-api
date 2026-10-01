import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { CountryController } from "src/modules/country/country.controller";
import { LessonController } from "src/modules/lesson/lesson.controller";
import { LevelController } from "src/modules/level/level.controller";
import { RolePermissionController } from "src/modules/role-permission/role-perm.controller";
import { StandardController } from "src/modules/standard/standard.controller";
import { StudentController } from "src/modules/students/student.controller";
import { JwtAccessStrategy } from "src/services/auth.strategy";

/**
 * The twelve `platform` routes that had no PlatformGuard before the
 * organisation work: country create/update/delete, role create/update/delete,
 * the four student/standard migration routes and the two bulk recomputes.
 * Each now runs  authentication -> PlatformGuard -> permissions , so an
 * organisation's staff get 403 even holding the route's permission (or Super
 * Admin), and a platform user reaches the handler.
 *
 * Driven over real HTTP through the real JWT strategy and the real guards. Only
 * the business classes (the database, and above all the migrations and the
 * recomputes, which must never run here) are replaced.
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

const mocks = {
  createcountry: jest.fn(),
  updatecountryName: jest.fn(),
  deletecountry: jest.fn(),
  isexistscountryID: jest.fn(),
  isexistscountryName: jest.fn(),
  countryIsBinded: jest.fn(),
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
};
jest.mock("src/business/country.business", () => ({
  CountryBusiness: jest.fn().mockImplementation(() => ({
    createcountry: mocks.createcountry,
    updatecountryName: mocks.updatecountryName,
    deletecountry: mocks.deletecountry,
    isexistscountryID: mocks.isexistscountryID,
    isexistscountryName: mocks.isexistscountryName,
    countryIsBinded: mocks.countryIsBinded,
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

const ID = "11111111-1111-4111-8111-111111111111";
const ORG = "33333333-3333-4333-8333-333333333333";

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, {
    expiresIn: "5m",
  })}`;

type Persona = { roles: string[]; permissions: string[]; organisationid: string | null; isplatform: boolean };
const token = (p: Persona) =>
  bearer({
    lmsuserid: "u1",
    lmsuserroles: p.roles,
    permissions: p.permissions,
    organisationid: p.organisationid,
    isplatform: p.isplatform,
  });

type Route = {
  label: string;
  method: "post" | "put" | "delete";
  path: string;
  body?: object;
  /** The route's permission, or null for the role-gated migration routes. */
  permission: string | null;
  handler: jest.Mock;
};

const ROUTES: Route[] = [
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
];

const send = (app: INestApplication, r: Route, authorization?: string) => {
  const req = request(app.getHttpServer())[r.method](r.path);
  if (authorization) req.set("Authorization", authorization);
  return r.body ? req.send(r.body) : req;
};

describe("The twelve platform routes that gained PlatformGuard", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [
        CountryController,
        RolePermissionController,
        StandardController,
        StudentController,
        LessonController,
        LevelController,
      ],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
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
    for (const fn of [
      mocks.createcountry,
      mocks.updatecountryName,
      mocks.deletecountry,
      mocks.createRole,
      mocks.updateRole,
      mocks.deleterole,
      mocks.autoupdatealllessonprogress,
      mocks.updateLevelQuizPoints,
      mocks.standardMigrate,
      mocks.standardRemove,
      mocks.studentMigrateStandards,
      mocks.studentMigrateSubjectCurriculum,
    ]) {
      fn.mockResolvedValue({});
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const handlerCalls = () => ROUTES.reduce((n, r) => n + r.handler.mock.calls.length, 0);

  describe.each(ROUTES)("$label", (route) => {
    // What a platform user holds: Super Admin, no organisation. With the route's
    // permission only (so the route's own permission check is really exercised),
    // and with the wildcard a real Super Admin token carries.
    const platformOnlyThis = token({
      roles: [Role.superadmin],
      permissions: route.permission ? [route.permission] : [],
      organisationid: null,
      isplatform: true,
    });
    const platformWildcard = token({
      roles: [Role.superadmin],
      permissions: ["superadmin"],
      organisationid: null,
      isplatform: true,
    });

    it("lets a platform user reach the handler", async () => {
      const res = await send(app, route, platformOnlyThis);
      expect([200, 201]).toContain(res.status);
      expect(route.handler).toHaveBeenCalledTimes(1);
    });

    it("lets a platform user with the superadmin wildcard reach the handler", async () => {
      const res = await send(app, route, platformWildcard);
      expect([200, 201]).toContain(res.status);
      expect(route.handler).toHaveBeenCalledTimes(1);
    });

    it("lets a platform user who is ACTING as an organisation reach the handler: the claim stays true", async () => {
      const acting = token({
        roles: [Role.superadmin],
        permissions: ["superadmin"],
        organisationid: ORG,
        isplatform: true,
      });
      const res = await send(app, route, acting);
      expect([200, 201]).toContain(res.status);
      expect(route.handler).toHaveBeenCalledTimes(1);
    });

    it("refuses an organisation's staff user holding the route's permission with 403: the handler never runs", async () => {
      const staff = token({
        roles: [Role.admin, Role.superadmin],
        permissions: route.permission ? [route.permission, "view_organisation"] : ["view_organisation"],
        organisationid: ORG,
        isplatform: false,
      });
      const res = await send(app, route, staff);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
      expect(handlerCalls()).toBe(0);
    });

    it("refuses an organisation's staff user holding Super Admin and the wildcard with 403 (the claim, not the role, decides)", async () => {
      const staff = token({
        roles: [Role.superadmin],
        permissions: ["superadmin"],
        organisationid: ORG,
        isplatform: false,
      });
      await send(app, route, staff).expect(403);
      expect(handlerCalls()).toBe(0);
    });

    it("refuses a staff user with no organisation and no Super Admin, holding the permission, with 403", async () => {
      const unassigned = token({
        roles: [Role.admin],
        permissions: route.permission ? [route.permission] : [],
        organisationid: null,
        isplatform: false,
      });
      const res = await send(app, route, unassigned);
      // The role-gated migration routes refuse a non-Super-Admin at the role
      // list, also with 403.
      expect(res.status).toBe(403);
      expect(handlerCalls()).toBe(0);
    });

    it("refuses no token with 401", async () => {
      await send(app, route).expect(401);
      expect(handlerCalls()).toBe(0);
    });

    it("refuses a Super Admin token minted before the organisation claims existed with 401", async () => {
      const old = bearer({
        lmsuserid: "u1",
        lmsuserroles: [Role.superadmin],
        permissions: ["superadmin"],
      });
      await send(app, route, old).expect(401);
      expect(handlerCalls()).toBe(0);
    });

    it("refuses a platform token the server no longer knows (revoked) with 401", async () => {
      tokenExists.mockResolvedValue(false);
      await send(app, route, platformWildcard).expect(401);
      expect(handlerCalls()).toBe(0);
    });

    if (route.permission) {
      it("still needs the route's permission: a platform user without it gets 403 and the handler never runs", async () => {
        const without = token({
          roles: [Role.superadmin],
          permissions: ["view_organisation"],
          organisationid: null,
          isplatform: true,
        });
        await send(app, route, without).expect(403);
        expect(handlerCalls()).toBe(0);
      });
    }
  });
});
