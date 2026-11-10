/**
 * The single `curriculumid` stays one of the learner's `curriculumids`: the learners list and the reports join on it. Keep the
 * current one while it is still listed, else take the first of the new list.
 */
export const nextCurriculumId = (current: string | null | undefined, curriculumids: readonly string[]): string =>
  current && curriculumids.includes(current) ? current : curriculumids[0];

