import { format, isValid, parse, startOfDay } from "date-fns";
import { Op, Transaction, fn, col, where as sqlWhere } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "src/config";
import { OrgContext } from "src/decorators/org.decorator";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { ApiError, ApiFieldError } from "src/models/ApiError";
import { countries } from "src/models/data-models/countries";
import { curriculums } from "src/models/data-models/curriculums";
import { schoolusers } from "src/models/data-models/schoolusers";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { dbinstance } from "src/services/dbservice";
import { UNKNOWN_FIELD_MESSAGE } from "src/services/joi-message.service";
import { isLoginHandle } from "src/validators/login-handle";
import { cloudConfigured, pushToCloud, studentsFile } from "./cloud-push";
import { assertEnrolmentFits } from "./content-owner";
import { scopeOf } from "./org-scope";
import { PushOutcome } from "./publish-push";
import { findOwnedSchool, findOwnedStandard } from "./school-scope";
import { SchoolUserBusiness } from "./schooluser.business";
import { StudentBusiness } from "./student.business";

/**
 * Adding one learner (`POST student/one`) and asking whether a username is free (`GET student/username-available`).
 *
 * The learner is written by the same two business functions the CSV import uses (`createSchoolUser`, `createStudents`),
 * in one transaction, so a learner added here and a row of a CSV are stored the same way. After the commit the new
 * account alone is pushed to the student server, without failing the request: the account is on central whatever the
 * push does, and the answer says which way it went.
 */

export const USERNAME_MESSAGE = "Use 2 to 16 English letters or numbers.";
export const USERNAME_TAKEN_MESSAGE = "That username is taken.";
export const PASSWORD_MESSAGE = "Use 8 to 32 characters with at least one letter and one number, and no spaces.";
export const CLASS_MESSAGE = "Choose a class for this student.";
export const ORGANISATION_MESSAGE = "Choose an organisation.";

/** `students.studentfirstname` and `studentlastname` are VARCHAR(45): a longer name would be refused by the database. */
export const NAME_MAX = 45;
export const NAME_MIN = 2;
export const CURRICULA_MAX = 50;

/** Gives up on the student server after this long, so a server that hangs cannot hold the admin's form for longer. */
export const LEARNER_PUSH_TIMEOUT_MS = 15_000;

const BODY_KEYS = [
  "schoolid",
  "standard",
  "curriculumids",
  "studentfirstname",
  "studentlastname",
  "schoolusername",
  "password",
  "genderid",
  "dateofbirth",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LETTER = /\p{L}/u;
const DIGIT = /[0-9]/;
const WHITESPACE = /\s/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface AddLearnerInput {
  schoolid: string;
  standard: string;
  curriculumids: string[];
  studentfirstname: string;
  studentlastname?: string;
  schoolusername: string;
  password: string;
  genderid: 1 | 2;
  dateofbirth?: Date;
}

export const invalid = (fields: ApiFieldError[], message?: string) =>
  new ApiError(ErrorCode.INVALID_INPUT, message ?? fields[0]?.message, { fields });

export const usernameTakenError = () => invalid([{ field: "schoolusername", message: USERNAME_TAKEN_MESSAGE }]);

const lengthOf = (text: string) => [...text].length;

/** The password rule of the account forms: 8 to 32 characters, at least one letter and one digit, no whitespace. */
export const passwordIsStrong = (password: unknown): password is string =>
  typeof password === "string" &&
  lengthOf(password) >= 8 &&
  lengthOf(password) <= 32 &&
  LETTER.test(password) &&
  DIGIT.test(password) &&
  !WHITESPACE.test(password);

const plainName = (value: unknown, required: boolean): { value?: string; message?: string } => {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "" && !required)) {
    return required ? { message: `Enter a name of ${NAME_MIN} to ${NAME_MAX} characters.` } : {};
  }
  if (typeof value !== "string") {
    return { message: `Enter a name of ${required ? NAME_MIN : 1} to ${NAME_MAX} characters.` };
  }
  const trimmed = value.trim();
  const min = required ? NAME_MIN : 1;
  if (lengthOf(trimmed) < min || lengthOf(trimmed) > NAME_MAX) {
    return { message: `Enter a name of ${min} to ${NAME_MAX} characters.` };
  }
  return { value: trimmed };
};

/**
 * The request body as the form sends it, or a 400 naming every field that is wrong (field names are the body's keys; a key
 * the body should not have is refused without being echoed).
 */
