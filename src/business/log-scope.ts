import { Op } from "sequelize";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { STAFF_SCHOOL_ROLES } from "src/models/enums/school.role.enum";
import { schoolusers } from "src/models/data-models/schoolusers";
import { studentprogress } from "src/models/data-models/studentprogress";
import { students } from "src/models/data-models/students";
import { LmsUserToken } from "src/models/token.model";

/**
 * Confining a teacher's log upload (`PUT /log/import`) to the teacher's own school.
 *
 * The upload carries rows about learners: sign-ins (`access`, keyed by a login id), results with their
 * answers (`result`, keyed by `studentid`) and progress (`progress`, keyed by `studentid`, or by a login id
 * for app usage). Every learner a row names must be a live learner of the school the uploading teacher
 * belongs to; one that is unknown, deleted, or another school's refuses the whole upload (400), and the
 * message names nothing. The check runs before any row is written.
 */

/** The uploading teacher: a live staff-role login. Not found, disabled, deleted or not staff: refused. */
export const uploadingTeacher = async (user: LmsUserToken): Promise<schoolusers> => {
  if (!user.schooluserid) throw new ApiError(ErrorCode.NOT_ALLOWED, "Only a teacher account can upload logs.");
  const teacher = await schoolusers.findOne({
    where: { schooluserid: user.schooluserid },
  });
  if (!teacher) throw new ApiError(ErrorCode.NOT_FOUND, "That teacher doesn't exist.");
  // Defence in depth alongside the role check at auth/school/login
  // (#90): a school-user token predating that fix, or
  // any other future school-token route, must not let a student token
  // write into central's log tables. Allow-list (not `!== STUDENT`): an
  // unmapped role value must also be refused. Also refuses a disabled or
  // deleted teacher account, whose already-issued token otherwise stays
  // live for its full lifetime.
  if (!STAFF_SCHOOL_ROLES.includes(teacher.schooluserrole) || teacher.isdisabled || teacher.isdeleted) {
    throw new ApiError(ErrorCode.NOT_ALLOWED, "Only a teacher account can upload logs.");
  }
  return teacher;
};

const outsideSchool = () =>
  new ApiError(ErrorCode.FILE_REJECTED, "That file holds logs of learners who are not in your school.");

type Row = Record<string, unknown>;

/** The array under `holder[key]`: absent is empty; present but not an array, or holding a non-object, is refused. */
const rowsOf = (holder: unknown, key: string): Row[] => {
  const value = holder === undefined || holder === null ? undefined : (holder as Row)[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((r) => typeof r !== "object" || r === null || Array.isArray(r))) throw outsideSchool();
  return value as Row[];
};

/** A referenced id: a non-empty string (compared without regard to case, as the database does), else refused. */
const idOf = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) throw outsideSchool();
  return value.toLowerCase();
};

const sameCase = (rows: object[], column: string) => new Set(rows.map((r) => String((r as Row)[column]).toLowerCase()));

/**
 * Refuses the upload unless every learner it names is a live learner of `teacher`'s school. The school is the one on
 * the teacher's `schoolusers` row. `logdata` is the parsed `log.ini` (`{ log: { access, result, progress } }`).
 *
 * Which column names the learner, by row type:
 *  - `access` (rpiuseraccess): `userid`, a login id (a learner's, or a login of the school such as the teacher's).
 *  - `result` (studentprogress): `studentid`. Each of its `studentprogressquestions` belongs to a result row of the
 *    upload (checked through that row) or to a stored result whose learner is in the school.
 *  - `progress.studentactives`, `studentlearningprogress`, `studentgradesprogress`, `studentlevelsprogress`,
 *    `studentlessonsprogress`, `studentpoints`: `studentid` (and `userid` on a learning-progress row when it has one).
 *  - `progress.studentappusages`: `schooluserid`, a login id.
 */
