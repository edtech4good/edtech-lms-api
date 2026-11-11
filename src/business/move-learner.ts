import { Op } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError, ApiFieldError } from "src/models/ApiError";
import { curriculums } from "src/models/data-models/curriculums";
import { schools } from "src/models/data-models/school";
import { schoolusers } from "src/models/data-models/schoolusers";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { UNKNOWN_FIELD_MESSAGE } from "src/services/joi-message.service";
import { changeAccount } from "./account-disable";
import { CLASS_MESSAGE, classIdValue, curriculumIdsValue, invalid, pushOneAccount } from "./add-learner";
import { assertEnrolmentFits } from "./content-owner";
import { addedCurricula, firstUnpublished, unpublishedField } from "./enrolment-published";
import { GRADE_INVALID_MESSAGE, gradeIdValue, resolveLearnerGrade } from "./learner-grade";
import { nextCurriculumId } from "./next-curriculum-id";
import { PushOutcome } from "./publish-push";
import { findOwnedSchool, ownedSchoolIds, studentNotFound } from "./school-scope";

/**
 * Moving one learner to another school of the same organisation (`PUT student/:schooluserid/school`).
 *
 * The body is `{ schoolid, standard, curriculumids }` and an optional `gradeid`: the new school, one of its classes, the curricula the learner
 * follows there, and a grade of the first of them. Only the school, the class and the curricula change (the single `curriculumid` follows the list, as in the details
 * edit); the name, the username, the password, the active state and every result stay as they were, and a disabled learner stays
 * disabled. The learner must be one of the caller's schools' (another organisation's, a deleted one and a teacher are all the same
 * 404 as an id that does not exist). The write commits first; then the one learner is pushed to the student server, as a member of
 * the new school's roster, without failing the request, and the answer says which way the push went.
 */

const BODY_KEYS = ["schoolid", "standard", "curriculumids", "gradeid"] as const;

export const SCHOOL_MESSAGE = "Choose a school.";
export const DIFFERENT_SCHOOL_MESSAGE = "Choose a different school.";
export const SEVERAL_RECORDS_MESSAGE = "This learner has more than one record, so it can't be moved here. Contact support.";
const CURRICULA_MESSAGE = "Choose at least one curriculum.";
const CURRICULA_EXIST_MESSAGE = "Choose curricula that exist.";

export interface LearnerMove {
  schoolid: string;
  standard: string;
  curriculumids: string[];
  /** A grade of the learner's primary curriculum; none keeps the current one while it still fits, else asks for the only grade. */
  gradeid?: string;
}

/** The request body, or a 400 naming every field that is wrong (field names are the body's keys). All keys but `gradeid` are required. */
export const validateLearnerMove = (body: unknown): LearnerMove => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid([{ field: "body", message: "Send the new school as an object." }]);
  }
  const raw = body as Record<string, unknown>;
  const errors: ApiFieldError[] = [];
  if (Object.keys(raw).some((k) => !(BODY_KEYS as readonly string[]).includes(k))) {
    errors.push({ field: "body", message: UNKNOWN_FIELD_MESSAGE });
  }
  const schoolid = typeof raw.schoolid === "string" && raw.schoolid.trim() !== "" && raw.schoolid.length <= 36 ? raw.schoolid : undefined;
  if (schoolid === undefined) errors.push({ field: "schoolid", message: SCHOOL_MESSAGE });
  const standard = classIdValue(raw.standard);
  if (standard === undefined) errors.push({ field: "standard", message: CLASS_MESSAGE });
  const curriculumids = curriculumIdsValue(raw.curriculumids);
  if (curriculumids === undefined) errors.push({ field: "curriculumids", message: CURRICULA_MESSAGE });
  const gradeid = gradeIdValue(raw.gradeid);
  if (gradeid === null) errors.push({ field: "gradeid", message: GRADE_INVALID_MESSAGE });
  if (errors.length > 0) throw invalid(errors, "Check the highlighted fields.");
  return {
    schoolid: schoolid as string,
    standard: standard as string,
    curriculumids: curriculumids as string[],
    ...(typeof gradeid === "string" ? { gradeid } : {}),
  };
};

export interface MovedLearner {
  schooluserid: string;
  schoolusername: string;
  /** The new school. */
  schoolid: string;
  schoolname: string;
  organisationid: string | null;
}

/**
 * Moves the caller's learner in one transaction (committed here), or throws and writes nothing. A platform user who is not
 * acting as an organisation is asked to choose one. Inside the transaction the login is locked, every learner row of it is read,
 * and every wrong field of the body is named at once.
 */
