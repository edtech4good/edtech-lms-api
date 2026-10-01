import type { FindOptions } from "sequelize";

/**
 * `students.schoolid` and `schoolusers.schoolid` (C4) are written next to
 * `schoolname`, but nothing reads them yet, and no response may change shape in
 * the step that adds them. A plain `findAll` selects every attribute of the
 * model, so the new column would appear in every learner and school-user
 * payload (including the rosters pushed to the student API) the moment it is
 * declared. This default scope keeps it out of reads; writes are unaffected.
 *
 * The step that moves readers to the id removes this scope from both models
 * (and the `getstudentstats` strip in student.business.ts).
 */
export const SCHOOL_ID_DEFAULT_SCOPE: FindOptions = {
  attributes: { exclude: ["schoolid"] },
};
