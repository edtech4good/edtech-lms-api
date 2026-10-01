import { decode } from "jsonwebtoken";
import { ApiError } from "src/models/ApiError";
import { organisations } from "src/models/data-models/organisations";
import { tokens } from "src/models/data-models/tokens";
import { Role, TokenType } from "src/models/enums";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { dbinstance } from "src/services/dbservice";
import {
  isStaffSessionCurrent,
  organisationClaims,
  STAFF_SESSION_SQL,
  StaffSessionRow,
  TokenBusiness,
} from "./token.business";

/**
 * The organisation claims on a staff access token, and the refusal to mint one
 * for a suspended or deleted organisation. The HTTP behaviour (login, refresh,
 * the switcher) is in src/modules/auth/auth.organisation.spec.ts; this pins the
 * rules themselves.
 */
jest.mock("./role-permission.business", () => ({
  RolePermissionBusiness: jest.fn().mockImplementation(() => ({
    convertRolesPermsToArrayOfString: async () => [],
  })),
}));

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("organisationClaims", () => {
  it("platform: no organisation AND Super Admin -> isplatform true, organisationid null", () => {
    expect(organisationClaims(null, [Role.superadmin])).toEqual({ organisationid: null, isplatform: true });
    expect(organisationClaims(undefined, [Role.admin, Role.superadmin])).toEqual({
      organisationid: null,
      isplatform: true,
    });
  });

  it("an organisation's staff: their organisation, never platform", () => {
    expect(organisationClaims(ORG, [Role.admin])).toEqual({ organisationid: ORG, isplatform: false });
  });

  it("an organisation-holding Super Admin is not platform", () => {
    expect(organisationClaims(ORG, [Role.superadmin])).toEqual({ organisationid: ORG, isplatform: false });
    expect(organisationClaims(ORG, [Role.superadmin, Role.admin, Role.teacher])).toEqual({
      organisationid: ORG,
      isplatform: false,
    });
  });

  it("no organisation and no Super Admin: still gets a token's claims, null and false (a later package refuses this state)", () => {
    expect(organisationClaims(null, [Role.admin])).toEqual({ organisationid: null, isplatform: false });
    expect(organisationClaims(null, [])).toEqual({ organisationid: null, isplatform: false });
  });

  it("a platform user may act as an organisation: that organisation, isplatform still true", () => {
    expect(organisationClaims(null, [Role.superadmin], ORG)).toEqual({ organisationid: ORG, isplatform: true });
    expect(organisationClaims(null, [Role.superadmin], null)).toEqual({ organisationid: null, isplatform: true });
  });

  it("anyone else asking to act as an organisation throws: it cannot widen or move a non-platform token", () => {
    expect(() => organisationClaims(ORG, [Role.superadmin], OTHER)).toThrow();
    expect(() => organisationClaims(ORG, [Role.admin], OTHER)).toThrow();
    expect(() => organisationClaims(null, [Role.admin], OTHER)).toThrow();
    // but "acting as nobody" is no change
    expect(organisationClaims(ORG, [Role.admin], null)).toEqual({ organisationid: ORG, isplatform: false });
    expect(organisationClaims(ORG, [Role.admin], undefined)).toEqual({ organisationid: ORG, isplatform: false });
  });

  it("only the roleid Super Admin counts: the legacy role value and role NAMES do not", () => {
    expect(organisationClaims(null, ["Super Admin"]).isplatform).toBe(false);
    expect(organisationClaims(null, [Role.admin, Role.user, Role.teacher, Role.apikey]).isplatform).toBe(false);
  });
});

