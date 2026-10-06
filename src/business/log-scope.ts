import { Op } from "sequelize";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { STAFF_SCHOOL_ROLES } from "src/models/enums/school.role.enum";
import { rpiuseraccess } from "src/models/data-models/rpiuseraccess";
import { schoolusers } from "src/models/data-models/schoolusers";
import { studentactives } from "src/models/data-models/studentactives";
import { studentappusages } from "src/models/data-models/studentappusage";
import { studentgradesprogress } from "src/models/data-models/studentgradesprogress";
import { studentlearningprogress } from "src/models/data-models/studentlearningprogress";
import { studentlessonsprogress } from "src/models/data-models/studentlessonprogress";
import { studentlevelsprogress } from "src/models/data-models/studentlevelsprogress";
import { studentpoints } from "src/models/data-models/studentpoints";
import { studentprogress } from "src/models/data-models/studentprogress";
import { studentprogressquestions } from "src/models/data-models/studentprogressquestions";
import { students } from "src/models/data-models/students";
import { LmsUserToken } from "src/models/token.model";

/**
 * Confining a teacher's log upload (`PUT /log/import`) to the teacher's own school.
 *
 * The upload carries rows about learners: sign-ins (`access`, keyed by a login id), results with their
 * answers (`result`, keyed by `studentid`) and progress (`progress`, keyed by `studentid`, or by a login id
 * for app usage). Every learner a row names must be a learner of the school the uploading teacher belongs
 * to (a learner of that school who has since been deleted still is: the export carries history); one that is
 * unknown, or another school's (deleted or not), refuses the whole upload (400), and the message names
 * nothing. Every table is written by its primary key, so a row that carries the primary key of a STORED row
 * also names that stored row's learner, and the stored row must be in the school too. The check runs before
 * any row is written.
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

type Spec = {
  /** Where the rows are in the parsed `log.ini`. */
  rows: (log: unknown) => Row[];
  model: { findAll: (o: object) => Promise<object[]> };
  pk: string;
  /** Columns that hold a learner's id, a login id, or either (a stored row's value is judged the same way). */
  student?: string;
  login?: string;
  either?: string;
};

const progressRows = (key: string) => (log: unknown) => rowsOf((log as Row).progress, key);
const SPECS: Spec[] = [
  { rows: (log) => rowsOf(log, "access"), model: rpiuseraccess, pk: "rpiuseraccessid", login: "userid" },
  { rows: (log) => rowsOf(log, "result"), model: studentprogress, pk: "studentprogressid", student: "studentid" },
  { rows: progressRows("studentactives"), model: studentactives, pk: "studentactiveid", student: "studentid" },
  { rows: progressRows("studentlearningprogress"), model: studentlearningprogress, pk: "studentlearningprogressid", student: "studentid", either: "userid" },
  { rows: progressRows("studentgradesprogress"), model: studentgradesprogress, pk: "studentgradeprogressid", student: "studentid" },
  { rows: progressRows("studentlevelsprogress"), model: studentlevelsprogress, pk: "studentlevelprogressid", student: "studentid" },
  { rows: progressRows("studentlessonsprogress"), model: studentlessonsprogress, pk: "studentlessonprogressid", student: "studentid" },
  { rows: progressRows("studentpoints"), model: studentpoints, pk: "studentpointid", student: "studentid" },
  { rows: progressRows("studentappusages"), model: studentappusages, pk: "studentappusageid", login: "schooluserid" },
];

/** How many ids one `IN (...)` lookup carries: a large upload never puts them all in one statement. */
export const LOOKUP_CHUNK = 5000;

/** `find` for every chunk of at most `size` ids, the answers joined: the same rows as one lookup of all of them. */
export const findInChunks = async <T>(ids: Iterable<string>, find: (chunk: string[]) => Promise<T[]>, size = LOOKUP_CHUNK): Promise<T[]> => {
  const all = [...ids];
  const found: T[] = [];
  for (let i = 0; i < all.length; i += size) {
    found.push(...(await find(all.slice(i, i + size))));
  }
  return found;
};

/** A stored value read back as an id (an absent one never matches anything). */
const storedId = (value: unknown): string => String(value ?? "").toLowerCase();

/**
 * Refuses the upload unless every learner it names, and every learner of a stored row it would overwrite, is a
 * learner of `teacher`'s school. The school is the one on the teacher's `schoolusers` row. `logdata` is the parsed
 * `log.ini` (`{ log: { access, result, progress } }`).
 *
 * Which column names the learner, by row type (and the primary key each table is written by):
 *  - `access` (rpiuseraccess, `rpiuseraccessid`): `userid`, a login id (a learner's, or a login of the school such as
 *    the teacher's).
 *  - `result` (studentprogress, `studentprogressid`): `studentid`. Each of its `studentprogressquestions`
 *    (`studentprogressquestionid`) belongs to a result row of the upload (checked through that row) or to a stored
 *    result whose learner is in the school.
 *  - `progress.studentactives`, `studentlearningprogress`, `studentgradesprogress`, `studentlevelsprogress`,
 *    `studentlessonsprogress`, `studentpoints`: `studentid` (and `userid` on a learning-progress row when it has one).
 *  - `progress.studentappusages`: `schooluserid`, a login id.
 * A login passes only when its own `schoolusers` row is in the school and so is every learner row that owns it
 * (`students.schooluserid` is not unique).
 */
