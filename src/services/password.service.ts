import bcryptjs from "bcryptjs";
import md5 from "crypto-js/md5";

/**
 * Password hashing, mid-migration from unsalted MD5 to bcrypt.
 *
 * Stored form is `bcrypt(md5(password))` — wrapping the *existing* md5 hash is
 * what lets the rewrap migration run with no user's password (we already hold
 * md5(password): it is the stored value). `bcryptjs` (pure JS) rather than
 * native `bcrypt` so the student API stays buildable on a Raspberry Pi.
 *
 * `verify` is dual-mode, keyed on the stored hash's shape, so bcrypt-aware code
 * is safe to deploy BEFORE the rewrap migration runs (legacy md5 rows still log
 * in) and after (rewrapped rows log in). See docs/password-hashing-bcrypt-plan.md.
 */

const BCRYPT_ROUNDS = 10;

/** Canonical unsalted-MD5 hex — identical across the crypto-js and md5 packages
 * this codebase mixed, so every existing stored hash matches. */
const md5hex = (plain: string): string => md5(plain).toString();

/** Hash a plaintext password for storage: bcrypt(md5(password)). */
export const hashPassword = (plain: string): string =>
  bcryptjs.hashSync(md5hex(plain), BCRYPT_ROUNDS);

/** Verify a plaintext against a stored hash, accepting either format. */
export const verifyPassword = (plain: string, stored: string): boolean => {
  if (!stored) {
    return false;
  }
  // bcrypt hashes start with $2a/$2b/$2y; anything else is a legacy md5 hex.
  if (stored.startsWith("$2")) {
    return bcryptjs.compareSync(md5hex(plain), stored);
  }
  return stored === md5hex(plain);
};