describe("TokenBusiness.generateAuthToken (organisation claims and the refusal)", () => {
  const roleRow = (roleid: string) => ({ roleid, rolename: roleid, permissions: [] });
  const userRow = (organisationid: string | null, roleids: string[]) =>
    ({
      lmsuserid: "u-1",
      lmsusername: "someone@example.com",
      lmsuserrole: Role.superadmin,
      firstname: "Sample",
      lastname: "Person",
      organisationid,
      roles: roleids.map(roleRow),
    }) as never;

  let usable: boolean;
  let count: jest.SpyInstance;
  let destroy: jest.SpyInstance;
  let create: jest.SpyInstance;

  beforeEach(() => {
    usable = true;
    count = jest.spyOn(organisations, "count").mockImplementation((async () => (usable ? 1 : 0)) as never);
    destroy = jest.spyOn(tokens, "destroy").mockResolvedValue(0 as never);
    create = jest.spyOn(tokens, "create").mockResolvedValue({} as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const claims = async (user: never, options?: { actingorganisationid?: string | null }) => {
    const { accessToken } = await new TokenBusiness().generateAuthToken(user, options);
    return decode(accessToken) as Record<string, unknown>;
  };

  it("puts organisationid and isplatform in the signed token, with null kept as null", async () => {
    const c = await claims(userRow(null, [Role.superadmin]));
    expect(c.organisationid).toBeNull();
    expect(c.isplatform).toBe(true);
    expect(Object.keys(c)).toContain("organisationid");
  });

  it("reads the claims from the user row it is given and the roles that row holds", async () => {
    expect(await claims(userRow(ORG, [Role.admin]))).toMatchObject({ organisationid: ORG, isplatform: false });
    expect(await claims(userRow(ORG, [Role.superadmin]))).toMatchObject({ organisationid: ORG, isplatform: false });
  });

  it("passes the acting organisation through for a platform user, and refuses it for anyone else before touching a token", async () => {
    expect(await claims(userRow(null, [Role.superadmin]), { actingorganisationid: ORG })).toMatchObject({
      organisationid: ORG,
      isplatform: true,
    });
    destroy.mockClear();
    create.mockClear();
    await expect(
      new TokenBusiness().generateAuthToken(userRow(ORG, [Role.superadmin]), { actingorganisationid: OTHER }),
    ).rejects.toThrow("Only a platform user");
    expect(destroy).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("asks whether the user's organisation is live and active, by id, and does not ask for a user with none", async () => {
    await claims(userRow(ORG, [Role.admin]));
    expect(count).toHaveBeenCalledWith({
      where: { organisationid: ORG, isdeleted: false, organisationstatus: true },
    });
    count.mockClear();
    await claims(userRow(null, [Role.superadmin]));
    expect(count).not.toHaveBeenCalled();
  });

  it("refuses a staff account with no organisation that is not a platform account, with the LOGIN_FAILED answer, before any token is touched", async () => {
    for (const roleids of [[Role.admin], [], [Role.teacher, Role.admin]]) {
      destroy.mockClear();
      create.mockClear();
      const error = await new TokenBusiness().generateAuthToken(userRow(null, roleids)).catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe(ErrorCode.LOGIN_FAILED);
      expect(error.message).toBe("The username or password is incorrect.");
      expect(destroy).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    }
    // asked nothing of the organisations table: there is no organisation to look up
    expect(count).not.toHaveBeenCalled();
  });

  it("an account with no organisation that holds Super Admin (a platform account) still signs in", async () => {
    expect(await claims(userRow(null, [Role.superadmin]))).toMatchObject({ organisationid: null, isplatform: true });
  });

  it("refuses a suspended or deleted organisation with the LOGIN_FAILED answer, before any token is deleted or written", async () => {
    usable = false;
    const error = await new TokenBusiness()
      .generateAuthToken(userRow(ORG, [Role.admin]))
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(ErrorCode.LOGIN_FAILED);
    expect(error.message).toBe("The username or password is incorrect.");
    expect(destroy).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("an organisation-holding Super Admin of a suspended organisation is refused too", async () => {
    usable = false;
    await expect(new TokenBusiness().generateAuthToken(userRow(ORG, [Role.superadmin]))).rejects.toMatchObject({
      code: ErrorCode.LOGIN_FAILED,
    });
  });

  it("replaces the user's access and refresh tokens, and stores the new access token's jti", async () => {
    const { accessToken } = await new TokenBusiness().generateAuthToken(userRow(null, [Role.superadmin]));
    const types = destroy.mock.calls.map((c) => c[0].where.tokentype);
    expect(types).toEqual(expect.arrayContaining([TokenType.ACCESS, TokenType.REFRESH]));
    const jti = (decode(accessToken) as { jti: string }).jti;
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ token: jti, lmsuserid: "u-1", tokentype: TokenType.ACCESS }),
    );
  });
});

/**
 * The per-request check on a staff access token: one query, then a pure rule.
 * The SQL runs on a real database in the PR description; here the rule is
 * driven row by row, and the call is checked for what it binds.
 */
describe("isStaffSessionCurrent (the rule applied to the query's row)", () => {
  const row = (over: Partial<StaffSessionRow> = {}): StaffSessionRow => ({
    isdisabled: 0,
    userorganisationid: null,
    claimedorganisationid: null,
    claimedisdeleted: null,
    claimedstatus: null,
    issuperadmin: 0,
    ...over,
  });
  const live = { claimedorganisationid: ORG, claimedisdeleted: 0, claimedstatus: 1 };

  it("a platform token is current while the user has no organisation and holds Super Admin", () => {
    expect(isStaffSessionCurrent(row({ issuperadmin: 1 }), { organisationid: null, isplatform: true })).toBe(true);
  });

  it("a platform token acting as a live, active organisation is current", () => {
    expect(
      isStaffSessionCurrent(row({ issuperadmin: 1, ...live }), { organisationid: ORG, isplatform: true }),
    ).toBe(true);
  });

  it("an organisation's staff token is current while the user is still in that organisation and it is live and active", () => {
    expect(
      isStaffSessionCurrent(row({ userorganisationid: ORG, ...live }), { organisationid: ORG, isplatform: false }),
    ).toBe(true);
  });

  it("refuses a staff token that acts in no organisation and is not platform (an unassigned account), whatever the row says", () => {
    expect(isStaffSessionCurrent(row(), { organisationid: null, isplatform: false })).toBe(false);
    expect(isStaffSessionCurrent(row({ issuperadmin: 1 }), { organisationid: null, isplatform: false })).toBe(false);
    expect(isStaffSessionCurrent(row({ userorganisationid: ORG }), { organisationid: null, isplatform: false })).toBe(false);
  });

  it("refuses when the token row is gone", () => {
    expect(isStaffSessionCurrent(undefined, { organisationid: null, isplatform: true })).toBe(false);
  });

  it("refuses when the user is disabled", () => {
    expect(isStaffSessionCurrent(row({ isdisabled: 1, issuperadmin: 1 }), { organisationid: null, isplatform: true })).toBe(false);
    expect(isStaffSessionCurrent(row({ isdisabled: true as never }), { organisationid: null, isplatform: false })).toBe(false);
  });

  it("refuses when the claimed organisation is suspended, deleted or does not exist - for staff and for a platform user acting as it", () => {
    for (const claim of [
      { organisationid: ORG, isplatform: false },
      { organisationid: ORG, isplatform: true },
    ]) {
      const user = claim.isplatform ? { issuperadmin: 1 } : { userorganisationid: ORG };
      expect(isStaffSessionCurrent(row({ ...user, ...live }), claim)).toBe(true);
      expect(isStaffSessionCurrent(row({ ...user, ...live, claimedstatus: 0 }), claim)).toBe(false);
      expect(isStaffSessionCurrent(row({ ...user, ...live, claimedisdeleted: 1 }), claim)).toBe(false);
      expect(isStaffSessionCurrent(row({ ...user, claimedorganisationid: null }), claim)).toBe(false);
    }
  });

  it("refuses a non-platform token when the user's organisation is no longer the claimed one", () => {
    expect(
      isStaffSessionCurrent(row({ userorganisationid: OTHER, claimedorganisationid: ORG, claimedisdeleted: 0, claimedstatus: 1 }), {
        organisationid: ORG,
        isplatform: false,
      }),
    ).toBe(false);
    // moved out of every organisation
    expect(isStaffSessionCurrent(row({ userorganisationid: null, ...live }), { organisationid: ORG, isplatform: false })).toBe(false);
  });

  it("refuses a platform token when the user now has an organisation, or no longer holds Super Admin", () => {
    expect(isStaffSessionCurrent(row({ issuperadmin: 1, userorganisationid: ORG }), { organisationid: null, isplatform: true })).toBe(false);
    expect(isStaffSessionCurrent(row({ issuperadmin: 0 }), { organisationid: null, isplatform: true })).toBe(false);
    expect(isStaffSessionCurrent(row({ issuperadmin: 1, userorganisationid: OTHER, ...live }), { organisationid: ORG, isplatform: true })).toBe(false);
  });
});

describe("TokenBusiness.validateStaffAccessToken", () => {
  let query: jest.SpyInstance;
  beforeEach(() => {
    query = jest.spyOn(dbinstance.getdbinstance(), "query");
  });
  afterEach(() => jest.restoreAllMocks());

  const payload = { jti: "jti-1", lmsuserid: "u-1", organisationid: ORG as string | null, isplatform: false };
  const goodRow = {
    isdisabled: 0,
    userorganisationid: ORG,
    claimedorganisationid: ORG,
    claimedisdeleted: 0,
    claimedstatus: 1,
    issuperadmin: 0,
  };

  it("runs exactly one query, binding the token's jti, user id, type and claimed organisation, and the Super Admin role", async () => {
    query.mockResolvedValue([goodRow] as never);
    await expect(new TokenBusiness().validateStaffAccessToken(payload)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, options] = query.mock.calls[0];
    expect(sql).toBe(STAFF_SESSION_SQL);
    expect(options.replacements).toEqual({
      jti: "jti-1",
      userid: "u-1",
      tokentype: TokenType.ACCESS,
      claimedorganisationid: ORG,
      superadminrole: Role.superadmin,
    });
  });

  it("the SQL joins tokens to lmsusers and left-joins organisations, and compares no column of one table with a column of another", () => {
    expect(STAFF_SESSION_SQL).toMatch(/FROM tokens t\s+JOIN lmsusers u ON u\.lmsuserid = :userid\s+LEFT JOIN organisations o ON o\.organisationid = :claimedorganisationid/);
    expect(STAFF_SESSION_SQL).toMatch(/t\.token = :jti AND t\.tokentype = :tokentype AND t\.lmsuserid = :userid/);
    expect(STAFF_SESSION_SQL).not.toMatch(/t\.lmsuserid = u\.|u\.lmsuserid = t\.|r\.lmsuserid = u\./);
  });

  it("binds null for a token that claims no organisation", async () => {
    query.mockResolvedValue([{ ...goodRow, userorganisationid: null, claimedorganisationid: null, issuperadmin: 1 }] as never);
    await expect(
      new TokenBusiness().validateStaffAccessToken({ ...payload, organisationid: null, isplatform: true }),
    ).resolves.toBe(true);
    expect(query.mock.calls[0][1].replacements.claimedorganisationid).toBeNull();
  });

  it("is false when no row comes back (the token row is gone)", async () => {
    query.mockResolvedValue([] as never);
    await expect(new TokenBusiness().validateStaffAccessToken(payload)).resolves.toBe(false);
  });

  it("is false when the row says the organisation is suspended", async () => {
    query.mockResolvedValue([{ ...goodRow, claimedstatus: 0 }] as never);
    await expect(new TokenBusiness().validateStaffAccessToken(payload)).resolves.toBe(false);
  });

  it("asks nothing, and is false, for a payload without a jti or a staff id or well-formed claims", async () => {
    for (const bad of [
      { ...payload, jti: undefined },
      { ...payload, lmsuserid: undefined },
      { ...payload, lmsuserid: "" },
      { ...payload, organisationid: undefined },
      { ...payload, isplatform: "true" },
    ]) {
      await expect(new TokenBusiness().validateStaffAccessToken(bad as never)).resolves.toBe(false);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("lets a database error through: a failed lookup is not an accepted token", async () => {
    query.mockRejectedValue(new Error("db down"));
    await expect(new TokenBusiness().validateStaffAccessToken(payload)).rejects.toThrow("db down");
  });
});
