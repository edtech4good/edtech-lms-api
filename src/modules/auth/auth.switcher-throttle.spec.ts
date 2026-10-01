import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { AuthController } from "./auth.controller";

/**
 * `POST /auth/organisation` is rate limited by the same throttler the sign-in
 * routes use (per client IP, 20 a minute). The limiter runs AFTER
 * authentication and PlatformGuard, so requests that are refused there do not
 * use up the allowance. The real ThrottlerGuard runs here; AuthBusiness is
 * replaced.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));
const switchOrganisation = jest.fn();
jest.mock("src/business/auth.business", () => ({
  AuthBusiness: jest.fn().mockImplementation(() => ({ switchOrganisation })),
}));

const ORG = "33333333-3333-4333-8333-333333333333";
const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const platform = bearer({ lmsuserid: "u1", lmsuserroles: [Role.superadmin], organisationid: null, isplatform: true });
const orgStaff = bearer({ lmsuserid: "u2", lmsuserroles: [Role.admin], organisationid: ORG, isplatform: false });

describe("POST /auth/organisation rate limit", () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    tokenExists.mockResolvedValue(true);
    switchOrganisation.mockReset().mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    // A fresh app per test: a fresh in-memory counter.
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ ttl: 60, limit: 1000 })],
      controllers: [AuthController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const post = (token?: string) => {
    const req = request(app.getHttpServer()).post("/auth/organisation");
    if (token) req.set("Authorization", token);
    return req.send({ organisationid: null });
  };

  it("allows 20 switches a minute and refuses the 21st with 429", async () => {
    for (let i = 0; i < 20; i++) {
      await post(platform).expect(200);
    }
    const res = await post(platform).expect(429);
    expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(switchOrganisation).toHaveBeenCalledTimes(20);
  });

  it("requests refused by authentication or PlatformGuard do not use up the allowance", async () => {
    for (let i = 0; i < 30; i++) {
      await post().expect(401);
      await post(orgStaff).expect(403);
    }
    for (let i = 0; i < 20; i++) {
      await post(platform).expect(200);
    }
    await post(platform).expect(429);
  });

  it("passes the client IP to the switcher for the audit line", async () => {
    await post(platform).expect(200);
    expect(switchOrganisation).toHaveBeenCalledWith(
      expect.objectContaining({ lmsuserid: "u1" }),
      null,
      null,
      expect.stringMatching(/127\.0\.0\.1/),
    );
  });
});
