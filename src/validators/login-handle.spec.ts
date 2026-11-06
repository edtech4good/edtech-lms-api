import { isLoginHandle, LOGIN_HANDLE_MESSAGE, loginHandleFieldErrors } from "./login-handle";

describe("login handle (a username is 2 to 16 English letters or digits)", () => {
  it.each(["sokha", "Dara01", "ab", "a234567890123456"])("accepts %p", (v) => {
    expect(isLoginHandle(v)).toBe(true);
  });

  it.each([
    ["Khmer letters", "សុខា"],
    ["Khmer digits", "ស១២"],
    ["Khmer and Latin mixed", "sokhaសុខា"],
    ["a dot", "so.kha"],
    ["a space", "so kha"],
    ["one character", "a"],
    ["seventeen characters", "a2345678901234567"],
    ["blank", ""],
    ["not text", 12345],
    ["missing", undefined],
  ])("refuses %s", (_label, v) => {
    expect(isLoginHandle(v)).toBe(false);
  });

  it("names exactly the rows that fail", () => {
    const rows = [{ teacherusername: "dara" }, { teacherusername: "ដារ៉ា" }, { teacherusername: "vanna" }, {}];
    expect(loginHandleFieldErrors(rows, "teacherusername")).toEqual([
      { field: "rows[1].teacherusername", message: LOGIN_HANDLE_MESSAGE },
      { field: "rows[3].teacherusername", message: LOGIN_HANDLE_MESSAGE },
    ]);
  });
});