export const assertLogRowsInSchool = async (teacher: schoolusers, logdata: unknown): Promise<void> => {
  const log = (logdata as { log?: unknown } | null | undefined)?.log;
  if (log === undefined || log === null) return;
  const progress = (log as Row).progress;

  const studentIds = new Set<string>(); // named by `studentid`
  const loginIds = new Set<string>(); // named by a login id column
  const either = new Set<string>(); // a column that holds one or the other

  for (const r of rowsOf(log, "access")) loginIds.add(idOf(r.userid));
  const results = rowsOf(log, "result");
  const resultIds = new Set<string>();
  for (const r of results) {
    studentIds.add(idOf(r.studentid));
    resultIds.add(idOf(r.studentprogressid));
  }
  for (const key of ["studentactives", "studentlearningprogress", "studentgradesprogress", "studentlevelsprogress", "studentlessonsprogress", "studentpoints"]) {
    for (const r of rowsOf(progress, key)) {
      studentIds.add(idOf(r.studentid));
      if (key === "studentlearningprogress" && r.userid !== undefined && r.userid !== null) either.add(idOf(r.userid));
    }
  }
  for (const r of rowsOf(progress, "studentappusages")) loginIds.add(idOf(r.schooluserid));
  // a question names the result it belongs to
  const storedResultIds = new Set<string>();
  for (const r of results) {
    for (const q of rowsOf(r, "studentprogressquestions")) {
      const id = idOf(q.studentprogressid);
      if (!resultIds.has(id)) storedResultIds.add(id);
    }
  }

  if (studentIds.size + loginIds.size + either.size + storedResultIds.size === 0) return;
  const schoolid = teacher.schoolid;
  if (!schoolid) throw outsideSchool(); // a teacher with no school has no learners

  const inSchool = { schoolid, isdeleted: false };
  const list = (ids: Set<string>) => ({ [Op.in]: [...ids] });
  const learnersById = studentIds.size + either.size === 0 ? [] : await students.findAll({
    attributes: ["studentid", "schooluserid"],
    where: { ...inSchool, studentid: list(new Set([...studentIds, ...either])) },
  });
  // the learners that own a login id, wherever they are and whether or not they are deleted: a login that belongs to
  // a learner is that learner's, and is judged as the learner is
  const learnersByLogin = loginIds.size + either.size === 0 ? [] : await students.findAll({
    attributes: ["studentid", "schooluserid", "schoolid", "isdeleted"],
    where: { schooluserid: list(new Set([...loginIds, ...either])) },
  });
  const logins = loginIds.size + either.size === 0 ? [] : await schoolusers.findAll({
    attributes: ["schooluserid"],
    where: { ...inSchool, schooluserid: list(new Set([...loginIds, ...either])) },
  });
  const stored = storedResultIds.size === 0 ? [] : await studentprogress.findAll({
    attributes: ["studentprogressid", "studentid"],
    where: { studentprogressid: list(storedResultIds) },
  });
  const storedLearners = stored.length === 0 ? [] : await students.findAll({
    attributes: ["studentid"],
    where: { ...inSchool, studentid: list(new Set(stored.map((s) => String(s.studentid).toLowerCase()))) },
  });

  const learnerIds = sameCase(learnersById, "studentid");
  const ownedLogins = sameCase(learnersByLogin, "schooluserid");
  const liveLearnerLogins = sameCase(
    learnersByLogin.filter((l) => !l.isdeleted && String(l.schoolid).toLowerCase() === schoolid.toLowerCase()),
    "schooluserid",
  );
  // a login of a learner of the school, or (no learner owns it) a live login of the school, such as the teacher's own
  const loginOk = (id: string) => (ownedLogins.has(id) ? liveLearnerLogins.has(id) : schoolLogins.has(id));
  const schoolLogins = sameCase(logins, "schooluserid");
  const storedLearnerIds = sameCase(storedLearners, "studentid");
  const storedOk = new Set(stored.filter((s) => storedLearnerIds.has(String(s.studentid).toLowerCase())).map((s) => String(s.studentprogressid).toLowerCase()));

  for (const id of studentIds) if (!learnerIds.has(id)) throw outsideSchool();
  for (const id of loginIds) if (!loginOk(id)) throw outsideSchool();
  for (const id of either) if (!learnerIds.has(id) && !loginOk(id)) throw outsideSchool();
  for (const id of storedResultIds) if (!storedOk.has(id)) throw outsideSchool();
};
