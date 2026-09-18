import bcryptjs from "bcryptjs";
import md5 from "crypto-js/md5";

/**
 * Password hashing. Migrated from unsalted MD5 to bcrypt.
 *
 * ⚠️ Was a byte-identical copy of `edtech-lms-rpi-api/src/services/password.service.ts`;
 * this file just dropped the legacy MD5 fallback there and the rpi copy has
 * NOT been updated yet — that is a separate PR against edtech-lms-rpi-api.
 * Until that PR lands, the two are deliberately out of step: rpi's `verify`
 * still accepts a bare md5 match (`return stored === md5hex(plain);`), central's
 * does not. This is safe in the meantime — central always mints bcrypt, rpi
 * accepting more than central produces is not a hole — but `hashPassword` and
 * `BCRYPT_ROUNDS` must still match exactly, since central mints a hash and the
 * student API verifies it across the import/sync bridge. Once the rpi PR lands,
 * restore byte-identity and change both files together from then on. (No
 * shared package exists between the two repos yet.)
 *
 * Stored form is `bcrypt(md5(password))` — wrapping the *existing* md5 hash is
 * what let the rewrap migration
 * (`src/db/migrations/20260719160000-rewrap-md5-passwords-bcrypt.ts`) run with
 * no user's password (we already held md5(password): it was the stored
 * value). `bcryptjs` (pure JS) rather than native `bcrypt` so the student API
 * stays buildable on a Raspberry Pi.
 *
 * `verify` no longer accepts a bare 32-char MD5 hex hash as a match: the
 * rewrap migration already converted every such row in `lmsusers` and
 * `schoolusers` to `bcrypt(md5(password))`, so any row that still isn't a
 * bcrypt hash (doesn't start with `$2`) is stale data, not a legitimate
 * unmigrated account, and is rejected. See
 * docs/password-hashing-bcrypt-plan.md.
 */

const BCRYPT_ROUNDS = 10;

/** Canonical unsalted-MD5 hex — identical across the crypto-js and md5 packages
 * this codebase mixed, so every existing stored hash matches. */
const md5hex = (plain: string): string => md5(plain).toString();

/** Hash a plaintext password for storage: bcrypt(md5(password)). */
export const hashPassword = (plain: string): string =>
  bcryptjs.hashSync(md5hex(plain), BCRYPT_ROUNDS);

/** Verify a plaintext against a stored hash. Only bcrypt hashes are accepted. */
export const verifyPassword = (plain: string, stored: string): boolean => {
  if (!stored) {
    return false;
  }
  // bcrypt hashes start with $2a/$2b/$2y. Anything else is a legacy unsalted
  // md5 hex hash the rewrap migration should already have converted — reject
  // it rather than accept a bare md5 match.
  if (!stored.startsWith("$2")) {
    return false;
  }
  return bcryptjs.compareSync(md5hex(plain), stored);
};
