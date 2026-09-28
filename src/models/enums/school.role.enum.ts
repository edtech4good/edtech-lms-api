export enum SchoolRole {
  SUPERADMIN = 1,
  ADMIN = 2,
  TEACHER = 3,
  STUDENT = 4,
}

/**
 * Every school-user role a school-token route (auth/school/login,
 * PUT log/import, the JWT strategy itself) is allowed to act as - an
 * allow-list, not a `!== SchoolRole.STUDENT` deny-list. A deny-list passes
 * anything that isn't literally 4: an unmapped/future role value, `0`, or
 * corrupt data would all get through. Matches edtech-lms-rpi-api's
 * AccessGuard/ClaimGuard pattern (workspace#78/#80, private).
 */
export const STAFF_SCHOOL_ROLES: ReadonlyArray<number> = [
  SchoolRole.SUPERADMIN,
  SchoolRole.ADMIN,
  SchoolRole.TEACHER,
];
