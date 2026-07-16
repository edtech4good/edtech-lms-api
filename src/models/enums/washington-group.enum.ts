/**
 * Washington Group Short Set (WG-SS) on Functioning.
 *
 * Six domains, each answered on the same four-point scale, collected at
 * enrolment. Every field is optional: a NULL column means "not collected" and
 * is deliberately distinct from NoDifficulty — a learner nobody asked is not a
 * learner without difficulty, and conflating the two overstates the denominator
 * in any disaggregated report.
 */
export enum WGResponse {
  NoDifficulty = 1,
  SomeDifficulty = 2,
  ALotOfDifficulty = 3,
  CannotDoAtAll = 4,
}

/** One column on `students` per WG-SS domain, in the order the set is asked. */
export const WG_DOMAIN_COLUMNS = [
  "wg_seeing",
  "wg_hearing",
  "wg_walking",
  "wg_remembering",
  "wg_selfcare",
  "wg_communicating",
] as const;

export type WGDomainColumn = (typeof WG_DOMAIN_COLUMNS)[number];

/**
 * The Washington Group's own cutoff for disaggregation: a learner is counted as
 * having a disability when at least one domain is coded ALotOfDifficulty or
 * CannotDoAtAll. Reporting a different threshold off these fields would still
 * produce a number, but not one comparable to anybody else's.
 */
export const WG_DISABILITY_CUTOFF = WGResponse.ALotOfDifficulty;

/**
 * Who supplied the answers. Staff-entered today; self-reported once learners can
 * sign up and fill these in on their own profile, at which point a self-report
 * supersedes rather than silently overwrites a staff estimate.
 */
export enum WGSource {
  StaffReported = 1,
  SelfReported = 2,
}
