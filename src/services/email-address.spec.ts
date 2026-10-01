import { isSameEmailAddress, normaliseEmailAddress } from "./email-address";

/**
 * A request names an account's address only when it is the same text: trimmed,
 * Unicode NFC normalised and lower-cased on both sides. Anything the database
 * would merely compare as equal is a different address.
 */
describe("isSameEmailAddress", () => {
  it("matches the same address", () => {
    expect(isSameEmailAddress("person@example.com", "person@example.com")).toBe(true);
  });

  it("matches when the capitals differ, in either direction", () => {
    expect(isSameEmailAddress("person@example.com", "Person@Example.COM")).toBe(true);
    expect(isSameEmailAddress("Person@Example.com", "person@example.com")).toBe(true);
  });

  it("matches when spaces surround either address", () => {
    expect(isSameEmailAddress("person@example.com", "  person@example.com\t")).toBe(true);
    expect(isSameEmailAddress(" person@example.com ", "person@example.com")).toBe(true);
  });

  it("matches the same text in two Unicode forms (NFC)", () => {
    const composed = "pers\u00f6n@example.com";
    const decomposed = "pers\u006f\u0308n@example.com";
    expect(composed).not.toBe(decomposed);
    expect(isSameEmailAddress(composed, decomposed)).toBe(true);
    expect(isSameEmailAddress(decomposed, composed.toUpperCase())).toBe(true);
  });

  it("does not match an address that is not the same text", () => {
    expect(isSameEmailAddress("person@example.com", "person@ex\u00e4mple.com")).toBe(false);
  });

  it("does not match different addresses, or ones that differ inside the text", () => {
    expect(isSameEmailAddress("person@example.com", "other@example.com")).toBe(false);
    expect(isSameEmailAddress("person@example.com", "per son@example.com")).toBe(false);
    expect(isSameEmailAddress("person@example.com", "person@example.com.au")).toBe(false);
  });

  it("matches nothing when either side is empty, blank or not a string", () => {
    expect(isSameEmailAddress("", "")).toBe(false);
    expect(isSameEmailAddress("   ", " ")).toBe(false);
    expect(isSameEmailAddress("person@example.com", "")).toBe(false);
    for (const bad of [undefined, null, 7, {}, ["person@example.com"]]) {
      expect(isSameEmailAddress("person@example.com", bad)).toBe(false);
      expect(isSameEmailAddress(bad, "person@example.com")).toBe(false);
    }
  });

  it("normaliseEmailAddress trims and lower-cases", () => {
    expect(normaliseEmailAddress("  Person@Example.COM ")).toBe("person@example.com");
  });
});

export {};
