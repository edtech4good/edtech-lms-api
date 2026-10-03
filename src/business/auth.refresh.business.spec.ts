import { sign } from "jsonwebtoken";
import { Config, Logger } from "src/config";
import { tokens } from "src/models/data-models/tokens";
import { Role, TokenType } from "src/models/enums";
import { AuthBusiness } from "./auth.business";

/**
 * AuthBusiness.refreshAuth, called directly (no route guard in front of it):
 *  - it verifies the refresh token's signature and its row itself, before it reads
 *    anything in the token, so it does not depend on the route's guard;
 *  - it keeps the acting organisation while that is still valid, and when it ends
 *    an acting session it writes one audit line (who, which organisation it stopped
 *    acting as, where the session went, why, the client address) and nothing else
 *    is logged for an ordinary refresh.
 * The real `verifyToken` runs, over an in-memory `tokens` table; the user lookup,
 * the organisation lookup and the minting of the new tokens are replaced.
 */
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const getuserbyid = jest.fn();
jest.mock("./user.business", () => ({
  UserBusiness: jest.fn().mockImplementation(() => ({ getuserbyid })),
}));
const getactiveorganisation = jest.fn();
jest.mock("./organisation.business", () => ({
  OrganisationBusiness: jest.fn().mockImplementation(() => ({ getactiveorganisation })),
}));
const generateAuthToken = jest.fn();
jest.mock("./token.business", () => {
  const actual = jest.requireActual("./token.business");
  return {
    ...actual,
    // the real signature-and-row check; only minting is replaced
    TokenBusiness: jest.fn().mockImplementation(() => ({
      verifyToken: new actual.TokenBusiness().verifyToken,
      generateAuthToken,
    })),
  };
});

let rows: Array<{ token: string; lmsuserid: string; tokentype: string }>;
let logInfo: jest.SpyInstance;

const platformUser = (over: Record<string, unknown> = {}) => ({
  lmsuserid: "u-platform",
  lmsusername: "platform@example.com",
  organisationid: null,
  isdisabled: false,
  isverified: true,
  roles: [{ roleid: Role.superadmin }],
  ...over,
});

/** A refresh token as the server signs it (claims in the payload), with its row in the table unless `row` is false. */
const refreshToken = (claims: Record<string, unknown> = {}, o: { key?: string; row?: boolean; jti?: string } = {}) => {
  const jti = o.jti ?? `jti-${Math.random()}`;
  if (o.row !== false) rows.push({ token: jti, lmsuserid: "u-platform", tokentype: TokenType.REFRESH });
  return sign({ sub: "u-platform", jti, claims: TokenType.REFRESH, ...claims }, o.key ?? Config.fortyk.api.applicationsecret, { expiresIn: "5m" });
};

const refresh = (token: string, ip = "203.0.113.7") => new AuthBusiness().refreshAuth(token, ip);
const endedLines = () => logInfo.mock.calls.filter((c) => (c[1] as { audit?: string } | undefined)?.audit === "organisation-switch-end");

beforeEach(() => {
  rows = [];
  jest.restoreAllMocks();
  getuserbyid.mockReset().mockResolvedValue(platformUser());
  getactiveorganisation.mockReset().mockResolvedValue({ organisationid: ORG });
  generateAuthToken.mockReset().mockResolvedValue({ accessToken: "new-access", refreshToken: "new-refresh" });
  logInfo = jest.spyOn(Logger, "info").mockImplementation(() => Logger);
  jest.spyOn(tokens, "findOne").mockImplementation((async (o: { where: { token: string; tokentype: string } }) =>
    rows.find((r) => r.token === o.where.token && r.tokentype === o.where.tokentype) ?? null) as never);
});

