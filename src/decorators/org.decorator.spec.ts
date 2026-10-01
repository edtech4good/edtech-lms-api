import { Controller, Get, INestApplication, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { AccessGuard } from "src/guards/access.guard";
import { Role, TokenType } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { Org, OrgContext, orgOf } from "./org.decorator";

/**
 * `@Org()` hands a handler the organisation context of the staff token that
 * authenticated the request: `{ organisationid, isplatform }`, nothing else.
 * Unit-tested through `orgOf` (the rule), and over real HTTP through the real
 * strategy and AccessGuard (the decorator itself).
 */
const ORG = "33333333-3333-4333-8333-333333333333";

describe("orgOf", () => {
  const staff = (extra: Record<string, unknown> = {}) => ({
    lmsuserid: "u1",
    lmsuserroles: [Role.admin],
    organisationid: ORG,
    isplatform: false,
    ...extra,
  });

  it("returns exactly the two claims", () => {
    expect(orgOf(staff())).toEqual({ organisationid: ORG, isplatform: false });
  });

  it("returns null for 'no organisation' and true for a platform user", () => {
    expect(orgOf(staff({ organisationid: null, isplatform: true }))).toEqual({
      organisationid: null,
      isplatform: true,
    });
  });

  it("keeps a platform user's acting organisation next to isplatform: true", () => {
    expect(orgOf(staff({ isplatform: true }))).toEqual({ organisationid: ORG, isplatform: true });
  });

  it("does not leak other claims", () => {
    expect(Object.keys(orgOf(staff())).sort()).toEqual(["isplatform", "organisationid"]);
  });

  it.each([
    ["no user", undefined],
    ["null", null],
    ["a string", "API KEY"],
    ["the API key identity", { user: "API KEY" }],
    ["a school-user token", { schooluserid: "s1", schooluserrole: 3 }],
    ["a staff token without the organisation claims (predates them)", { lmsuserid: "u1" }],
    ["organisationid missing (undefined is not null)", { lmsuserid: "u1", isplatform: false }],
    ["isplatform missing", { lmsuserid: "u1", organisationid: null }],
    ["organisationid of the wrong type", staff({ organisationid: 7 })],
    ["isplatform as a string", staff({ isplatform: "true" })],
    ["an empty staff id", staff({ lmsuserid: "" })],
    ["a missing staff id", { organisationid: null, isplatform: true }],
  ])("throws 401 for %s", (_name, user) => {
    expect(() => orgOf(user)).toThrow(UnauthorizedException);
  });
});

const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({ tokenExists })),
}));

@Controller("org-decorator-test")
class OrgDecoratorTestController {
  // No role list: any valid access token gets in, so what @Org() does with it
  // is what is tested.
  @Get()
  @UseGuards(AccessGuard(TokenType.ACCESS))
  read(@Org() org: OrgContext) {
    return { org };
  }

  // Role.apikey in the list lets the application API key through AccessGuard
  // as `{ user: "API KEY" }`, to show that @Org() still refuses it.
  @Get("key")
  @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey))
  readWithKey(@Org() org: OrgContext) {
    return { org };
  }
}

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, {
    expiresIn: "5m",
  })}`;

describe("@Org() on a route (real strategy and AccessGuard)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [OrgDecoratorTestController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => tokenExists.mockResolvedValue(true));
  afterAll(async () => app.close());

  const get = (authorization?: string, path = "/org-decorator-test") => {
    const req = request(app.getHttpServer()).get(path);
    return authorization ? req.set("Authorization", authorization) : req;
  };

  it("gives an organisation's staff token's context", async () => {
    const res = await get(
      bearer({ lmsuserid: "u1", lmsuserroles: [Role.admin], organisationid: ORG, isplatform: false }),
    ).expect(200);
    expect(res.body).toEqual({ org: { organisationid: ORG, isplatform: false } });
  });

  it("gives a platform token's context: no organisation, isplatform true", async () => {
    const res = await get(
      bearer({ lmsuserid: "u1", lmsuserroles: [Role.superadmin], organisationid: null, isplatform: true }),
    ).expect(200);
    expect(res.body).toEqual({ org: { organisationid: null, isplatform: true } });
  });

  it("reads the token, never the request: a header or a query value changes nothing", async () => {
    const res = await request(app.getHttpServer())
      .get("/org-decorator-test?organisationid=hijack&isplatform=true")
      .set("Authorization", bearer({ lmsuserid: "u1", lmsuserroles: [Role.admin], organisationid: ORG, isplatform: false }))
      .set("X-Organisation-Id", "hijack")
      .expect(200);
    expect(res.body.org).toEqual({ organisationid: ORG, isplatform: false });
  });

  it("throws 401 for the application API key: it is not a staff user", async () => {
    await get(`Bearer ${Config.fortyk.api.applicationapikey}`, "/org-decorator-test/key").expect(401);
  });

  it("throws 401 for a school-user (teacher) token", async () => {
    await get(bearer({ schooluserid: "s1", schooluserrole: 3, schoolusername: "t1" })).expect(401);
  });

  it("is refused with 401 for a staff token without the claims, before the handler (the strategy)", async () => {
    await get(bearer({ lmsuserid: "u1", lmsuserroles: [Role.admin] })).expect(401);
  });

  it("is 401 with no token", async () => {
    await get().expect(401);
  });
});
