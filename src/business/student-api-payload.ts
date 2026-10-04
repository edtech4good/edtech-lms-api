/**
 * What this API sends to the student API (cloud push of learners and teachers,
 * the content and report-data sync, the exports a classroom Pi imports) is a
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
 *  - SchoolUserBusiness.getschoolusers            (content export and sync/report-data)
 *  - TeacherBusiness.getteacheruserbyschoolid     (export of a school's teachers)
 *
 * and, for the content (`organisationid`), the getters the sync reads:
 *
 *  - CurriculumBusiness.getCurriculumsForStudentApi (the admin API's getCurriculums is separate and keeps the column)
 *  - QuestionBusiness.getquestions
 *  - DocumentBusiness.getdocuments
 *  - SubjectBusiness.getSubjects
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