export const validateAddLearner = (body: unknown, now: Date = new Date()): AddLearnerInput => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid([{ field: "body", message: "Send the learner's details as an object." }]);
  }
  const raw = body as Record<string, unknown>;
  const errors: ApiFieldError[] = [];
  if (Object.keys(raw).some((k) => !(BODY_KEYS as readonly string[]).includes(k))) {
    errors.push({ field: "body", message: UNKNOWN_FIELD_MESSAGE });
  }
  const bad = (field: (typeof BODY_KEYS)[number], message: string) => errors.push({ field, message });

  const schoolid = typeof raw.schoolid === "string" && UUID.test(raw.schoolid) ? raw.schoolid : undefined;
  if (schoolid === undefined) bad("schoolid", "Choose a school.");

  const standard = typeof raw.standard === "string" && raw.standard.trim() !== "" && raw.standard.length <= 250 ? raw.standard : undefined;
  if (standard === undefined) bad("standard", CLASS_MESSAGE);

  let curriculumids: string[] | undefined;
  if (
    Array.isArray(raw.curriculumids) &&
    raw.curriculumids.length >= 1 &&
    raw.curriculumids.length <= CURRICULA_MAX &&
    raw.curriculumids.every((c) => typeof c === "string" && c.trim() !== "" && c.length <= 36)
  ) {
    curriculumids = [...new Set(raw.curriculumids as string[])];
  } else {
    bad("curriculumids", "Choose at least one curriculum.");
  }

  const first = plainName(raw.studentfirstname, true);
  if (first.message) bad("studentfirstname", first.message);
  const last = plainName(raw.studentlastname, false);
  if (last.message) bad("studentlastname", last.message);

  const schoolusername = isLoginHandle(raw.schoolusername) ? (raw.schoolusername as string) : undefined;
  if (schoolusername === undefined) bad("schoolusername", USERNAME_MESSAGE);

  const password = raw.password;
  if (!passwordIsStrong(password)) bad("password", PASSWORD_MESSAGE);

  const gender = raw.genderid === 1 || raw.genderid === "1" ? 1 : raw.genderid === 2 || raw.genderid === "2" ? 2 : undefined;
  if (gender === undefined) bad("genderid", "Choose a gender.");

  let dateofbirth: Date | undefined;
  if (raw.dateofbirth !== undefined && raw.dateofbirth !== null && raw.dateofbirth !== "") {
    const dateMessage = "Enter a real date in the past, as YYYY-MM-DD.";
    if (typeof raw.dateofbirth !== "string" || !DATE_ONLY.test(raw.dateofbirth)) {
      bad("dateofbirth", dateMessage);
    } else {
      const parsed = parse(raw.dateofbirth, "yyyy-MM-dd", now);
      if (!isValid(parsed) || format(parsed, "yyyy-MM-dd") !== raw.dateofbirth || parsed.getFullYear() < 1900 || parsed >= startOfDay(now)) {
        bad("dateofbirth", dateMessage);
      } else {
        dateofbirth = parsed;
      }
    }
  }

  if (errors.length > 0) throw invalid(errors, "Check the highlighted fields.");
  return {
    schoolid: schoolid as string,
    standard: standard as string,
    curriculumids: curriculumids as string[],
    studentfirstname: first.value as string,
    ...(last.value !== undefined ? { studentlastname: last.value } : {}),
    schoolusername: schoolusername as string,
    password: password as string,
    genderid: gender as 1 | 2,
    ...(dateofbirth ? { dateofbirth } : {}),
  };
};

/**
 * Is this username used by any login (a learner's or a teacher's, a deleted one too: a deleted login keeps its name)? Case
 * does not matter: the rows are compared as lower case on both sides, whatever the column's collation.
 */
export const usernameTaken = async (username: string, transaction?: Transaction): Promise<boolean> => {
  const wanted = username.toLowerCase();
  const rows = await schoolusers.findAll({
    where: sqlWhere(fn("LOWER", col("schoolusername")), wanted),
    attributes: ["schoolusername"],
    transaction,
  });
  return rows.some((row) => row.schoolusername.toLowerCase() === wanted);
};

/** The question `GET student/username-available` answers: a 400 for a value that is not a login handle, else whether it is free. */
export const usernameAvailable = async (value: unknown): Promise<{ available: boolean }> => {
  if (!isLoginHandle(value)) throw invalid([{ field: "username", message: USERNAME_MESSAGE }]);
  return { available: !(await usernameTaken(value as string)) };
};

export const isUniqueViolation = (error: unknown) => (error as { name?: string } | null)?.name === "SequelizeUniqueConstraintError";

export interface AddedLearner {
  schooluserid: string;
  schoolusername: string;
  studentname: string;
  schoolid: string;
  organisationid: string | null;
}

/**
 * Creates the login and the learner in one transaction (committed here), or throws and writes nothing. The school and the
 * class must be the caller's (a missing one and another organisation's are the same 404); a platform user who is not acting
 * as an organisation is asked to choose one.
 */
