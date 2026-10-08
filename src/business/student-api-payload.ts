/**
 * The column lists for the rows of a roster (learners and their logins, teachers' logins) that leave this API
 * as a payload: the exports a classroom Pi imports, and the cloud pushes of a school's learners and teachers.
 * The rows are selected through one of two lists, at the point each getter reads them, so that what leaves is
 * named and does not follow whatever columns the tables gain:
 *
 *  - `studentApiAttributes` omits `schoolid` and `organisationid`. It is the default of the roster getters and the
 *    only list of the teachers' export, so a roster that does not name its school carries neither column:
 *      - SchoolUserBusiness.getschooluserbyschoolid   (export of a school's learners)
 *      - SchoolUserBusiness.getschooluserbyid         (learners just created, when not asked for `withSchoolId`)
 *      - SchoolUserBusiness.getschoolteachersbyid     (teachers just created, when not asked for `withSchoolId`)
 *      - TeacherBusiness.getteacheruserbyschoolid     (export of a school's teachers)
 *  - `studentApiRosterAttributes` omits `organisationid` only. A cloud push of a roster names its school once, at the
 *    top level of the file (`{ schoolid, studentusers }` or `{ schoolid, teachers }`: see `studentsFile` and
 *    `teachersFile` in cloud-push.ts), and each row keeps its own `schoolid`. The first three getters above use it when called
 *    with `{ withSchoolId: true }`, which the cloud pushes do.
 *
 * `school-id-payloads.spec.ts` pins the generated SQL of each getter, with and without `withSchoolId`. The content
 * payload (format 3) is built elsewhere (organisation-content-export.ts) and is not described here. The admin API's own
 * reads are not in this list and carry both columns.
 */
export const NOT_IN_STUDENT_API = ["schoolid", "organisationid"] as const;

/** `attributes` for a roster that does not name its school: neither `schoolid` nor `organisationid`. */
export const studentApiAttributes = { exclude: [...NOT_IN_STUDENT_API] };

/**
 * `attributes` for a roster that names its school: every row keeps its `schoolid`, and only `organisationid` stays
 * out. Asked for with `{ withSchoolId: true }` (see the list at the top of this file).
 */
export const studentApiRosterAttributes = { exclude: ["organisationid"] };
