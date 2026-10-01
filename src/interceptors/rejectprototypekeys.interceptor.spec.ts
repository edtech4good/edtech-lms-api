import { ExecutionContext } from "@nestjs/common";
import { ValidationException } from "../models/ValidationException";
import { hasForbiddenKey, RejectPrototypeKeysInterceptor } from "./rejectprototypekeys.interceptor";

const ctx = (body: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ body }) }) }) as unknown as ExecutionContext;

describe("hasForbiddenKey", () => {
  it("finds an OWN __proto__ key made by JSON.parse, at any depth", () => {
    expect(hasForbiddenKey(JSON.parse('{"__proto__":{"a":1}}'))).toBe(true);
    expect(hasForbiddenKey(JSON.parse('{"a":{"b":[{"c":{"__proto__":1}}]}}'))).toBe(true);
  });

  it("finds constructor and prototype keys", () => {
    expect(hasForbiddenKey({ constructor: { prototype: {} } })).toBe(true);
    expect(hasForbiddenKey({ a: { prototype: 1 } })).toBe(true);
  });

  it("does not trip on ordinary bodies, on inherited members, or on non-objects", () => {
    expect(hasForbiddenKey({ a: 1, b: { c: [1, 2, { d: "constructor" }] } })).toBe(false);
    expect(hasForbiddenKey({ note: "__proto__" })).toBe(false); // a VALUE is fine
    expect(hasForbiddenKey("x")).toBe(false);
    expect(hasForbiddenKey(undefined)).toBe(false);
    expect(hasForbiddenKey(null)).toBe(false);
    expect(hasForbiddenKey([])).toBe(false);
  });

  it("refuses an absurdly deep body instead of recursing into it, without overflowing the stack", () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 100000; i++) {
      const next: Record<string, unknown> = {};
      deep.k = next;
      deep = next;
    }
    expect(hasForbiddenKey(root)).toBe(true);
  });
});

describe("RejectPrototypeKeysInterceptor", () => {
  const next = { handle: jest.fn(() => "handled" as never) };

  it("throws a generic ValidationException on field 'body', never naming the key", () => {
    let caught: ValidationException | undefined;
    try {
      new RejectPrototypeKeysInterceptor().intercept(ctx(JSON.parse('{"__proto__":{}}')), next);
    } catch (e) {
      caught = e as ValidationException;
    }
    expect(caught).toBeInstanceOf(ValidationException);
    expect(caught!.fields).toEqual([{ field: "body", message: "This request contains a field that isn't allowed." }]);
    expect(JSON.stringify(caught!.fields)).not.toContain("__proto__");
    expect(next.handle).not.toHaveBeenCalled();
  });

  it("passes a clean body (and a request with no body) through to the handler", () => {
    expect(new RejectPrototypeKeysInterceptor().intercept(ctx({ a: 1 }), next)).toBe("handled");
    expect(new RejectPrototypeKeysInterceptor().intercept(ctx(undefined), next)).toBe("handled");
  });
});
