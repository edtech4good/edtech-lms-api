import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Open } from "unzipper";
import { Config } from "src/config";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { LogController } from "./log.controller";

/**
 * `PUT log/import` is off unless `LOG_IMPORT_ENABLED` is `true`/`1` (see
 * src/config.ts#isLogImportEnabled and src/guards/logImport.guard.ts).
 *
 * Driven over real HTTP through the real JWT strategy with signed tokens.
 * The token-table lookup is stubbed (no database here). LogController is
 * mounted on its own, so a passing run never touches log.business.ts or a
 * real S3/DB call - the "enabled" cases below send a body that fails before
 * any of that is reached (an invalid zip -> FILE_REJECTED), which is enough
 * to prove the guard let the request through to the real handler.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({ tokenExists })),
}));

const signToken = (roles: string[]) =>
  `Bearer ${sign(
    {
      jti: "test-jti",
      lmsuserid: "user-1",
      lmsuserroles: roles,
      permissions: [],
    },
    Config.fortyk.api.applicationsecret,
    { expiresIn: "5m" }
  )}`;

const teacher = signToken([Role.teacher]);
const superadmin = signToken([Role.superadmin]);

// Not a real zip. If the handler ever runs, `Open.buffer` throws and the
// route responds FILE_REJECTED - which is exactly what the "enabled" tests
// below assert, and exactly what the "disabled" tests below assert does NOT
// happen.
const NOT_A_ZIP = Buffer.from("not a zip file");

describe("PUT log/import behind LOG_IMPORT_ENABLED", () => {
  let app: INestApplication;
  let openBufferSpy: jest.SpyInstance;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LogController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    // Spying on LogController.prototype.create directly does not work here:
    // Nest's router explorer reads @UseGuards/@UseInterceptors/path metadata
    // off the exact function object at app.init() (via reflect-metadata,
    // keyed by that object), and captures a bound reference to it when
    // wiring the route. Replacing the prototype method - before OR after
    // init - either drops that metadata (route never registers) or is
    // ignored (the already-bound original still runs). `Open.buffer` is the
    // first thing the real handler does with the upload, is not decorated,
    // and is safe to spy on with call-through preserved.
    openBufferSpy = jest.spyOn(Open, "buffer");
  });

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
    openBufferSpy.mockClear();
  });

  afterAll(async () => {
    openBufferSpy.mockRestore();
    if (originalEnv === undefined) delete process.env.LOG_IMPORT_ENABLED;
    else process.env.LOG_IMPORT_ENABLED = originalEnv;
    await app.close();
  });

  const put = (auth?: string) => {
    const req = request(app.getHttpServer()).put("/log/import");
    if (auth) req.set("Authorization", auth);
    return req.attach("importfile", NOT_A_ZIP, "log.zip");
  };

  describe.each([
    ["unset", undefined],
    ["false", "false"],
    ["0", "0"],
    ["a random string", "sometimes"],
  ])("disabled (LOG_IMPORT_ENABLED = %s)", (_label, value) => {
    beforeEach(() => {
      if (value === undefined) delete process.env.LOG_IMPORT_ENABLED;
      else process.env.LOG_IMPORT_ENABLED = value as string;
    });

    it("no token: 404 NOT_FOUND, never a 401 (guard runs before AccessGuard)", async () => {
      const res = await put();
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
      expect(res.body.errormessage).toBe("Log upload is turned off on this server.");
      expect(openBufferSpy).not.toHaveBeenCalled();
    });

    it("a valid teacher token: 404 NOT_FOUND", async () => {
      const res = await put(teacher);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
      expect(openBufferSpy).not.toHaveBeenCalled();
    });

    it("a valid superadmin token: 404 NOT_FOUND", async () => {
      const res = await put(superadmin);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
      expect(openBufferSpy).not.toHaveBeenCalled();
    });

    it("the upload is never parsed: the same invalid-zip body that gets FILE_REJECTED when enabled gets 404 here, and the handler is never called", async () => {
      const res = await put(superadmin);
      expect(res.status).toBe(404);
      expect(res.body.code).not.toBe("FILE_REJECTED");
      expect(openBufferSpy).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ["true", "true"],
    ["1", "1"],
  ])("enabled (LOG_IMPORT_ENABLED = %s)", (_label, value) => {
    beforeEach(() => {
      process.env.LOG_IMPORT_ENABLED = value;
    });

    it("reaches the existing handler: an invalid zip is FILE_REJECTED, not blocked by the guard", async () => {
      const res = await put(superadmin);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("FILE_REJECTED");
      expect(openBufferSpy).toHaveBeenCalledTimes(1);
    });

    it("no token still fails auth (401), proving the guard isn't just always-open", async () => {
      const res = await put();
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("SIGN_IN_REQUIRED");
    });
  });
});
