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

// FileInterceptor("importfile", ...) builds a bare multer() with no `storage`
// or `dest` option, so multer defaults to its in-memory storage engine (see
// node_modules/@nestjs/platform-express/node_modules/multer/index.js -
// `this.storage = memoryStorage()`). That engine's `_handleFile` is the one
// piece of code that actually reads the multipart body off the wire: this is
// what "the upload is parsed" means below, not `Open.buffer` (which only
// proves the *handler* ran, not that multer parsed anything - see the
// beforeAll comment).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const memoryStorage = require("@nestjs/platform-express/node_modules/multer/storage/memory");

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
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    // The staff-token check is one database query in production; here it answers like the token lookup.
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const signToken = (roles: string[]) =>
  `Bearer ${sign(
    {
      jti: "test-jti",
      lmsuserid: "user-1",
      lmsuserroles: roles,
      permissions: [],
      organisationid: null,
      isplatform: false,
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
  let multerHandleFileSpy: jest.SpyInstance;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    originalEnv = process.env.LOG_IMPORT_ENABLED;
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
    // The `Open.buffer` spy above only proves the *handler* didn't run - it
    // says nothing about multer. Proven: moving the enabled-check into an
    // interceptor placed AFTER FileInterceptor (so multer parses first and
    // only the handler stays blocked) left the old "never parsed" test
    // green. Spy on multer's own memory-storage engine instead: its
    // `_handleFile` is what actually reads bytes off the multipart body.
    // `memoryStorage()` returns a fresh instance each call, but every
    // instance shares the same `MemoryStorage.prototype` (module caching
    // means FileInterceptor's own internal `memoryStorage()` call resolves
    // the identical module), so spying on the prototype via this throwaway
    // instance intercepts the real one too.
    const throwawayStorageInstance = memoryStorage();
    multerHandleFileSpy = jest.spyOn(
      Object.getPrototypeOf(throwawayStorageInstance),
      "_handleFile"
    );
  });

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
    openBufferSpy.mockClear();
    multerHandleFileSpy.mockClear();
  });

  afterAll(async () => {
    openBufferSpy.mockRestore();
    multerHandleFileSpy.mockRestore();
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

    it("the upload is never parsed: the same invalid-zip body that gets FILE_REJECTED when enabled gets 404 here, multer never reads the body, and the handler is never called", async () => {
      const res = await put(superadmin);
      expect(res.status).toBe(404);
      expect(res.body.code).not.toBe("FILE_REJECTED");
      expect(multerHandleFileSpy).not.toHaveBeenCalled();
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
      expect(multerHandleFileSpy).toHaveBeenCalledTimes(1);
      expect(openBufferSpy).toHaveBeenCalledTimes(1);
    });

    it("no token still fails auth (401), proving the guard isn't just always-open", async () => {
      const res = await put();
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("SIGN_IN_REQUIRED");
    });
  });
});
