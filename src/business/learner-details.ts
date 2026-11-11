import { format } from "date-fns";
import { Op } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiFieldError } from "src/models/ApiError";
import { curriculums } from "src/models/data-models/curriculums";
import { schoolusers } from "src/models/data-models/schoolusers";
import { students } from "src/models/data-models/students";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { UNKNOWN_FIELD_MESSAGE } from "src/services/joi-message.service";
import { changeAccount } from "./account-disable";
import {
  birthDateValue,
  CLASS_MESSAGE,
  classIdValue,
  curriculumIdsValue,
  DATE_MESSAGE,
  genderValue,
  invalid,
  ORGANISATION_MESSAGE,
  plainName,
  pushOneAccount,
} from "./add-learner";
import { assertEnrolmentFits } from "./content-owner";
import { addedCurricula, firstUnpublished, refusalOf, unpublishedField } from "./enrolment-published";
import { GRADE_INVALID_MESSAGE, gradeIdValue, resolveLearnerGrade } from "./learner-grade";
import { nextCurriculumId } from "./next-curriculum-id";
import { scopeOf } from "./org-scope";
import { PushOutcome } from "./publish-push";
import { andInOwnedSchools, findOwnedSchool, findOwnedStandard, findOwnedStudent, studentNotFound } from "./school-scope";

/**
 * Reading and editing one learner's details (`GET` and `PUT student/:schooluserid/details`).
 *
 * The username, the password and the school are not part of an edit (they have their own routes, or none). The rules are
 * those of adding a learner: names, gender, a real past date, a class of the learner's own school, and at least one
 * curriculum that fits the school's organisation. The learner must be one of the caller's schools' (another organisation's, a
 * deleted one and a teacher are all the same 404 as an id that does not exist). A disabled learner can be edited and stays
 * disabled. The write commits first; then the one learner is pushed to the student server without failing the request, and the
 * answer says which way the push went.
 */

const BODY_KEYS = ["studentfirstname", "studentlastname", "genderid", "dateofbirth", "standard", "curriculumids", "gradeid"] as const;

export interface LearnerEdit {
  studentfirstname: string;
  /** `null` clears the last name. */
  studentlastname: string | null;
  genderid: 1 | 2;
  /** `null` clears the date of birth. */
  dateofbirth: Date | null;
  standard: string;
  curriculumids: string[];
  /** A grade of the learner's primary curriculum; none keeps the current one while it still fits, else asks for the only grade. */
  gradeid?: string;
}

/** The request body, or a 400 naming every field that is wrong (field names are the body's keys). All keys but `gradeid` are required. */
export const validateLearnerEdit = (body: unknown, now: Date = new Date()): LearnerEdit => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid([{ field: "body", message: "Send the learner's details as an object." }]);
  }
  const raw = body as Record<string, unknown>;
  const errors: ApiFieldError[] = [];
  if (Object.keys(raw).some((k) => !(BODY_KEYS as readonly string[]).includes(k))) {
    errors.push({ field: "body", message: UNKNOWN_FIELD_MESSAGE });
  }
  const bad = (field: (typeof BODY_KEYS)[number], message: string) => errors.push({ field, message });
  const present = (key: (typeof BODY_KEYS)[number]) => Object.prototype.hasOwnProperty.call(raw, key);

  const first = plainName(raw.studentfirstname, true);
  if (first.message) bad("studentfirstname", first.message);

  let last: string | null = null;
  const lastResult = plainName(raw.studentlastname, false);
  if (!present("studentlastname") || lastResult.message || raw.studentlastname === undefined) {
    bad("studentlastname", lastResult.message ?? "Send the last name, or an empty one.");
  } else {
    last = lastResult.value ?? null;
  }

  const gender = genderValue(raw.genderid);
  if (gender === undefined) bad("genderid", "Choose a gender.");

  let dateofbirth: Date | null = null;
  if (!present("dateofbirth") || raw.dateofbirth === undefined) {
    bad("dateofbirth", DATE_MESSAGE);
  } else if (raw.dateofbirth !== null && raw.dateofbirth !== "") {
    const parsed = birthDateValue(raw.dateofbirth, now);
    if (parsed === undefined) bad("dateofbirth", DATE_MESSAGE);
    else dateofbirth = parsed;
  }

  const standard = classIdValue(raw.standard);
  if (standard === undefined) bad("standard", CLASS_MESSAGE);

  const curriculumids = curriculumIdsValue(raw.curriculumids);
  if (curriculumids === undefined) bad("curriculumids", "Choose at least one curriculum.");

  const gradeid = gradeIdValue(raw.gradeid);
  if (gradeid === null) bad("gradeid", GRADE_INVALID_MESSAGE);

  if (errors.length > 0) throw invalid(errors, "Check the highlighted fields.");
  return {
    studentfirstname: first.value as string,
    studentlastname: last,
    genderid: gender as 1 | 2,
    dateofbirth,
    standard: standard as string,
    curriculumids: curriculumids as string[],
    ...(typeof gradeid === "string" ? { gradeid } : {}),
  };
};

export { nextCurriculumId };

const dateOnly = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, "yyyy-MM-dd");
};

const listOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
};

export interface LearnerDetails {
  schooluserid: string;
  schoolusername: string;
  schoolid: string;
  schoolname: string;
  studentfirstname: string;
  studentlastname: string | null;
  genderid: number;
  dateofbirth: string | null;
  standard: string | null;
  curriculumids: string[];
  /** The learner's primary curriculum and its grade, as stored (null when none). */
  curriculumid: string | null;
  gradeid: string | null;
  isdisabled: boolean;
}

