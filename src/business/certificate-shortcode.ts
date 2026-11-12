import { randomBytes } from "crypto";

/**
 * The code on a certificate ("XXXX-XXXX"): eight characters from 0-9 and A-Z without I, L, O and U (32 characters, so
 * five random bits make one character with no bias), shown as two groups of four. It is read back on the public check
 * page, in either case, with or without the dash.
 */
export const SHORTCODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SHORTCODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const TYPED = /^([0-9A-HJKMNP-TV-Z]{4})-?([0-9A-HJKMNP-TV-Z]{4})$/;

/** A new code from the operating system's random source. */
export const generateShortcode = (random: (size: number) => Buffer = randomBytes): string => {
  const bytes = random(8);
  const chars = Array.from(bytes.subarray(0, 8), (b) => SHORTCODE_ALPHABET[b & 31]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
};

/** What a spec (and nothing else) replaces to choose the codes issued. */
export const shortcodes = { next: (): string => generateShortcode() };

/** A typed code as stored ("XXXX-XXXX", upper case), or null when it is not shaped like a code. */
export const normaliseShortcode = (raw: unknown): string | null => {
  if (typeof raw !== "string" || raw.length > 32) return null;
  const match = TYPED.exec(raw.trim().toUpperCase());
  return match ? `${match[1]}-${match[2]}` : null;
};