export const addLearner = async (org: OrgContext, body: unknown): Promise<AddedLearner> => {
  const scope = scopeOf(org); // 403 for a caller with no scope
  if (scope.kind === "platform") {
    throw invalid([{ field: "schoolid", message: ORGANISATION_MESSAGE }], ORGANISATION_MESSAGE);
  }
  const input = validateAddLearner(body);
  const tnx = await dbinstance.getdbinstance().transaction();
  try {
    const school = await findOwnedSchool(org, input.schoolid, { transaction: tnx, field: "schoolid" });
    await findOwnedStandard(org, input.standard, tnx, school.schoolid);
    const found = await curriculums.findAll({
      // only the school's own organisation's curricula: another organisation's are answered as if they did not exist
      where: { curriculumid: { [Op.in]: input.curriculumids }, organisationid: school.organisationid, isdeleted: false },
      attributes: ["curriculumid"],
      transaction: tnx,
    });
    const known = new Set(found.map((c) => c.curriculumid));
    if (input.curriculumids.some((id) => !known.has(id))) {
      throw invalid([{ field: "curriculumids", message: "Choose curricula that exist." }]);
    }
    await assertEnrolmentFits(school.organisationid, input.curriculumids, tnx);
    if (await usernameTaken(input.schoolusername, tnx)) throw usernameTakenError();

    const [login] = await new SchoolUserBusiness().createSchoolUser(
      [
        {
          isdisabled: false,
          schoolusername: input.schoolusername,
          schooluserpasswordhash: input.password,
          schooluserrole: SchoolRole.STUDENT,
          schooluserstatus: 1,
          schooluserid: uuidv4(),
          schoolname: school.schoolname,
          schoolid: school.schoolid,
        },
      ],
      tnx,
    );
    // The student API and the reports read the country by its name; the form asks for no city or state.
    const country = await countries.findOne({ where: { countryid: school.countryid }, attributes: ["countryname"], transaction: tnx });
    await new StudentBusiness().createStudents(
      [
        {
          city: "",
          country: country?.countryname ?? "",
          state: "",
          curriculumid: input.curriculumids[0],
          curriculumids: input.curriculumids,
          genderid: input.genderid,
          isactive: 1,
          schooluserid: login.schooluserid,
          studentfirstname: input.studentfirstname,
          studentid: uuidv4(),
          studentlastname: input.studentlastname,
          dateofbirth: input.dateofbirth,
          dateofjoin: new Date(),
          schoolname: school.schoolname,
          schoolid: school.schoolid,
          standard: input.standard,
          type: "online",
          is_teacher_acc: false,
        },
      ],
      tnx,
    );
    await tnx.commit();
    return {
      schooluserid: login.schooluserid,
      schoolusername: login.schoolusername,
      studentname: [input.studentfirstname, input.studentlastname].filter(Boolean).join(" "),
      schoolid: school.schoolid,
      organisationid: school.organisationid ?? null,
    };
  } catch (error) {
    await tnx.rollback();
    // two requests for one username: the second reaches the unique key, and is answered as a taken name
    throw isUniqueViolation(error) ? usernameTakenError() : error;
  }
};

const PUSH_FAILED_MESSAGE = "The account was saved, but the learning server did not answer. Run Sync Students for this school on the Schools screen.";

/**
 * Sends the one new account to the student server (the same file `?cloud=true` of the CSV import sends for the logins it
 * created). Never throws: the account is on central either way, and the outcome says which way the push went. Call it
 * only after the account has committed.
 */
export const pushNewLearner = async (added: Pick<AddedLearner, "schooluserid" | "schoolid" | "organisationid">): Promise<PushOutcome> => {
  if (!cloudConfigured()) {
    return { status: "skipped", reason: "nocloud", message: "Added. No learner server is set up here, so nothing was pushed." };
  }
  try {
    const rows = await new SchoolUserBusiness().getschooluserbyid([added.schooluserid], { withSchoolId: true });
    if (rows.length === 0) {
      throw new ApiError(ErrorCode.NOT_FOUND, "There are no students to sync.");
    }
    await pushToCloud(
      "students",
      "students.ini",
      JSON.stringify(studentsFile(added.schoolid, rows.map((x) => x.get({ plain: true })))),
      added.organisationid,
      { timeoutMs: LEARNER_PUSH_TIMEOUT_MS },
    );
    return { status: "pushed", message: "Added. The learner can sign in now." };
  } catch (error) {
    return failedPush(error, "push of a new learner to the learner server failed", PUSH_FAILED_MESSAGE);
  }
};

/**
 * The outcome of a push of one new account that did not succeed: logged by error class and mapped code only (an axios error
 * carries the request's config, which holds the server key), and answered with the message the admin is given.
 */
export const failedPush = (error: unknown, logLine: string, message: string): PushOutcome => {
  const mapped = new GlobalExceptionFilter().map(error);
  Logger.error(logLine, {
    originalerrorclass: (error as { constructor?: { name?: string } } | null)?.constructor?.name,
    code: mapped.code,
    status: mapped.status,
  });
  return {
    status: "failed",
    message,
    cause: mapped.errormessage,
    code: mapped.code,
  };
};