/** What `GET student/:schooluserid/details` answers: the fields an edit can change, with the login and school they belong to. */
export const getLearnerDetails = async (org: OrgContext, schooluserid: unknown): Promise<LearnerDetails> => {
  const scope = scopeOf(org); // 403 for a caller with no scope
  if (scope.kind === "platform") {
    throw invalid([{ field: "schooluserid", message: ORGANISATION_MESSAGE }], ORGANISATION_MESSAGE);
  }
  const id = typeof schooluserid === "string" ? schooluserid : null;
  const learner = await findOwnedStudent(org, { schooluserid: id, isdeleted: false });
  const login = await schoolusers.findOne({
    where: await andInOwnedSchools({ schooluserid: id, schooluserrole: SchoolRole.STUDENT, isdeleted: false }, org),
  });
  if (!login) throw studentNotFound();
  const school = await findOwnedSchool(org, login.schoolid, { includeDeleted: true });
  const ids = listOf(learner.curriculumids);
  return {
    schooluserid: login.schooluserid,
    schoolusername: login.schoolusername,
    schoolid: login.schoolid,
    schoolname: school.schoolname,
    studentfirstname: learner.studentfirstname,
    studentlastname: learner.studentlastname ?? null,
    genderid: learner.genderid,
    dateofbirth: dateOnly(learner.dateofbirth),
    standard: learner.standard ?? null,
    curriculumids: ids.length > 0 ? ids : learner.curriculumid ? [learner.curriculumid] : [],
    curriculumid: learner.curriculumid ?? null,
    gradeid: learner.gradeid ?? null,
    isdisabled: login.isdisabled === true,
  };
};

export interface EditedLearner {
  schooluserid: string;
  schoolusername: string;
  schoolid: string;
  organisationid: string | null;
  studentname: string;
}

/**
 * Writes the six fields to the caller's learner in one transaction (committed here), or throws and writes nothing. A platform
 * user who is not acting as an organisation is asked to choose one.
 */
export const editLearner = async (org: OrgContext, actor: string | undefined, schooluserid: unknown, body: unknown): Promise<EditedLearner> => {
  const changed = await changeAccount(
    "learner",
    org,
    schooluserid,
    () => validateLearnerEdit(body),
    async (login, tnx, input) => {
      const school = await findOwnedSchool(org, login.schoolid, { transaction: tnx, includeDeleted: true });
      try {
        // the class must be one of this learner's own school (another school's, another organisation's and a missing one alike)
        await findOwnedStandard(org, input.standard, tnx, login.schoolid);
      } catch (error) {
        if ((error as { code?: string } | null)?.code === ErrorCode.NOT_FOUND) throw invalid([{ field: "standard", message: CLASS_MESSAGE }]);
        throw error;
      }
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
      const learner = await students.findOne({ where: { schooluserid: login.schooluserid, isdeleted: false }, transaction: tnx });
      if (!learner) throw studentNotFound();
      const curriculumid = nextCurriculumId(learner.curriculumid, input.curriculumids);
      // only a curriculum being added must be published: one the learner already has stays, even if retired since; the grade
      // rule is checked with it, and a request wrong on both names both fields
      const unpublished = await firstUnpublished(addedCurricula(input.curriculumids, learner), tnx);
      const grade = await resolveLearnerGrade({ curriculumid, gradeid: input.gradeid, currentGradeid: learner.gradeid, transaction: tnx });
      const refusals = [...unpublishedField(unpublished), ...(grade.ok ? [] : [{ field: grade.field, message: grade.message }])];
      if (refusals.length > 0 || !grade.ok) throw refusalOf(refusals);
      const gradeid = grade.gradeid;
      await students.update(
        {
          studentfirstname: input.studentfirstname,
          studentlastname: input.studentlastname as string,
          genderid: input.genderid,
          dateofbirth: input.dateofbirth as Date,
          standard: input.standard,
          curriculumid,
          gradeid,
          curriculumids: input.curriculumids,
          updated_at: new Date(),
          updated_by: actor,
        },
        { where: { studentid: learner.studentid }, transaction: tnx },
      );
    },
  );
  const { input } = changed;
  return {
    schooluserid: changed.schooluserid,
    schoolusername: changed.schoolusername,
    schoolid: changed.schoolid,
    organisationid: changed.organisationid,
    studentname: [input.studentfirstname, input.studentlastname].filter(Boolean).join(" "),
  };
};

/** Sends the one edited learner to the student server (see `pushOneAccount`); never throws. */
export const pushEditedLearner = (edited: Pick<EditedLearner, "schooluserid" | "schoolid" | "organisationid">): Promise<PushOutcome> =>
  pushOneAccount("learner", edited, {
    pushed: "Saved. The learner's details are updated.",
    skipped: "Saved. No learner server is set up here, so nothing was pushed.",
    failed: "The details were saved, but the learning server did not answer. Run Sync Students for this school on the Schools screen.",
    failedLog: "push of an edited learner to the learner server failed",
  });

/** The answer of the edit route. */
export const editAnswer = (edited: EditedLearner, push: PushOutcome) => ({
  schooluserid: edited.schooluserid,
  studentname: edited.studentname,
  push,
});
