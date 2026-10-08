/**
 * What this API sends to the student API (cloud push of learners and teachers,
 * the content sync, the exports a classroom Pi imports) is a
 * contract with another service. `students` and `schoolusers` here carry a
 * `schoolid` column (C4), and the content tables an `organisationid` column
 * (C7), that the student API does not have yet, so a payload that carried
 * either would not be what that service was written against.
 *
 * Every function that builds such a payload keeps the column out EXPLICITLY, at
 * the point it selects the rows, through `studentApiAttributes`:
 *
 *  - SchoolUserBusiness.getschooluserbyschoolid   (export of a school's learners; cloud sync of a school)
 *  - SchoolUserBusiness.getschooluserbyid         (cloud push of learners just created)
 *  - SchoolUserBusiness.getschoolteachersbyid     (cloud push of teachers just created)
 *    (these three keep it out unless asked for `{ withSchoolId: true }`: see `studentApiRosterAttributes`)
 *  - SchoolUserBusiness.getschoolusers            (no caller since sync/report-data was retired; kept with its pins)
 *  - TeacherBusiness.getteacheruserbyschoolid     (export of a school's teachers)
 *
 * and, for the content (`organisationid`), these getters (the format 3 content export reads its tables through
 * the `*WithOwner` readers and the scoped business classes instead, so the three below have no caller either):
 *
 *  - CurriculumBusiness.getCurriculumsForStudentApi (the admin API's getCurriculums is separate and keeps the column)
 *  - QuestionBusiness.getquestions
 *  - DocumentBusiness.getdocuments
 *
 * (and the learner rows they include). `school-id-payloads.spec.ts` and
 * `content-api-payloads.spec.ts` pin each of them to the generated SQL. The
 * admin API's own reads are NOT in this list and do carry both columns. A
 * column is only ever listed here once, and only for a table that has it: the
 * exclusion of a column a table does not have changes nothing.
 */
export const NOT_IN_STUDENT_API = ["schoolid", "organisationid"] as const;

/** `attributes` for a query whose rows go to the student API. */
export const studentApiAttributes = { exclude: [...NOT_IN_STUDENT_API] };

/**
 * `attributes` for the one kind of push that names its school: a roster of one
 * school's learners or teachers, sent as `{ schoolid, studentusers }` or
 * `{ schoolid, teachers }`. Each row carries its `schoolid`, which the student
 * API checks against the school the file names. Only `organisationid` stays out.
 * Every cloud push of a roster goes in that shape (the older `{ studentusers }` and bare list of
 * teachers are retired with content format 2), asked for by the three getters that take `{ withSchoolId: true }`:
 *
 *  - SchoolUserBusiness.getschooluserbyschoolid   (cloud sync of a school's learners)
 *  - SchoolUserBusiness.getschooluserbyid         (cloud push of learners just created)
 *  - SchoolUserBusiness.getschoolteachersbyid     (cloud push of teachers just created)
 *
 * `school-id-payloads.spec.ts` pins the SQL of each, with and without it.
 */
export const studentApiRosterAttributes = { exclude: ["organisationid"] };
