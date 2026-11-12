import { generateShortcode, normaliseShortcode, SHORTCODE_ALPHABET, SHORTCODE_PATTERN } from "./certificate-shortcode";

describe("certificate shortcodes", () => {
  it("the alphabet is 0-9 and A-Z without I, L, O and U", () => {
    expect(SHORTCODE_ALPHABET).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
    expect(SHORTCODE_ALPHABET).toHaveLength(32);
    for (const c of "ILOU") expect(SHORTCODE_ALPHABET).not.toContain(c);
  });
  it("a generated code is XXXX-XXXX from the alphabet, every one of 500", () => {
    for (let i = 0; i < 500; i += 1) expect(generateShortcode()).toMatch(SHORTCODE_PATTERN);
  });
  it("takes five bits of each random byte", () => {
    expect(generateShortcode(() => Buffer.from([0, 1, 31, 32, 255, 10, 11, 12]))).toBe("01Z0-ZABC");
  });
  it("reads a typed code in either case, with or without the dash, and nothing else", () => {
    expect(normaliseShortcode("7q2m-9kxa")).toBe("7Q2M-9KXA");
    expect(normaliseShortcode(" 7Q2M9KXA ")).toBe("7Q2M-9KXA");
    for (const bad of ["", "7Q2M-9KX", "7Q2M-9KXAA", "7Q2M-9KXU", "7Q2M--9KXA", "7Q2M 9KXA", 12345, null, undefined, "7".repeat(40)]) {
      expect(normaliseShortcode(bad)).toBeNull();
    }
  });
});
