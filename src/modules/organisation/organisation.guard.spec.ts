import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { OrganisationController } from "./organisation.controller";

/**
 * Every organisation route needs: a valid staff access token, AND to be the
 * platform (PlatformGuard: the token's `isplatform` claim), AND the route's own
 * permission. Driven over real HTTP through the real JWT strategy
 * and the real guards, in the style of school-reads.guard.spec.ts; only the
 * business class (the database) is replaced.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({ tokenExists })),
}));

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const COUNTRY_ID = "22222222-2222-4222-8222-222222222222";
const orgView = {
  organisationid: ORG_ID,
  organisationname: "Sample Network",
  organisationcode: "samplenet",
  organisationshortname: "SN",
  organisationpreset: "schoolnetwork",
  organisationstatus: true,
  uitheme: "kids",
  isdeleted: false,
  countries: [],
};

const business = {
  getorganisationall: jest.fn(),
  getorganisationbyid: jest.fn(),
  createorganisation: jest.fn(),
  updateorganisation: jest.fn(),
  deleteorganisation: jest.fn(),
  isexistsorganisationname: jest.fn(),
  isexistsorganisationcode: jest.fn(),
  findunusablecountries: jest.fn(),
};
jest.mock("../../business/organisation.business", () => ({
  OrganisationBusiness: jest.fn().mockImplementation(() => business),
}));

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, {
    expiresIn: "5m",
  })}`;

const ALL = ["view_organisation", "create_organisation", "update_organisation", "delete_organisation"];

// A staff token the way generateAuthToken mints it: the user has no
// organisation, and is platform exactly when they hold Super Admin.
const staff = (roles: string[], permissions: string[]) =>
  bearer({
    lmsuserid: "u1",
    lmsuserroles: roles,
    permissions,
    organisationid: null,
    isplatform: roles.includes(Role.superadmin),
  });
// An organisation's staff user: has an organisation, never platform.
const orgStaff = (roles: string[], permissions: string[]) =>
  bearer({
    lmsuserid: "u2",
    lmsuserroles: roles,
    permissions,
    organisationid: "33333333-3333-4333-8333-333333333333",
    isplatform: false,
  });

const platformWithAll = staff([Role.superadmin], ALL);
const platformWildcard = staff([Role.superadmin], ["superadmin"]);

const validCreate = {
  organisationname: "Sample Network",
  organisationcode: "samplenet",
  organisationshortname: "SN",
  organisationpreset: "schoolnetwork",
  countryids: [COUNTRY_ID],
};
const validUpdate = {
  organisationname: "Sample Network",
  organisationshortname: "SN",
  countryids: [COUNTRY_ID],
};

type Route = {
  label: string;
  method: "get" | "post" | "put" | "delete";
  path: string;
  body?: object;
  permission: string;
  business: jest.Mock;
};

const ROUTES: Route[] = [
  { label: "GET /organisation", method: "get", path: "/organisation", permission: "view_organisation", business: business.getorganisationall },
  { label: "GET /organisation/:id", method: "get", path: `/organisation/${ORG_ID}`, permission: "view_organisation", business: business.getorganisationbyid },
  { label: "POST /organisation", method: "post", path: "/organisation", body: validCreate, permission: "create_organisation", business: business.createorganisation },
  { label: "PUT /organisation/:id", method: "put", path: `/organisation/${ORG_ID}`, body: validUpdate, permission: "update_organisation", business: business.updateorganisation },
  { label: "DELETE /organisation/:id", method: "delete", path: `/organisation/${ORG_ID}`, permission: "delete_organisation", business: business.deleteorganisation },
];

const send = (app: INestApplication, r: Route, authorization?: string) => {
  const req = request(app.getHttpServer())[r.method](r.path);
  if (authorization) req.set("Authorization", authorization);
  return r.body ? req.send(r.body) : req;
};

describe("Organisation routes: staff token + Super Admin role + permission", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // The filter logs every refusal; keep the test output readable.
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganisationController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tokenExists.mockResolvedValue(true);
    business.getorganisationall.mockResolvedValue({ rows: [], count: 0, pageindex: 1, pagesize: 20 });
    business.getorganisationbyid.mockResolvedValue(orgView);
    business.createorganisation.mockResolvedValue(orgView);
    business.updateorganisation.mockResolvedValue(orgView);
    business.deleteorganisation.mockResolvedValue(true);
    business.isexistsorganisationname.mockResolvedValue(false);
    business.isexistsorganisationcode.mockResolvedValue(false);
    business.findunusablecountries.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  const businessCalls = () =>
    Object.values(business).reduce((n, fn) => n + fn.mock.calls.length, 0);

  describe.each(ROUTES)("$label", (route) => {
    it("passes Super Admin holding the route's permission, and the business call runs", async () => {
      await send(app, route, platformWithAll).expect(200);
      expect(route.business).toHaveBeenCalled();
    });

    it("passes Super Admin carrying the superadmin wildcard (what a real Super Admin token holds)", async () => {
      await send(app, route, platformWildcard).expect(200);
    });

    it("refuses no token with 401 and touches nothing", async () => {
      const res = await send(app, route).expect(401);
      expect(res.body.code).toBe("SIGN_IN_REQUIRED");
      expect(businessCalls()).toBe(0);
    });

    it("refuses a token signed with the wrong secret with 401", async () => {
      const forged = `Bearer ${sign(
        { jti: "j", lmsuserid: "u1", lmsuserroles: [Role.superadmin], permissions: ["superadmin"] },
        "not-the-secret",
        { expiresIn: "5m" }
      )}`;
      await send(app, route, forged).expect(401);
      expect(businessCalls()).toBe(0);
    });

    it("refuses a token the server no longer knows (revoked / superseded by a newer login) with 401", async () => {
      tokenExists.mockResolvedValue(false);
      await send(app, route, platformWithAll).expect(401);
      expect(businessCalls()).toBe(0);
    });

    it("refuses the application API key with 401: it is not a user, and no role list admits it", async () => {
      await send(app, route, `Bearer ${Config.fortyk.api.applicationapikey}`).expect(401);
      expect(businessCalls()).toBe(0);
    });

    it("refuses an Admin holding EVERY organisation permission with 403: the role, not the permission, is the gate", async () => {
      const res = await send(app, route, staff([Role.admin], ALL)).expect(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
      expect(businessCalls()).toBe(0);
    });

    it("refuses the superadmin WILDCARD without the Super Admin role with 403", async () => {
      await send(app, route, staff([Role.admin], ["superadmin"])).expect(403);
      expect(businessCalls()).toBe(0);
    });

    it.each([
      ["Teacher", [Role.teacher]],
      ["User", [Role.user]],
      ["API Key role", [Role.apikey]],
      ["no roles", []],
    ])("refuses a staff %s token with 403", async (_name, roles) => {
      await send(app, route, staff(roles as string[], ALL)).expect(403);
      expect(businessCalls()).toBe(0);
    });

    it("refuses a staff token minted before the organisation claims existed with 401: it fails closed at the strategy", async () => {
      await send(
        app,
        route,
        bearer({ lmsuserid: "u1", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...ALL] }),
      ).expect(401);
      expect(businessCalls()).toBe(0);
    });

    it("refuses an organisation's staff holding Super Admin and every permission with 403: isplatform is false", async () => {
      const res = await send(app, route, orgStaff([Role.superadmin], [...ALL, "superadmin"])).expect(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
      expect(businessCalls()).toBe(0);
    });

    it("passes a platform user who is acting as an organisation: the claim stays true", async () => {
      const acting = bearer({
        lmsuserid: "u1",
        lmsuserroles: [Role.superadmin],
        permissions: ["superadmin"],
        organisationid: "33333333-3333-4333-8333-333333333333",
        isplatform: true,
      });
      await send(app, route, acting).expect(200);
      expect(route.business).toHaveBeenCalled();
    });

    it("refuses a school-user teacher token with 403", async () => {
      await send(app, route, bearer({ schooluserid: "s1", schooluserrole: 3, schoolusername: "t1" })).expect(403);
      expect(businessCalls()).toBe(0);
    });

    it("refuses a school-user LEARNER token with 401 (the strategy rejects non-staff school roles first)", async () => {
      await send(app, route, bearer({ schooluserid: "s1", schooluserrole: 4, schoolusername: "l1" })).expect(401);
      expect(businessCalls()).toBe(0);
    });

    it("refuses Super Admin WITHOUT the route's permission with 403, and accepts it with only that one", async () => {
      const without = ALL.filter((p) => p !== route.permission);
      await send(app, route, staff([Role.superadmin], without)).expect(403);
      expect(businessCalls()).toBe(0);
      await send(app, route, staff([Role.superadmin], [route.permission])).expect(200);
      expect(route.business).toHaveBeenCalled();
    });
  });
});
