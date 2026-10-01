import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { lmsusers } from "src/models/data-models/lmsusers";
import { tokens } from "src/models/data-models/tokens";
import { TokenType } from "src/models/enums";
import { sendchangepasswordemail, sendverificationemail } from "src/services/email.service";
import { AuthController } from "./auth.controller";

/**
 * A password-reset link, and a verification link, go only to the address stored
 * on the account, and a request acts only when the address it gives is that
 * account's address (trimmed, Unicode NFC, lower-cased on both sides). An
 * address that is not the same text as the stored one, even where the database
 * would compare them as equal, is handled exactly like an address nobody has:
 * no token, no mail, the same answer.
 *
 * Driven over real HTTP through the real controller, validators and business
 * classes. Replaced: the mailer, and the `lmsusers` and `tokens` tables (the
 * user lookup is looser than exact text, as the database's is).
 */
jest.mock("src/services/email.service", () => ({
  sendchangepasswordemail: jest.fn(),
  sendverificationemail: jest.fn(),
}));

const STORED = "person@example.com";
const OTHER_STORED = "Person@Example.com";
const DIFFERENT_ADDRESS = "person@ex\u00e4mple.com";

type UserRow = { lmsuserid: string; lmsusername: string; isdisabled: boolean };
let userTable: UserRow[] = [];
let tokenTable: Array<{ token: string; lmsuserid: string; tokentype: string }> = [];

/** The loose comparison the replaced lookup uses (looser than exact text). */
const looseKey = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ +$/, "");

const flush = () => new Promise((resolve) => setTimeout(resolve, 25));
const withoutReference = (body: Record<string, unknown>) => {
  const { reference: _reference, logid: _logid, stack: _stack, ...rest } = body;
  return rest;
};

