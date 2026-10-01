import { decode } from "jsonwebtoken";
import { ApiError } from "src/models/ApiError";
import { organisations } from "src/models/data-models/organisations";
import { tokens } from "src/models/data-models/tokens";
import { Role, TokenType } from "src/models/enums";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { organisationClaims, TokenBusiness } from "./token.business";

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
    expect(await claims(userRow(null, [Role.admin]))).toMatchObject({ organisationid: null, isplatform: false });
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
