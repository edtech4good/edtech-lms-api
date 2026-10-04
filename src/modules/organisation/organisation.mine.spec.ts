import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { organisations } from "src/models/data-models/organisations";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { OrganisationController } from "./organisation.controller";

/**
 * GET /organisation/mine: the caller's own organisation, for its own staff and for
 * a platform user acting as one. Any staff access token, no permission. The
 * organisation comes from the token, never from the request. Only the identity,
 * preset, theme, status and the tile colour are returned.
 *
 * Driven over real HTTP through the real strategy, guards and controller; the
 * per-request token check (one database query in production, and the one that
 * refuses a token acting in a suspended or deleted organisation) is answered by a
 * stub, and the `organisations` table is an in-memory fake.
 */
const staffSessionOk = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists: (...args: unknown[]) => staffSessionOk(...args),
    validateStaffAccessToken: (...args: unknown[]) => staffSessionOk(...args),
  })),
}));

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const row = (organisationid: string, name: string) => ({
  organisationid,
  organisationname: name,
  organisationshortname: "សម",
  organisationpreset: "schoolnetwork",
  uitheme: "kids",
  organisationstatus: true,
  isdeleted: false,
  // everything below must never be returned
  brandingconfig: { tilecolour: "#a1b2c3", logourl: "https://example.com/logo.png", displayname: "Display Name" },
  settingsconfig: { secretsetting: "do-not-return" },
  organisationcode: "samplecode",
  created_by: "someone",
  created_at: new Date(),
  updated_at: new Date(),
});
const TABLE: Record<string, ReturnType<typeof row>> = { [X]: row(X, "សាលាគំរូ ក"), [Y]: row(Y, "Other Organisation") };

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const staff = (over: Record<string, unknown> = {}) =>
  bearer({ lmsuserid: "u1", lmsuserroles: [Role.organisationadmin], permissions: [], organisationid: X, isplatform: false, ...over });

const KEYS = ["organisationid", "organisationname", "organisationpreset", "organisationshortname", "organisationstatus", "tilecolour", "uitheme"];

describe("GET /organisation/mine", () => {
  let app: INestApplication;
  let findOne: jest.SpyInstance;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ controllers: [OrganisationController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    staffSessionOk.mockReset().mockResolvedValue(true);
    findOne = jest.spyOn(organisations, "findOne").mockImplementation((async (o: { where: { organisationid: string; isdeleted?: boolean } }) => {
      const r = TABLE[o.where.organisationid];
      return r && r.isdeleted === o.where.isdeleted ? r : null;
    }) as never);
  });
  afterEach(() => findOne.mockRestore());

  const mine = (authorization?: string) => {
    const req = request(app.getHttpServer()).get("/organisation/mine");
    return authorization ? req.set("Authorization", authorization) : req;
  };

  it("an organisation's staff (an Organisation Admin) get their organisation: exactly these fields", async () => {
    const res = await mine(staff()).expect(200);
    expect(res.body.error).toBe(false);
    expect(Object.keys(res.body.data).sort()).toEqual(KEYS);
    expect(res.body.data).toEqual({
      organisationid: X,
      organisationname: "សាលាគំរូ ក",
      organisationshortname: "សម",
      organisationpreset: "schoolnetwork",
      uitheme: "kids",
      organisationstatus: true,
      tilecolour: "#a1b2c3",
    });
  });

  it("a staff account that holds no permission at all gets it too (a Teacher-level account: no permission is needed)", async () => {
    const res = await mine(staff({ lmsuserroles: [Role.teacher], permissions: [] })).expect(200);
    expect(res.body.data.organisationname).toBe("សាលាគំរូ ក");
    const noRoles = await mine(staff({ lmsuserroles: [], permissions: [] })).expect(200);
    expect(noRoles.body.data.organisationid).toBe(X);
  });

  it("a platform user ACTING as an organisation gets that organisation", async () => {
    const res = await mine(staff({ lmsuserroles: [Role.superadmin], permissions: ["superadmin"], isplatform: true, organisationid: Y })).expect(200);
    expect(res.body.data.organisationid).toBe(Y);
    expect(res.body.data.organisationname).toBe("Other Organisation");
  });

  it("a platform user not acting gets null data, and no organisation is read", async () => {
    const res = await mine(staff({ lmsuserroles: [Role.superadmin], permissions: ["superadmin"], isplatform: true, organisationid: null })).expect(200);
    expect(res.body).toEqual({ error: false, data: null });
    expect(findOne).not.toHaveBeenCalled();
  });

  it("returns nothing else: no other branding key, no settings, no code, no audit fields, no countries", async () => {
    const res = await mine(staff()).expect(200);
    const text = JSON.stringify(res.body);
    for (const leak of ["logourl", "displayname", "Display Name", "secretsetting", "settingsconfig", "brandingconfig", "samplecode", "created_by", "countries", "isdeleted"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("reads the organisation named by the token, never by the request (a query value, a header or a body changes nothing)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/organisation/mine?organisationid=${Y}`)
      .set("Authorization", staff())
      .set("x-organisation-id", Y)
      .send({ organisationid: Y })
      .expect(200);
    expect(res.body.data.organisationid).toBe(X);
    expect(findOne.mock.calls.every((c) => c[0].where.organisationid === X)).toBe(true);
  });

  it("a tile colour that is absent comes back as null", async () => {
    TABLE[X].brandingconfig = {} as never;
    try {
      expect((await mine(staff()).expect(200)).body.data.tilecolour).toBeNull();
    } finally {
      TABLE[X].brandingconfig = { tilecolour: "#a1b2c3", logourl: "https://example.com/logo.png", displayname: "Display Name" };
    }
  });

  it("is not read as an organisation id: it is not the platform route, so no PlatformGuard and no permission applies", async () => {
    await mine(staff()).expect(200); // an organisation user, which `:organisationid` would refuse with 403
  });

  describe("refused", () => {
    it("no token: 401", async () => {
      await mine().expect(401);
    });

    it("a token the server no longer accepts (revoked, user disabled, or acting in a suspended or deleted organisation): 401, nothing read", async () => {
      staffSessionOk.mockResolvedValue(false);
      await mine(staff()).expect(401);
      expect(findOne).not.toHaveBeenCalled();
    });

    it("a staff token that predates the organisation claims: 401", async () => {
      await mine(bearer({ lmsuserid: "u1", lmsuserroles: [Role.admin], permissions: [] })).expect(401);
    });

    it("a school-user token: 401", async () => {
      await mine(bearer({ schooluserid: "s1", schooluserrole: 3 })).expect(401);
    });

    it.each([
      ["a school-user id together with a staff id", { schooluserid: "s1", schooluserrole: 3, lmsuserid: "u1" }],
      ["a school-user id with the organisation claims", { schooluserid: "s1", schooluserrole: 3, organisationid: X, isplatform: false }],
    ])("a mixed-shape token (%s): 401", async (_n, claims) => {
      await mine(bearer(claims)).expect(401);
      expect(findOne).not.toHaveBeenCalled();
    });

    it("an organisation claim that is not an id: 401", async () => {
      await mine(staff({ organisationid: "not-a-uuid" })).expect(401);
      await mine(staff({ organisationid: 7 })).expect(401);
    });
  });
});