describe("refreshAuth checks the refresh token itself", () => {
  it("a token whose row is gone is refused (SIGN_IN_REQUIRED): no user is read, nothing is minted", async () => {
    const gone = refreshToken({ actingorganisationid: ORG }, { row: false });
    await expect(refresh(gone)).rejects.toMatchObject({ code: "SIGN_IN_REQUIRED" });
    expect(getuserbyid).not.toHaveBeenCalled();
    expect(generateAuthToken).not.toHaveBeenCalled();
  });

  it("a token signed with the wrong key is refused, even with a live row and an acting claim", async () => {
    const forged = refreshToken({ actingorganisationid: ORG }, { key: "not-the-server-secret" });
    await expect(refresh(forged)).rejects.toMatchObject({ code: "SIGN_IN_REQUIRED" });
    expect(getuserbyid).not.toHaveBeenCalled();
    expect(generateAuthToken).not.toHaveBeenCalled();
  });

  it("a token that is not a token at all is refused", async () => {
    await expect(refresh("not.a.jwt")).rejects.toMatchObject({ code: "SIGN_IN_REQUIRED" });
    expect(generateAuthToken).not.toHaveBeenCalled();
  });

  it("a row of another token type does not make it valid", async () => {
    const jti = "jti-access-row";
    rows.push({ token: jti, lmsuserid: "u-platform", tokentype: TokenType.ACCESS });
    await expect(refresh(refreshToken({}, { row: false, jti }))).rejects.toMatchObject({ code: "SIGN_IN_REQUIRED" });
  });

  it("a correctly signed token with a live row works: the tokens are minted for the user as read now", async () => {
    const out = await refresh(refreshToken());
    expect(out).toEqual({ accessToken: "new-access", refreshToken: "new-refresh" });
    expect(generateAuthToken).toHaveBeenCalledWith(expect.objectContaining({ lmsuserid: "u-platform" }), { actingorganisationid: null });
  });
});

describe("refreshAuth and the acting organisation", () => {
  it("keeps the organisation while it is valid, and writes no audit line", async () => {
    await refresh(refreshToken({ actingorganisationid: ORG }));
    expect(generateAuthToken).toHaveBeenCalledWith(expect.anything(), { actingorganisationid: ORG });
    expect(endedLines()).toEqual([]);
  });

  it("an ordinary refresh (no acting claim) writes no audit line", async () => {
    await refresh(refreshToken());
    expect(endedLines()).toEqual([]);
  });

  it("a claim that is not an organisation id is ignored and is not an acting session: no line", async () => {
    await refresh(refreshToken({ actingorganisationid: "nonsense" }));
    expect(generateAuthToken).toHaveBeenCalledWith(expect.anything(), { actingorganisationid: null });
    expect(endedLines()).toEqual([]);
  });

  it("the organisation is gone, deleted or suspended: back to the platform view, ONE line with the user, the organisation it stopped acting as, the reason and the address", async () => {
    getactiveorganisation.mockResolvedValue(null);
    await refresh(refreshToken({ actingorganisationid: ORG }), "198.51.100.9");
    expect(generateAuthToken).toHaveBeenCalledWith(expect.anything(), { actingorganisationid: null });
    expect(endedLines()).toEqual([
      [
        "Platform user's acting session ended",
        {
          audit: "organisation-switch-end",
          lmsuserid: "u-platform",
          username: "platform@example.com",
          fromorganisationid: ORG,
          toorganisationid: null,
          reason: "organisation-unavailable",
          ip: "198.51.100.9",
        },
      ],
    ]);
  });

  it("the user was given an organisation since (no longer platform): the line says so, and names where the session went", async () => {
    getuserbyid.mockResolvedValue(platformUser({ organisationid: OTHER_ORG, roles: [{ roleid: Role.admin }] }));
    await refresh(refreshToken({ actingorganisationid: ORG }));
    expect(generateAuthToken).toHaveBeenCalledWith(expect.anything(), { actingorganisationid: null });
    expect(endedLines()).toHaveLength(1);
    expect(endedLines()[0][1]).toMatchObject({ reason: "no-longer-platform", fromorganisationid: ORG, toorganisationid: OTHER_ORG });
  });

  it("the line is written once, after the new tokens exist: a refresh that is refused writes none", async () => {
    getactiveorganisation.mockResolvedValue(null);
    generateAuthToken.mockRejectedValue(new Error("no organisation and not platform"));
    await expect(refresh(refreshToken({ actingorganisationid: ORG }))).rejects.toMatchObject({ code: "SIGN_IN_REQUIRED" });
    expect(endedLines()).toEqual([]);
  });

  it("no token is logged", async () => {
    getactiveorganisation.mockResolvedValue(null);
    const token = refreshToken({ actingorganisationid: ORG });
    await refresh(token);
    expect(JSON.stringify(logInfo.mock.calls)).not.toContain(token);
    expect(JSON.stringify(logInfo.mock.calls)).not.toContain("new-access");
  });
});