export const assertLogRowsInSchool = async (teacher: schoolusers, logdata: unknown, chunkSize = LOOKUP_CHUNK): Promise<void> => {
  const log = (logdata as { log?: unknown } | null | undefined)?.log;
  if (log === undefined || log === null) return;

  // what the upload names: learners, logins, either, and the primary key of every row
  const studentIds = new Set<string>();
  const loginIds = new Set<string>();
  const eitherIds = new Set<string>();
  const pks = new Map<Spec, Set<string>>();
  const claims: Array<{ student?: string; login?: string; either?: string }> = [];
  for (const spec of SPECS) {
    const keys = new Set<string>();
    pks.set(spec, keys);
    for (const r of spec.rows(log)) {
      keys.add(idOf(r[spec.pk]));
      const claim: { student?: string; login?: string; either?: string } = {};
      if (spec.student) claim.student = idOf(r[spec.student]);
      if (spec.login) claim.login = idOf(r[spec.login]);
      if (spec.either && r[spec.either] !== undefined && r[spec.either] !== null) claim.either = idOf(r[spec.either]);
      claims.push(claim);
    }
  }
  // a question names the result it belongs to, and is itself written by its own key
  const resultIds = pks.get(SPECS[1])!;
  const questionKeys = new Set<string>();
  const uploadedParents = new Set<string>(); // results that questions name and that are not in the upload
  for (const r of rowsOf(log, "result")) {
    for (const q of rowsOf(r, "studentprogressquestions")) {
      questionKeys.add(idOf(q.studentprogressquestionid));
      const parent = idOf(q.studentprogressid);
      if (!resultIds.has(parent)) uploadedParents.add(parent);
    }
  }
  for (const c of claims) {
    if (c.student) studentIds.add(c.student);
    if (c.login) loginIds.add(c.login);
    if (c.either) eitherIds.add(c.either);
  }
  const schoolid = teacher.schoolid;
  if (studentIds.size + loginIds.size + eitherIds.size + questionKeys.size + uploadedParents.size === 0) return;
  if (!schoolid) throw outsideSchool(); // a teacher with no school has no learners
  const school = schoolid.toLowerCase();
  // every `IN` lookup goes in chunks
  const lookup = <T>(ids: Iterable<string>, find: (chunk: { [Op.in]: string[] }) => Promise<object[]>) =>
    findInChunks(ids, async (chunk) => (await find({ [Op.in]: chunk })) as unknown as T[], chunkSize);

  // the stored rows the upload's keys reach: whom they belong to is judged like the upload's own rows
  for (const spec of SPECS) {
    const keys = pks.get(spec)!;
    if (keys.size === 0) continue;
    const cols = [spec.student, spec.login, spec.either].filter((c): c is string => !!c);
    const stored = await lookup<Row>(keys, (ids) => spec.model.findAll({ attributes: [spec.pk, ...cols], where: { [spec.pk]: ids } }));
    for (const row of stored) {
      if (spec.student) studentIds.add(storedId(row[spec.student]));
      if (spec.login) loginIds.add(storedId(row[spec.login]));
      if (spec.either && row[spec.either] !== undefined && row[spec.either] !== null) eitherIds.add(storedId(row[spec.either]));
    }
  }
  const storedQuestions = await lookup<Row>(questionKeys, (ids) => studentprogressquestions.findAll({
    attributes: ["studentprogressquestionid", "studentprogressid"],
    where: { studentprogressquestionid: ids },
  }));
  const parents = new Set<string>([...uploadedParents, ...storedQuestions.map((q) => storedId(q.studentprogressid))]);
  const parentRows = await lookup<Row>(parents, (ids) => studentprogress.findAll({
    attributes: ["studentprogressid", "studentid"],
    where: { studentprogressid: ids },
  }));
  const parentOwner = new Map(parentRows.map((r) => [storedId(r.studentprogressid), storedId(r.studentid)]));
  for (const owner of parentOwner.values()) studentIds.add(owner);

  // whose each id is: the school of the learner, or of the login and of every learner that owns it
  const named = new Set([...loginIds, ...eitherIds]);
  const learnerSchool = new Map<string, string>();
  const everyStudent = new Set([...studentIds, ...eitherIds]);
  for (const l of await lookup<Row>(everyStudent, (ids) => students.findAll({ attributes: ["studentid", "schoolid"], where: { studentid: ids } }))) {
    learnerSchool.set(storedId(l.studentid), storedId(l.schoolid));
  }
  // `students.schooluserid` is not unique: every learner row that owns a login counts
  const loginOwnerSchools = new Map<string, string[]>();
  for (const l of await lookup<Row>(named, (ids) => students.findAll({ attributes: ["schooluserid", "schoolid"], where: { schooluserid: ids } }))) {
    const login = storedId(l.schooluserid);
    loginOwnerSchools.set(login, [...(loginOwnerSchools.get(login) ?? []), storedId(l.schoolid)]);
  }
  const staffLoginSchool = new Map<string, string>();
  for (const l of await lookup<Row>(named, (ids) => schoolusers.findAll({ attributes: ["schooluserid", "schoolid"], where: { schooluserid: ids } }))) {
    staffLoginSchool.set(storedId(l.schooluserid), storedId(l.schoolid));
  }
  const learnerOk = (id: string) => learnerSchool.get(id) === school;
  // a login passes when its own `schoolusers` row is in the school and so is every learner row that owns it
  const loginOk = (id: string) => staffLoginSchool.get(id) === school && (loginOwnerSchools.get(id) ?? []).every((owner) => owner === school);

  for (const id of studentIds) if (!learnerOk(id)) throw outsideSchool();
  for (const id of loginIds) if (!loginOk(id)) throw outsideSchool();
  for (const id of eitherIds) if (!learnerOk(id) && !loginOk(id)) throw outsideSchool();
  // a question's result: the upload's own, or a stored one of a learner of the school; and the result a stored
  // question belongs to now
  for (const id of uploadedParents) if (!parentOwner.has(id)) throw outsideSchool();
  for (const q of storedQuestions) if (!parentOwner.has(storedId(q.studentprogressid))) throw outsideSchool();
};
