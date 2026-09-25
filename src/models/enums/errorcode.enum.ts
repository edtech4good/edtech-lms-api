/**
 * The cross-repo API error contract's error codes. Identical in
 * edtech-lms-rpi-api and documented in docs/api-errors.md (workspace repo,
 * private) — both APIs must agree on these values because edtech-expo and
 * edtech-lms-ui translate by `code`, not by message text.
 *
 * Do not rename or remove a value here without checking the sibling repo and
 * both clients.
 */
export enum ErrorCode {
  LOGIN_FAILED = 'LOGIN_FAILED',
  SIGN_IN_REQUIRED = 'SIGN_IN_REQUIRED',
  NOT_ALLOWED = 'NOT_ALLOWED',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  FILE_REJECTED = 'FILE_REJECTED',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL = 'INTERNAL',
}
