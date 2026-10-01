/**
 * When is the address a person typed the address stored on an account?
 *
 * Two addresses are the same when they are the same text after trimming,
 * Unicode NFC normalisation and lower-casing. The database's own comparison of
 * addresses is looser than that and is not relied on: a request names an
 * account only when this comparison says so. A person who types their own
 * address in different capitals, or with stray spaces around it, still matches.
 *
 * It is the only comparison the password-reset and verification-email requests
 * use. It does not decide who may sign in.
 */
export const normaliseEmailAddress = (address: string): string =>
  address.trim().normalize("NFC").toLowerCase();

export const isSameEmailAddress = (stored: unknown, given: unknown): boolean => {
  if (typeof stored !== "string" || typeof given !== "string") {
    return false;
  }
  const a = normaliseEmailAddress(stored);
  return a.length > 0 && a === normaliseEmailAddress(given);
};