export const moveLearner = async (org: OrgContext, actor: string | undefined, schooluserid: unknown, body: unknown): Promise<MovedLearner> => {
  let moved: { schoolid: string; schoolname: string } | undefined;
  const changed = await changeAccount(
    "learner",
    org,
    schooluserid,
    () => validateLearnerMove(body),
    async (login, tnx, input) => {
      const locked = await schoolusers.findOne({
        where: { schooluserid: login.schooluserid, schooluserrole: SchoolRole.STUDENT, isdeleted: false },
        transaction: tnx,
        lock: tnx.LOCK.UPDATE,
      });
      if (!locked) throw studentNotFound();
      const rows = await students.findAll({
        where: { schooluserid: locked.schooluserid, isdeleted: false },
        transaction: tnx,
        lock: tnx.LOCK.UPDATE,
      });
      // every learner row of the login must be the caller's, as when removing one
      const owned = await ownedSchoolIds(org, tnx);
      if (rows.length === 0 || (owned !== undefined && rows.some((r) => !owned.includes(r.schoolid)))) throw studentNotFound();
      if (rows.length > 1) throw new ApiError(ErrorCode.ALREADY_EXISTS, SEVERAL_RECORDS_MESSAGE);
      const learner = rows[0];

      // The learner is one of the caller's schools' learners, so its school's organisation is the caller's: a school of that
      // organisation is a school of the caller, and nothing else is a school this learner may move to.
      const current = await findOwnedSchool(org, locked.schoolid, { transaction: tnx, includeDeleted: true });
      const errors: ApiFieldError[] = [];

      let target: schools | null = null;
      if (input.schoolid === learner.schoolid) {
        errors.push({ field: "schoolid", message: DIFFERENT_SCHOOL_MESSAGE });
      } else {
        target = await schools.findOne({
          where: { schoolid: input.schoolid, organisationid: current.organisationid, isdeleted: false },
          transaction: tnx,
        });
        if (!target) errors.push({ field: "schoolid", message: SCHOOL_MESSAGE });
      }

      if (target) {
        // the class must be one of the NEW school's own
        const klass = await standards.findOne({
          where: { standardid: input.standard, isdeleted: false, schoolid: target.schoolid },
          attributes: ["standardid"],
          transaction: tnx,
        });
        if (!klass) errors.push({ field: "standard", message: CLASS_MESSAGE });
      }

      const found = await curriculums.findAll({
        // only the organisation's own curricula: another organisation's are answered as if they did not exist
        where: { curriculumid: { [Op.in]: input.curriculumids }, organisationid: current.organisationid, isdeleted: false },
        attributes: ["curriculumid"],
        transaction: tnx,
      });
      const known = new Set(found.map((c) => c.curriculumid));
      const curriculaExist = input.curriculumids.every((id) => known.has(id));
      if (!curriculaExist) errors.push({ field: "curriculumids", message: CURRICULA_EXIST_MESSAGE });

      // the learner's grade is one of its primary curriculum's: named, kept while it fits, or the curriculum's only one
      const curriculumid = nextCurriculumId(learner.curriculumid, input.curriculumids);
      let gradeid: string | undefined;
      if (curriculaExist) {
        // only a curriculum being added must be published: one the learner already has stays, even if retired since
        errors.push(...unpublishedField(await firstUnpublished(addedCurricula(input.curriculumids, learner), tnx)));
        const grade = await resolveLearnerGrade({ curriculumid, gradeid: input.gradeid, currentGradeid: learner.gradeid, transaction: tnx });
        if (grade.ok) gradeid = grade.gradeid;
        else errors.push({ field: grade.field, message: grade.message });
      }

      if (errors.length > 0 || !target || gradeid === undefined) throw invalid(errors, "Check the highlighted fields.");
      await assertEnrolmentFits(target.organisationid, input.curriculumids, tnx);

      const now = new Date();
      await schoolusers.update(
        { schoolid: target.schoolid, schoolname: target.schoolname, updated_at: now, updated_by: actor },
        { where: { schooluserid: locked.schooluserid }, transaction: tnx },
      );
      await students.update(
        {
          schoolid: target.schoolid,
          schoolname: target.schoolname,
          standard: input.standard,
          curriculumid,
          gradeid,
          curriculumids: input.curriculumids,
          updated_at: now,
          updated_by: actor,
        },
        { where: { studentid: learner.studentid }, transaction: tnx },
      );
      moved = { schoolid: target.schoolid, schoolname: target.schoolname };
    },
  );
  const to = moved as unknown as { schoolid: string; schoolname: string };
  return {
    schooluserid: changed.schooluserid,
    schoolusername: changed.schoolusername,
    schoolid: to.schoolid,
    schoolname: to.schoolname,
    // the new school belongs to the same organisation as the old one
    organisationid: changed.organisationid,
  };
};

/** Sends the one moved learner to the student server, in the new school's roster (see `pushOneAccount`); never throws. */
export const pushMovedLearner = (moved: Pick<MovedLearner, "schooluserid" | "schoolid" | "schoolname" | "organisationid">): Promise<PushOutcome> =>
  pushOneAccount("learner", moved, {
    pushed: `Moved to ${moved.schoolname}. The learner signs in again to see it.`,
    skipped: `Moved to ${moved.schoolname}. No learner server is set up here, so nothing was pushed.`,
    failed: `Moved, but the learning server did not answer. Run Sync Students for ${moved.schoolname} on the Schools screen.`,
    failedLog: "push of a moved learner to the learner server failed",
    missingRefs: `Moved, but the learning server doesn't have this school, class or curriculum yet. Run Sync Content, then Sync Students for ${moved.schoolname}.`,
  });

/** The answer of the move route. */
export const moveAnswer = (moved: MovedLearner, push: PushOutcome) => ({
  schooluserid: moved.schooluserid,
  username: moved.schoolusername,
  schoolid: moved.schoolid,
  schoolname: moved.schoolname,
  push,
});
