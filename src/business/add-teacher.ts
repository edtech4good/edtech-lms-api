import { v4 as uuidv4 } from "uuid";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiFieldError } from "src/models/ApiError";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { dbinstance } from "src/services/dbservice";
import { UNKNOWN_FIELD_MESSAGE } from "src/services/joi-message.service";
import { isLoginHandle } from "src/validators/login-handle";
import {
  invalid,
  isUniqueViolation,
  ORGANISATION_MESSAGE,
  passwordIsStrong,
  PASSWORD_MESSAGE,
  pushOneAccount,
  USERNAME_MESSAGE,
  usernameTaken,
  usernameTakenError,
} from "./add-learner";
import { scopeOf } from "./org-scope";
import { PushOutcome } from "./publish-push";
import { findOwnedSchool } from "./school-scope";
import { SchoolUserBusiness } from "./schooluser.business";

/**
 * Adding one teacher (`POST teacher/one`).
 *
 * The teacher is written by the same business function the CSV import uses (`createSchoolUser`), in one transaction, so a
 * teacher added here and a row of a CSV are stored the same way: a login with the teacher role and no learner row. The
 * username check is `GET student/username-available`, which asks about every login. After the commit the new account alone
 * is pushed to the student server, without failing the request: the account is on central whatever the push does, and the
 * answer says which way it went.
 */

const BODY_KEYS = ["schoolid", "schoolusername", "password"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AddTeacherInput {
  schoolid: string;
  schoolusername: string;
  password: string;
}

/** The request body as the form sends it, or a 400 naming every field that is wrong (the body's keys are the field names). */
export const validateAddTeacher = (body: unknown): AddTeacherInput => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid([{ field: "body", message: "Send the teacher's details as an object." }]);
  }
  const raw = body as Record<string, unknown>;
  const errors: ApiFieldError[] = [];
  if (Object.keys(raw).some((k) => !(BODY_KEYS as readonly string[]).includes(k))) {
    errors.push({ field: "body", message: UNKNOWN_FIELD_MESSAGE });
  }
  const schoolid = typeof raw.schoolid === "string" && UUID.test(raw.schoolid) ? raw.schoolid : undefined;
  if (schoolid === undefined) errors.push({ field: "schoolid", message: "Choose a school." });
  const schoolusername = isLoginHandle(raw.schoolusername) ? (raw.schoolusername as string) : undefined;
  if (schoolusername === undefined) errors.push({ field: "schoolusername", message: USERNAME_MESSAGE });
  if (!passwordIsStrong(raw.password)) errors.push({ field: "password", message: PASSWORD_MESSAGE });
  if (errors.length > 0) throw invalid(errors, "Check the highlighted fields.");
  return { schoolid: schoolid as string, schoolusername: schoolusername as string, password: raw.password as string };
};

export interface AddedTeacher {
  schooluserid: string;
  schoolusername: string;
  schoolid: string;
  organisationid: string | null;
}

/**
 * Creates the login in one transaction (committed here), or throws and writes nothing. The school must be the caller's (a
 * missing one and another organisation's are the same 404); a platform user who is not acting as an organisation is asked to
 * choose one.
 */
export const addTeacher = async (org: OrgContext, body: unknown): Promise<AddedTeacher> => {
  const scope = scopeOf(org); // 403 for a caller with no scope
  if (scope.kind === "platform") {
    throw invalid([{ field: "schoolid", message: ORGANISATION_MESSAGE }], ORGANISATION_MESSAGE);
  }
  const input = validateAddTeacher(body);
  const tnx = await dbinstance.getdbinstance().transaction();
  try {
    const school = await findOwnedSchool(org, input.schoolid, { transaction: tnx, field: "schoolid" });
    if (await usernameTaken(input.schoolusername, tnx)) throw usernameTakenError();
    const [login] = await new SchoolUserBusiness().createSchoolUser(
      [
        {
          isdisabled: false,
          schoolusername: input.schoolusername,
          schooluserpasswordhash: input.password,
          schooluserrole: SchoolRole.TEACHER,
          schooluserstatus: 1,
          schooluserid: uuidv4(),
          schoolname: school.schoolname,
          schoolid: school.schoolid,
        },
      ],
      tnx,
    );
    await tnx.commit();
    return {
      schooluserid: login.schooluserid,
      schoolusername: login.schoolusername,
      schoolid: school.schoolid,
      organisationid: school.organisationid ?? null,
    };
  } catch (error) {
    await tnx.rollback();
    // two requests for one username: the second reaches the unique key, and is answered as a taken name
    throw isUniqueViolation(error) ? usernameTakenError() : error;
  }
};

const PUSH_FAILED_MESSAGE = "The account was saved, but the learning server did not answer. Run Sync Teachers for this school on the Schools screen.";

/** Sends the one new teacher to the student server (see `pushOneAccount`). */
export const pushNewTeacher = (added: Pick<AddedTeacher, "schooluserid" | "schoolid" | "organisationid">): Promise<PushOutcome> =>
  pushOneAccount("teacher", added, {
    pushed: "Added. The teacher can sign in now.",
    skipped: "Added. No learner server is set up here, so nothing was pushed.",
    failed: PUSH_FAILED_MESSAGE,
    failedLog: "push of a new teacher to the learner server failed",
  });
