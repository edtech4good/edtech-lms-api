import { WGSource } from "src/models/enums";

/** WG-SS answers as they arrive on the import and edit payloads. */
export interface WashingtonGroupAnswers {
  wg_seeing?: string;
  wg_hearing?: string;
  wg_walking?: string;
  wg_remembering?: string;
  wg_selfcare?: string;
  wg_communicating?: string;
}

/** The matching `students` columns. Undefined means "leave alone". */
export interface WashingtonGroupColumns {
  wg_seeing?: number;
  wg_hearing?: number;
  wg_walking?: number;
  wg_remembering?: number;
  wg_selfcare?: number;
  wg_communicating?: number;
  wg_source?: number;
  wg_collected_at?: Date;
}

const answer = (value?: string): number | undefined => {
  const parsed = parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const domainsOf = (x: WashingtonGroupAnswers): WashingtonGroupColumns => ({
  wg_seeing: answer(x.wg_seeing),
  wg_hearing: answer(x.wg_hearing),
  wg_walking: answer(x.wg_walking),
  wg_remembering: answer(x.wg_remembering),
  wg_selfcare: answer(x.wg_selfcare),
  wg_communicating: answer(x.wg_communicating),
});

/**
 * Columns for a newly enrolled student. Provenance is stamped only when at
 * least one domain was answered, so a learner nobody asked keeps a NULL
 * wg_collected_at rather than looking like a completed interview that happened
 * to miss all six questions.
 */
export const washingtonGroupColumnsForCreate = (
  x: WashingtonGroupAnswers,
  source: WGSource = WGSource.StaffReported,
): WashingtonGroupColumns => {
  const domains = domainsOf(x);
  const answered = Object.values(domains).some((v) => v !== undefined);
  return {
    ...domains,
    wg_source: answered ? source : undefined,
    wg_collected_at: answered ? new Date() : undefined,
  };
};

/**
 * Columns for an edit. Provenance is re-stamped only when an answer actually
 * changed — correcting a learner's city must not make it look like the
 * enrolment interview was repeated today. A blank answer leaves the stored one
 * alone rather than erasing it, so a CSV round-trip that drops the columns
 * cannot silently wipe collected data.
 */
export const washingtonGroupColumnsForUpdate = (
  x: WashingtonGroupAnswers,
  existing: WashingtonGroupColumns,
  source: WGSource = WGSource.StaffReported,
): WashingtonGroupColumns => {
  const domains = domainsOf(x);
  const changed = Object.entries(domains).some(
    ([column, value]) =>
      value !== undefined &&
      value !== existing[column as keyof WashingtonGroupColumns],
  );
  return {
    ...domains,
    wg_source: changed ? source : undefined,
    wg_collected_at: changed ? new Date() : undefined,
  };
};
