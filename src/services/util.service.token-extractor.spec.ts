import { Request } from "express";
import { jwtoptionsbuilder } from "./util.service";
import { TokenType } from "./../models/enums";

/**
 * Guards edtech-lms-api#34: ACCESS and RPIACCESS tokens must not be
 * accepted from the URL query string (they leak into access/proxy logs,
 * browser history and Referer headers). REFRESH keeps its query extractor
 * deliberately, because the Angular UI sends it that way.
 *
 * jwtFromRequest is a pure function of an express Request; no JWT is
 * verified here (no secret involved), only which part of the request the
 * extractor is willing to read the token from.
 */
const fakeRequest = (opts: {
  header?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Request => {
  const search = opts.query
    ? "?" + new URLSearchParams(opts.query).toString()
    : "";
  return {
    headers: opts.header ? { authorization: opts.header } : {},
    body: opts.body ?? {},
    query: opts.query ?? {},
    // ExtractJwt.fromUrlQueryParameter parses this raw url string itself
    // (it does not read req.query), so the query params must be encoded here.
    url: `/some/path${search}`,
  } as unknown as Request;
};

describe("jwtoptionsbuilder token extractors (#34)", () => {
  it.each([TokenType.ACCESS, TokenType.RPIACCESS])(
    "%s: does not extract a token from the query string",
    (tokentype) => {
      const { jwtFromRequest } = jwtoptionsbuilder(tokentype) as any;
      const req = fakeRequest({ query: { accesstoken: "leaked-in-the-url" } });
      expect(jwtFromRequest(req)).toBeNull();
    }
  );

  it.each([TokenType.ACCESS, TokenType.RPIACCESS])(
    "%s: still extracts a token from the Authorization header",
    (tokentype) => {
      const { jwtFromRequest } = jwtoptionsbuilder(tokentype) as any;
      const req = fakeRequest({ header: "Bearer a-real-token" });
      expect(jwtFromRequest(req)).toBe("a-real-token");
    }
  );

  it("REFRESH still reads its token from the query string (unchanged, UI sends it that way)", () => {
    const { jwtFromRequest } = jwtoptionsbuilder(TokenType.REFRESH) as any;
    const req = fakeRequest({ query: { refreshtoken: "a-refresh-token" } });
    expect(jwtFromRequest(req)).toBe("a-refresh-token");
  });
});