describe("password-reset and verification mail: recipient and who the request names", () => {
  let app: INestApplication;
  let warn: jest.SpyInstance;
  let info: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [AuthController] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    (sendchangepasswordemail as jest.Mock).mockReset().mockResolvedValue(undefined);
    (sendverificationemail as jest.Mock).mockReset().mockResolvedValue(undefined);
    userTable = [{ lmsuserid: "u-1", lmsusername: STORED, isdisabled: false }];
    tokenTable = [];
    warn = jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    info = jest.spyOn(Logger, "info").mockImplementation(() => Logger);
    jest.spyOn(Logger, "error").mockImplementation(() => Logger);

    jest.spyOn(lmsusers, "findAll").mockImplementation((async (o: { where: { lmsusername: string; isdisabled?: boolean } }) =>
      userTable.filter(
        (u) =>
          looseKey(u.lmsusername) === looseKey(o.where.lmsusername) &&
          (o.where.isdisabled === undefined || u.isdisabled === o.where.isdisabled),
      )) as never);
    jest.spyOn(lmsusers, "findOne").mockImplementation((async (o: { where: { lmsusername?: string } }) =>
      userTable.find((u) => looseKey(u.lmsusername) === looseKey(o.where.lmsusername ?? "\u0000")) ?? null) as never);
    jest.spyOn(tokens, "create").mockImplementation((async (row: (typeof tokenTable)[number]) => {
      tokenTable.push({ ...row });
      return row;
    }) as never);
    jest.spyOn(tokens, "destroy").mockImplementation((async (o: { where: { lmsuserid: string; tokentype: string } }) => {
      tokenTable = tokenTable.filter((r) => !(r.lmsuserid === o.where.lmsuserid && r.tokentype === o.where.tokentype));
      return 1;
    }) as never);
  });

  afterAll(async () => {
    await app.close();
  });

  const forgot = (address: string) =>
    request(app.getHttpServer()).post("/auth/forgotpassword").send({ lmsusername: address });
  const verify = (address: string) =>
    request(app.getHttpServer()).put("/auth/sendverificationemail").send({ lmsusername: address });
  const resetTokens = () => tokenTable.filter((t) => t.tokentype === TokenType.CHANGEPASSWORD);
  const verifyTokens = () => tokenTable.filter((t) => t.tokentype === TokenType.VERIFYEMAIL);

  describe("POST /auth/forgotpassword", () => {
    it("a matching request creates one token and sends one mail to the stored address", async () => {
      const res = await forgot(STORED).expect(200);
      expect(res.body).toEqual({ data: "Password reset mail sent.", error: false });
      await flush();
      expect(resetTokens()).toHaveLength(1);
      expect(sendchangepasswordemail).toHaveBeenCalledTimes(1);
      expect(sendchangepasswordemail).toHaveBeenCalledWith(STORED, expect.any(String));
    });

    it("mail goes to the stored address, whatever capitals the request used", async () => {
      await forgot("PERSON@EXAMPLE.COM").expect(200);
      await flush();
      expect(resetTokens()).toHaveLength(1);
      expect(sendchangepasswordemail).toHaveBeenCalledTimes(1);
      expect((sendchangepasswordemail as jest.Mock).mock.calls[0][0]).toBe(STORED);
    });

    it("mail goes to the stored address exactly as stored", async () => {
      userTable = [{ lmsuserid: "u-1", lmsusername: OTHER_STORED, isdisabled: false }];
      await forgot("person@example.com").expect(200);
      await flush();
      expect((sendchangepasswordemail as jest.Mock).mock.calls[0][0]).toBe(OTHER_STORED);
    });

    it("a link is created only for the account's own address: any other address is handled exactly like an unknown one", async () => {
      const differentAddress = await forgot(DIFFERENT_ADDRESS);
      const unknown = await forgot("nobody@example.com");
      await flush();
      expect(differentAddress.status).toBe(200);
      expect(differentAddress.status).toBe(unknown.status);
      expect(differentAddress.body).toEqual(unknown.body);
      expect(tokenTable).toEqual([]);
      expect(sendchangepasswordemail).not.toHaveBeenCalled();
    });

    it("an unknown address creates no token and sends nothing", async () => {
      await forgot("nobody@example.com").expect(200);
      await flush();
      expect(tokenTable).toEqual([]);
      expect(sendchangepasswordemail).not.toHaveBeenCalled();
    });

    it("a disabled account gets nothing, as before", async () => {
      userTable[0].isdisabled = true;
      await forgot(STORED).expect(200);
      await flush();
      expect(tokenTable).toEqual([]);
      expect(sendchangepasswordemail).not.toHaveBeenCalled();
    });

    it("when more than one account matches, none is acted on and the log line holds no address", async () => {
      userTable = [
        { lmsuserid: "u-1", lmsusername: "person@example.com", isdisabled: false },
        { lmsuserid: "u-2", lmsusername: "Person@example.com", isdisabled: false },
      ];
      const res = await forgot("person@example.com");
      await flush();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: "Password reset mail sent.", error: false });
      expect(tokenTable).toEqual([]);
      expect(sendchangepasswordemail).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/person|example/i);
    });

    it("the existing unknown-address log line is unchanged, and the matching path logs no address", async () => {
      await forgot("nobody@example.com").expect(200);
      expect(info).toHaveBeenCalledWith("Forgot-password requested for unknown email", { username: "nobody@example.com" });
      info.mockClear();
      await forgot(STORED).expect(200);
      await flush();
      expect(info).not.toHaveBeenCalled();
    });

    it("sends the mail without waiting on it: a mail that never completes does not hold the response", async () => {
      (sendchangepasswordemail as jest.Mock).mockReturnValue(new Promise(() => undefined));
      await forgot(STORED).expect(200);
    });
  });

  describe("PUT /auth/sendverificationemail", () => {
    it("a matching request creates one token and sends one mail to the stored address", async () => {
      const res = await verify(STORED).expect(200);
      expect(res.body).toEqual({ data: "Verification mail sent.", error: false });
      expect(verifyTokens()).toHaveLength(1);
      expect(sendverificationemail).toHaveBeenCalledTimes(1);
      expect((sendverificationemail as jest.Mock).mock.calls[0][0]).toBe(STORED);
    });

    it("mail goes to the stored address, whatever capitals the request used", async () => {
      userTable = [{ lmsuserid: "u-1", lmsusername: OTHER_STORED, isdisabled: false }];
      await verify("PERSON@example.com").expect(200);
      expect(verifyTokens()).toHaveLength(1);
      expect((sendverificationemail as jest.Mock).mock.calls[0][0]).toBe(OTHER_STORED);
    });

    it("a link is created only for the account's own address: any other address is handled exactly like an unknown one", async () => {
      const differentAddress = await verify(DIFFERENT_ADDRESS);
      const unknown = await verify("nobody@example.com");
      expect(differentAddress.status).toBe(unknown.status);
      expect(withoutReference(differentAddress.body)).toEqual(withoutReference(unknown.body));
      expect(tokenTable).toEqual([]);
      expect(sendverificationemail).not.toHaveBeenCalled();
    });

    it("an unknown address creates no token and sends nothing", async () => {
      await verify("nobody@example.com");
      expect(tokenTable).toEqual([]);
      expect(sendverificationemail).not.toHaveBeenCalled();
    });

    it("when more than one account matches, none is acted on", async () => {
      userTable = [
        { lmsuserid: "u-1", lmsusername: "person@example.com", isdisabled: false },
        { lmsuserid: "u-2", lmsusername: "Person@example.com", isdisabled: false },
      ];
      await verify("person@example.com");
      expect(tokenTable).toEqual([]);
      expect(sendverificationemail).not.toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/person|example/i);
    });
  });
});
