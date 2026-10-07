import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { refuseRetiredFormat } from "./sync-target";

/**
 * `refuseRetiredFormat` reads the caller's scope first, so a caller with no scope gets the scope refusal (403) whether or
 * not it named a format, and never learns from the format message that the request got as far as the handler. (Over HTTP
 * the guards and `@Org()` answer first, so this is pinned on the function itself.)
 */
describe("refuseRetiredFormat", () => {
  const RETIRED = "Format 2 has been retired; content is one organisation's (format 3).";
  const NO_SCOPE = [
    ["no context", undefined],
    ["a user with no organisation who is not a platform user", { organisationid: null, isplatform: false }],
    ["an empty organisation id", { organisationid: "", isplatform: false }],
  ] as const;

  it.each(NO_SCOPE)("%s: the scope refusal, with or without a format", (_name, org) => {
    for (const format of [undefined, 2, "3", null]) {
      let thrown: unknown;
      try {
        refuseRetiredFormat(org as never, format);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(ApiError);
      expect((thrown as ApiError).code).toBe(ErrorCode.NOT_ALLOWED);
      expect((thrown as ApiError).message).not.toBe(RETIRED);
    }
  });

  it.each([
    ["the platform, not acting", { organisationid: null, isplatform: true }],
    ["a user of an organisation", { organisationid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", isplatform: false }],
  ])("%s: nothing refused without a format; any format is the retirement 400", (_name, org) => {
    expect(() => refuseRetiredFormat(org as never, undefined)).not.toThrow();
    for (const format of [2, 3, "2", "", null, [2]]) {
      expect(() => refuseRetiredFormat(org as never, format)).toThrow(RETIRED);
    }
  });
});
