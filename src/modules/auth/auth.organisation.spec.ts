import { Controller, Get, INestApplication, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { decode, sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { AccessGuard } from "src/guards/access.guard";
import { PlatformGuard } from "src/guards/platform.guard";
import { organisations } from "src/models/data-models/organisations";
import { tokens } from "src/models/data-models/tokens";
import { Role, TokenType } from "src/models/enums";
import { dbinstance } from "src/services/dbservice";
import { STAFF_SESSION_SQL } from "src/business/token.business";
import { hashPassword } from "src/services/password.service";
import { JwtAccessStrategy, JwtRefreshStrategy } from "src/services/auth.strategy";
import { AuthController } from "./auth.controller";

/**
 * Staff sign-in, refresh and the organisation switcher, driven over real HTTP
 * through the real controller, AuthBusiness, TokenBusiness, strategies and
 * guards. Replaced: the user lookups (UserBusiness), the permission lookup,
 * and the `organisations` and `tokens` tables, the last as an in-memory store
 * so "the old token stops working" and "a token is replaced" are real
 * behaviour, not assertions about calls.
 */
const PASSWORD = "SamplePass12";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_SUSPENDED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG_DELETED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ORG_UNKNOWN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const getuserbyemail = jest.fn();
const getuserbyid = jest.fn();
jest.mock("src/business/user.business", () => ({
  UserBusiness: jest.fn().mockImplementation(() => ({ getuserbyemail, getuserbyid })),
}));
jest.mock("src/business/role-permission.business", () => ({
  RolePermissionBusiness: jest.fn().mockImplementation(() => ({
    // The permission list is not what is tested here.
    convertRolesPermsToArrayOfString: async () => ["view_organisation"],
  })),
}));
// Sending the verification email is not under test.
jest.mock("src/services/email.service", () => ({
  sendverificationemail: jest.fn(),
  sendchangepasswordemail: jest.fn(),
}));

// ---- the organisations table ------------------------------------------------
type OrgRow = { organisationid: string; isdeleted: boolean; organisationstatus: boolean };
const orgTable = new Map<string, OrgRow>();
const resetOrgs = () => {
  orgTable.clear();
  for (const [id, isdeleted, organisationstatus] of [
    [ORG_A, false, true],
    [ORG_B, false, true],
    [ORG_SUSPENDED, false, false],
    [ORG_DELETED, true, true],
  ] as Array<[string, boolean, boolean]>) {
    orgTable.set(id, { organisationid: id, isdeleted, organisationstatus });
  }
};
const usableOrg = (id: string) => {
  const row = orgTable.get(id);
  return row !== undefined && !row.isdeleted && row.organisationstatus;
};

// ---- the tokens table, in memory --------------------------------------------
type TokenRow = { token: string; lmsuserid: string; tokentype: string };
let tokenTable: TokenRow[] = [];
const matches = (row: TokenRow, where: Partial<TokenRow>) =>
  Object.entries(where).every(([k, v]) => row[k as keyof TokenRow] === v);

// ---- users -------------------------------------------------------------------
const role = (roleid: string) => ({ roleid, rolename: roleid, permissions: [] });
const baseUser = {
  lmsuserpasswordhash: hashPassword(PASSWORD),
  firstname: "Sample",
  lastname: "Person",
  lmsuserrole: Role.superadmin, // the legacy column, stamped on every account
  isverified: true,
  isdisabled: false,
  countries: [],
  schools: [],
};
type UserRow = typeof baseUser & {
  lmsuserid: string;
  lmsusername: string;
  organisationid: string | null;
  roles: Array<ReturnType<typeof role>>;
};
const users: Record<string, UserRow> = {};
const resetUsers = () => {
  const make = (id: string, name: string, organisationid: string | null, roleids: string[]): UserRow => ({
    ...baseUser,
    lmsuserid: id,
    lmsusername: `${name}@example.com`,
    organisationid,
    roles: roleids.map(role),
  });
  for (const u of [
    make("u-platform", "platform", null, [Role.superadmin, Role.admin]),
    make("u-org", "orgstaff", ORG_A, [Role.admin]),
    make("u-orgsuper", "orgsuper", ORG_A, [Role.superadmin]),
    make("u-unassigned", "unassigned", null, [Role.admin]),
    make("u-suspended", "suspended", ORG_SUSPENDED, [Role.admin]),
    make("u-deleted", "deletedorg", ORG_DELETED, [Role.admin]),
  ]) {
    users[u.lmsuserid] = u;
  }
};

// A route only the platform may use, and one that echoes what @Org() sees.
@Controller("probe")
class ProbeController {
  @Get("platform")
  @UseGuards(AccessGuard(TokenType.ACCESS), PlatformGuard)
  platform(@Org() org: OrgContext) {
    return { org };
  }

  @Get("any")
  @UseGuards(AccessGuard(TokenType.ACCESS))
  any(@Org() org: OrgContext) {
    return { org };
  }
}

// Everything in an error body except `reference`, which is different on every response.
const ERROR_FIELDS = (body: { code: string; errormessage: string; hint?: string; fields?: unknown }) => ({
  code: body.code,
  errormessage: body.errormessage,
  hint: body.hint,
  fields: body.fields,
});

describe("staff sign-in, refresh and the organisation switcher", () => {
  let app: INestApplication;
  let logInfo: jest.SpyInstance;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, ProbeController],
      providers: [JwtAccessStrategy, JwtRefreshStrategy],
    })
      // Login is rate limited to 10 a minute; this spec signs in far more often.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    resetOrgs();
    resetUsers();
    tokenTable = [];
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    logInfo = jest.spyOn(Logger, "info").mockImplementation(() => Logger);

    getuserbyemail.mockImplementation(async (email: string) =>
      Object.values(users).find((u) => u.lmsusername === email && !u.isdisabled) ?? null,
    );
    getuserbyid.mockImplementation(async (id: string) => users[id] ?? null);

    jest.spyOn(organisations, "count").mockImplementation((async (o: { where: { organisationid: string } }) =>
      usableOrg(o.where.organisationid) ? 1 : 0) as never);
    jest.spyOn(organisations, "findOne").mockImplementation((async (o: { where: { organisationid: string } }) =>
      usableOrg(o.where.organisationid) ? orgTable.get(o.where.organisationid) : null) as never);

    // The per-request staff-token query (STAFF_SESSION_SQL), answered from the
    // same in-memory tables. The SQL text itself is exercised on a real database
    // (see the PR description); here the answer follows the tables.
    jest.spyOn(dbinstance.getdbinstance(), "query").mockImplementation((async (
      sql: string,
      options: { replacements: Record<string, string | null> },
    ) => {
      expect(sql).toBe(STAFF_SESSION_SQL);
      const r = options.replacements;
      const row = tokenTable.find(
        (t) => t.token === r.jti && t.tokentype === r.tokentype && t.lmsuserid === r.userid,
      );
      const u = users[r.userid as string];
      if (!row || !u) return [];
      const o = r.claimedorganisationid ? orgTable.get(r.claimedorganisationid) : undefined;
      return [
        {
          isdisabled: u.isdisabled ? 1 : 0,
          userorganisationid: u.organisationid,
          claimedorganisationid: o ? o.organisationid : null,
          claimedisdeleted: o ? (o.isdeleted ? 1 : 0) : null,
          claimedstatus: o ? (o.organisationstatus ? 1 : 0) : null,
          issuperadmin: u.roles.some((x) => x.roleid === r.superadminrole) ? 1 : 0,
        },
      ];
    }) as never);

    jest.spyOn(tokens, "create").mockImplementation((async (row: TokenRow) => {
      tokenTable.push({ ...row });
      return row;
    }) as never);
    jest.spyOn(tokens, "destroy").mockImplementation((async (o: { where: Partial<TokenRow> }) => {
      const before = tokenTable.length;
      tokenTable = tokenTable.filter((r) => !matches(r, o.where));
      return before - tokenTable.length;
    }) as never);
    jest.spyOn(tokens, "count").mockImplementation((async (o: { where: Partial<TokenRow> }) =>
      tokenTable.filter((r) => matches(r, o.where)).length) as never);
    jest.spyOn(tokens, "findOne").mockImplementation((async (o: { where: Partial<TokenRow> }) =>
      tokenTable.find((r) => matches(r, o.where)) ?? null) as never);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer()).post("/auth/login").send({ lmsusername: email, lmsuserpassword: password });
  const claimsOf = (jwt: string) => decode(jwt) as Record<string, unknown>;
  const signIn = async (email: string) => {
    const res = await login(email).expect(200);
    return res.body.data as { accessToken: string; refreshToken: string };
  };
  const refresh = (refreshToken: string) =>
    request(app.getHttpServer()).post(`/auth/refreshtoken?refreshtoken=${refreshToken}`);
  const switchTo = (accessToken: string | undefined, organisationid: unknown) => {
    const req = request(app.getHttpServer()).post("/auth/organisation");
    if (accessToken) req.set("Authorization", `Bearer ${accessToken}`);
    return req.send({ organisationid });
  };
  const probe = (path: string, accessToken: string) =>
    request(app.getHttpServer()).get(`/probe/${path}`).set("Authorization", `Bearer ${accessToken}`);

  describe("sign-in: the claims on the staff access token", () => {
    it("platform user (no organisation, holds Super Admin): isplatform true, organisationid null", async () => {
      const { accessToken } = await signIn("platform@example.com");
      expect(claimsOf(accessToken)).toMatchObject({ organisationid: null, isplatform: true, lmsuserid: "u-platform" });
      // null is present in the token, not omitted: absent would be refused.
      expect(Object.prototype.hasOwnProperty.call(claimsOf(accessToken), "organisationid")).toBe(true);
    });

    it("organisation staff: organisationid is their organisation, isplatform false", async () => {
      const { accessToken } = await signIn("orgstaff@example.com");
      expect(claimsOf(accessToken)).toMatchObject({ organisationid: ORG_A, isplatform: false });
    });

    it("a user with NO organisation and WITHOUT Super Admin cannot sign in: the answer is the wrong-password answer, and no token is issued", async () => {
      const bad = await login("orgstaff@example.com", "WrongPass12").expect(400);
      const res = await login("unassigned@example.com").expect(400);
      expect(res.body.code).toBe("LOGIN_FAILED");
      expect(ERROR_FIELDS(res.body)).toEqual(ERROR_FIELDS(bad.body));
      expect(res.body.errormessage).toBe("The username or password is incorrect.");
      expect(tokenTable.filter((t) => t.lmsuserid === "u-unassigned")).toEqual([]);
      expect(logInfo).toHaveBeenCalledWith(
        "Sign-in blocked: staff account has no organisation",
        expect.objectContaining({ username: "unassigned@example.com" }),
      );
    });

    it("the same account signs in once it has an organisation", async () => {
      await login("unassigned@example.com").expect(400);
      users["u-unassigned"].organisationid = ORG_B;
      const res = await login("unassigned@example.com").expect(200);
      expect(claimsOf(res.body.data.accessToken)).toMatchObject({ organisationid: ORG_B, isplatform: false });
    });

    it("a Super Admin who HAS an organisation is never platform", async () => {
      const { accessToken } = await signIn("orgsuper@example.com");
      expect(claimsOf(accessToken)).toMatchObject({
        organisationid: ORG_A,
        isplatform: false,
        lmsuserroles: [Role.superadmin],
      });
      // and the platform guard refuses it
      await probe("platform", accessToken).expect(403);
    });

    it("the legacy lmsuserrole column (superadmin on every account) makes nobody platform", async () => {
      const { accessToken } = await signIn("orgstaff@example.com");
      expect(claimsOf(accessToken).lmsuserrole).toBe(Role.superadmin);
      expect(claimsOf(accessToken).isplatform).toBe(false);
    });

    it("the issued token is accepted by the strategy, and replaces the user's previous one", async () => {
      const first = await signIn("platform@example.com");
      await probe("any", first.accessToken).expect(200);
      const second = await signIn("platform@example.com");
      await probe("any", second.accessToken).expect(200);
      await probe("any", first.accessToken).expect(401);
      expect(tokenTable.filter((t) => t.lmsuserid === "u-platform" && t.tokentype === TokenType.ACCESS)).toHaveLength(1);
    });
  });

  describe("sign-in is refused, with the same generic answer as a bad password, for a suspended or deleted organisation", () => {
    it("a suspended organisation", async () => {
      const bad = await login("orgstaff@example.com", "WrongPass12").expect(400);
      const res = await login("suspended@example.com").expect(400);
      expect(res.body.code).toBe("LOGIN_FAILED");
      expect(ERROR_FIELDS(res.body)).toEqual(ERROR_FIELDS(bad.body));
      expect(res.body.errormessage).toBe("The username or password is incorrect.");
      expect(res.body.data).toBe(false);
    });

    it("a deleted organisation", async () => {
      const bad = await login("orgstaff@example.com", "WrongPass12").expect(400);
      const res = await login("deletedorg@example.com").expect(400);
      expect(ERROR_FIELDS(res.body)).toEqual(ERROR_FIELDS(bad.body));
    });

    it("no token of any kind is issued or touched", async () => {
      tokenTable.push({ token: "existing", lmsuserid: "u-suspended", tokentype: TokenType.ACCESS });
      await login("suspended@example.com").expect(400);
      expect(tokenTable).toEqual([{ token: "existing", lmsuserid: "u-suspended", tokentype: TokenType.ACCESS }]);
    });

    it("the reason is logged server-side, not sent", async () => {
      const res = await login("suspended@example.com").expect(400);
      expect(JSON.stringify(res.body)).not.toMatch(/organisation|suspend|deleted/i);
      expect(logInfo).toHaveBeenCalledWith(
        "Sign-in blocked: organisation suspended or deleted",
        expect.objectContaining({ username: "suspended@example.com" }),
      );
    });

    it("the same user signs in again once the organisation is active", async () => {
      await login("suspended@example.com").expect(400);
      orgTable.get(ORG_SUSPENDED)!.organisationstatus = true;
      const res = await login("suspended@example.com").expect(200);
      expect(claimsOf(res.body.data.accessToken)).toMatchObject({ organisationid: ORG_SUSPENDED, isplatform: false });
    });

    it("an organisation row that does not exist at all is refused the same way", async () => {
      users["u-org"].organisationid = ORG_UNKNOWN;
      await login("orgstaff@example.com").expect(400);
    });
  });

  describe("refresh re-reads the user; it does not copy claims from the old token", () => {
    it("issues claims from the database NOW: an organisation change since sign-in shows up", async () => {
      const { refreshToken, accessToken } = await signIn("orgstaff@example.com");
      expect(claimsOf(accessToken)).toMatchObject({ organisationid: ORG_A, isplatform: false });

      users["u-org"].organisationid = ORG_B;
      const res = await refresh(refreshToken).expect(200);
      expect(claimsOf(res.body.data.accessToken)).toMatchObject({ organisationid: ORG_B, isplatform: false });
    });

    it("Super Admin removed since sign-in: the account is now unassigned, and the refresh is refused (401)", async () => {
      const { refreshToken, accessToken } = await signIn("platform@example.com");
      expect(claimsOf(accessToken).isplatform).toBe(true);

      users["u-platform"].roles = [role(Role.admin)];
      const before = JSON.stringify(tokenTable);
      const res = await refresh(refreshToken).expect(401);
      expect(res.body.code).toBe("SIGN_IN_REQUIRED");
      expect(JSON.stringify(tokenTable)).toBe(before);
    });

    it("an organisation assigned to a platform user since sign-in: the refreshed token is no longer platform", async () => {
      const { refreshToken } = await signIn("platform@example.com");
      users["u-platform"].organisationid = ORG_A;
      const res = await refresh(refreshToken).expect(200);
      expect(claimsOf(res.body.data.accessToken)).toMatchObject({ isplatform: false, organisationid: ORG_A });
    });

    it("is refused, generically, when the organisation has been suspended since sign-in", async () => {
      const { refreshToken } = await signIn("orgstaff@example.com");
      orgTable.get(ORG_A)!.organisationstatus = false;
      const res = await refresh(refreshToken).expect(401);
      expect(res.body.code).toBe("SIGN_IN_REQUIRED");
      expect(JSON.stringify(res.body)).not.toMatch(/organisation|suspend/i);
    });

    it("is refused when the organisation has been deleted since sign-in, and issues no token", async () => {
      const { refreshToken } = await signIn("orgstaff@example.com");
      const before = JSON.stringify(tokenTable);
      orgTable.get(ORG_A)!.isdeleted = true;
      const res = await refresh(refreshToken).expect(401);
      expect(res.body.code).toBe("SIGN_IN_REQUIRED");
      expect(JSON.stringify(tokenTable)).toBe(before);
    });

    it("works again once the organisation is active", async () => {
      const { refreshToken } = await signIn("orgstaff@example.com");
      orgTable.get(ORG_A)!.organisationstatus = false;
      await refresh(refreshToken).expect(401);
      orgTable.get(ORG_A)!.organisationstatus = true;
      await refresh(refreshToken).expect(200);
    });

    it("a refresh of an organisation-less platform user keeps the claims right", async () => {
      const { refreshToken } = await signIn("platform@example.com");
      const res = await refresh(refreshToken).expect(200);
      expect(claimsOf(res.body.data.accessToken)).toMatchObject({ organisationid: null, isplatform: true });
    });
  });

  describe("POST /auth/organisation (the switcher)", () => {
    it("platform -> organisation A: a fresh token carries A and stays platform; the response follows the login shape", async () => {
      const { accessToken } = await signIn("platform@example.com");
      const res = await switchTo(accessToken, ORG_A).expect(200);

      expect(res.body.error).toBe(false);
      expect(Object.keys(res.body.data).sort()).toEqual(["accessToken", "refreshToken"]);
      expect(claimsOf(res.body.data.accessToken)).toMatchObject({
        organisationid: ORG_A,
        isplatform: true,
        lmsuserid: "u-platform",
      });
      expect(res.body.data.accessToken).not.toBe(accessToken);
    });

    it("the new token works, as a platform token acting as A", async () => {
      const { accessToken } = await signIn("platform@example.com");
      const { body } = await switchTo(accessToken, ORG_A).expect(200);
      const res = await probe("platform", body.data.accessToken).expect(200);
      expect(res.body.org).toEqual({ organisationid: ORG_A, isplatform: true });
    });

    it("the OLD token no longer validates, and neither does the old refresh token", async () => {
      const { accessToken, refreshToken } = await signIn("platform@example.com");
      await probe("any", accessToken).expect(200);
      await switchTo(accessToken, ORG_A).expect(200);
      await probe("any", accessToken).expect(401);
      await refresh(refreshToken).expect(401);
      // one access token per user, still
      expect(tokenTable.filter((t) => t.lmsuserid === "u-platform" && t.tokentype === TokenType.ACCESS)).toHaveLength(1);
      expect(tokenTable.filter((t) => t.lmsuserid === "u-platform" && t.tokentype === TokenType.REFRESH)).toHaveLength(1);
    });

    it("switching straight from A to B: the token carries B", async () => {
      const first = await signIn("platform@example.com");
      const toA = (await switchTo(first.accessToken, ORG_A).expect(200)).body.data;
      const toB = (await switchTo(toA.accessToken, ORG_B).expect(200)).body.data;
      expect(claimsOf(toB.accessToken)).toMatchObject({ organisationid: ORG_B, isplatform: true });
      await probe("any", toA.accessToken).expect(401);
    });

    it("null returns to all organisations: organisationid null, still platform", async () => {
      const first = await signIn("platform@example.com");
      const toA = (await switchTo(first.accessToken, ORG_A).expect(200)).body.data;
      const back = (await switchTo(toA.accessToken, null).expect(200)).body.data;
      expect(claimsOf(back.accessToken)).toMatchObject({ organisationid: null, isplatform: true });
      await probe("platform", back.accessToken).expect(200);
    });

    it("writes exactly one audit line per switch: who, from which organisation, to which", async () => {
      const first = await signIn("platform@example.com");
      logInfo.mockClear();
      const toA = (await switchTo(first.accessToken, ORG_A).expect(200)).body.data;
      expect(logInfo).toHaveBeenCalledTimes(1);
      expect(logInfo).toHaveBeenLastCalledWith(
        "Platform user switched organisation",
        expect.objectContaining({
          audit: "organisation-switch",
          lmsuserid: "u-platform",
          username: "platform@example.com",
          fromorganisationid: null,
          toorganisationid: ORG_A,
          ip: expect.stringMatching(/127\.0\.0\.1/),
        }),
      );
      await switchTo(toA.accessToken, null).expect(200);
      expect(logInfo).toHaveBeenCalledTimes(2);
      expect(logInfo).toHaveBeenLastCalledWith(
        "Platform user switched organisation",
        expect.objectContaining({ fromorganisationid: ORG_A, toorganisationid: null }),
      );
    });

    it("the audit line holds no token", async () => {
      const first = await signIn("platform@example.com");
      logInfo.mockClear();
      const toA = (await switchTo(first.accessToken, ORG_A).expect(200)).body.data;
      const logged = JSON.stringify(logInfo.mock.calls);
      expect(logged).not.toContain(first.accessToken);
      expect(logged).not.toContain(toA.accessToken);
    });

    describe("only the platform may switch (403)", () => {
      it.each([
        ["an organisation's staff user", "orgstaff@example.com"],
        ["an organisation's Super Admin", "orgsuper@example.com"],
      ])("refuses %s, and nothing changes", async (_name, email) => {
        const { accessToken } = await signIn(email);
        const before = JSON.stringify(tokenTable);
        logInfo.mockClear();
        const res = await switchTo(accessToken, ORG_B).expect(403);
        expect(res.body.code).toBe("NOT_ALLOWED");
        expect(JSON.stringify(tokenTable)).toBe(before);
        expect(logInfo).not.toHaveBeenCalled();
        await probe("any", accessToken).expect(200);
      });

      it("refuses no token with 401", async () => {
        await switchTo(undefined, ORG_A).expect(401);
      });

      it("refuses a Super Admin token that predates the claims with 401", async () => {
        const old = sign(
          { jti: "old", lmsuserid: "u-platform", lmsuserroles: [Role.superadmin], permissions: ["superadmin"] },
          Config.fortyk.api.applicationsecret,
          { expiresIn: "5m" },
        );
        tokenTable.push({ token: "old", lmsuserid: "u-platform", tokentype: TokenType.ACCESS });
        await switchTo(old, ORG_A).expect(401);
      });

      it("a token with isplatform false is refused (401) for a user who has since become a platform account: the claim no longer matches", async () => {
        const { accessToken } = await signIn("orgstaff@example.com");
        // The account is now a platform account (no organisation, Super Admin).
        users["u-org"].organisationid = null;
        users["u-org"].roles = [role(Role.admin), role(Role.superadmin)];
        const before = JSON.stringify(tokenTable);
        await switchTo(accessToken, ORG_A).expect(401);
        expect(JSON.stringify(tokenTable)).toBe(before);
      });

      it("a token still claiming platform for a user who is no longer one is refused on the request itself (401), before the switcher runs", async () => {
        const { accessToken } = await signIn("platform@example.com");
        // Super Admin removed WITHOUT the tokens being revoked (e.g. by hand in SQL).
        users["u-platform"].roles = [role(Role.admin)];
        const before = JSON.stringify(tokenTable);
        await switchTo(accessToken, ORG_A).expect(401);
        expect(JSON.stringify(tokenTable)).toBe(before);
      });

      it("a disabled user must sign in again (401), and nothing is issued", async () => {
        const { accessToken } = await signIn("platform@example.com");
        users["u-platform"].isdisabled = true;
        const before = JSON.stringify(tokenTable);
        await switchTo(accessToken, ORG_A).expect(401);
        expect(JSON.stringify(tokenTable)).toBe(before);
      });
    });

    describe("an unknown, deleted or suspended organisation is one 404", () => {
      const ask = async (organisationid: string) => {
        const { accessToken } = await signIn("platform@example.com");
        return { accessToken, res: await switchTo(accessToken, organisationid) };
      };

      it("unknown, deleted and suspended answer identically", async () => {
        const unknown = (await ask(ORG_UNKNOWN)).res;
        const deleted = (await ask(ORG_DELETED)).res;
        const suspended = (await ask(ORG_SUSPENDED)).res;
        for (const res of [unknown, deleted, suspended]) {
          expect(res.status).toBe(404);
          expect(res.body.code).toBe("NOT_FOUND");
        }
        expect(ERROR_FIELDS(deleted.body)).toEqual(ERROR_FIELDS(unknown.body));
        expect(ERROR_FIELDS(suspended.body)).toEqual(ERROR_FIELDS(unknown.body));
      });

      it("issues nothing, logs no switch, and leaves the caller's token working", async () => {
        const { accessToken, res } = await ask(ORG_SUSPENDED);
        expect(res.status).toBe(404);
        logInfo.mockClear();
        await switchTo(accessToken, ORG_DELETED).expect(404);
        expect(logInfo).not.toHaveBeenCalled();
        await probe("platform", accessToken).expect(200);
      });
    });

    describe("request validation", () => {
      it.each([
        ["a missing organisationid (null is an answer, absent is not)", undefined],
        ["a number", 7],
        ["an object", {}],
        ["a string that is not a uuid", "not-a-uuid"],
        ["an empty string", ""],
      ])("rejects %s with 400", async (_name, value) => {
        const { accessToken } = await signIn("platform@example.com");
        const req = request(app.getHttpServer())
          .post("/auth/organisation")
          .set("Authorization", `Bearer ${accessToken}`);
        const res = await (value === undefined ? req.send({}) : req.send({ organisationid: value })).expect(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        await probe("any", accessToken).expect(200);
      });

      it("rejects an unknown key and a hostile __proto__ key with 400", async () => {
        const { accessToken } = await signIn("platform@example.com");
        await request(app.getHttpServer())
          .post("/auth/organisation")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ organisationid: ORG_A, isplatform: true })
          .expect(400);
        await request(app.getHttpServer())
          .post("/auth/organisation")
          .set("Authorization", `Bearer ${accessToken}`)
          .set("Content-Type", "application/json")
          .send(`{"organisationid":null,"__proto__":{"isplatform":true}}`)
          .expect(400);
        await probe("any", accessToken).expect(200);
      });
    });

    it("a refresh after switching returns to the user's own claims (the acting choice is not carried over)", async () => {
      const first = await signIn("platform@example.com");
      const toA = (await switchTo(first.accessToken, ORG_A).expect(200)).body.data;
      const res = await refresh(toA.refreshToken).expect(200);
      expect(claimsOf(res.body.data.accessToken)).toMatchObject({ organisationid: null, isplatform: true });
    });
  });
});
