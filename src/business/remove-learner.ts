import { Model, ModelStatic, Transaction } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { Logger } from "src/config";
import { ApiError } from "src/models/ApiError";
import { feedbacks } from "src/models/data-models/feedback";
import { rpiuseraccess } from "src/models/data-models/rpiuseraccess";
import { schoolusers } from "src/models/data-models/schoolusers";
import { students } from "src/models/data-models/students";
import { studentactives } from "src/models/data-models/studentactives";
import { studentappusages } from "src/models/data-models/studentappusage";
import { studentgradesprogress } from "src/models/data-models/studentgradesprogress";
import { studentlearningprogress } from "src/models/data-models/studentlearningprogress";
import { studentlessonsprogress } from "src/models/data-models/studentlessonprogress";
import { studentawards } from "src/models/data-models/studentawards";
import { studentlevelsprogress } from "src/models/data-models/studentlevelsprogress";
import { studentpoints } from "src/models/data-models/studentpoints";
import { studentprogress } from "src/models/data-models/studentprogress";
import { syncs } from "src/models/data-models/syncrecord";
import { tokens } from "src/models/data-models/tokens";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { dbinstance } from "src/services/dbservice";
import { ORGANISATION_MESSAGE, failedPush } from "./add-learner";
import { cloudConfigured, removeLearnerFromCloud, CloudRemoval } from "./cloud-push";
import { scopeOf } from "./org-scope";
import { ownersOfSchools } from "./row-owner";
import { andInOwnedSchools, findOwnedStudent, ownedSchoolIds, studentNotFound } from "./school-scope";

/**
 * Removing one learner who has never signed in and has no progress (`POST student/:schooluserid/remove`), so the username can
 * be used again. The learning server is asked first, because it is the only other copy of an account; central removes the
 * account only after the learning server has removed it (or never held it), and refuses when the learning server cannot be
 * asked. Anything with a sign-in or progress keeps the existing way out: Disable.
 *
 * The order, and why:
 * 1. Resolve the learner among the caller's schools (every learner row of the login must be in them), and look for central activity. Both read through the pool, so both come
 *    before the transaction opens (a read through the pool while a transaction is open can starve the pool).
 * 2. Ask the learning server (when one is set up). Its 409 is a refusal; no answer, a timeout or any other status is a 503 and
 *    nothing is removed anywhere.
 * 3. One transaction on central: lock the login row and its learner rows, look for central activity again, hard-delete the tokens,
 *    the learner rows and the login. A failure here after the learning server removed the account is answered as such (a refusal
 *    from the lock or the re-check too, since the learning server's copy is already gone); a retry finds the account absent on the
 *    learning server and finishes here.
 */

export const ACTIVITY_MESSAGE = "This learner has signed in or has progress, so it can't be removed. Disable it instead.";
export const ELSEWHERE_MESSAGE = "The learning server holds this account under another school, so nothing was removed. Run Sync Students for this school, then try again.";
export const UNREACHABLE_MESSAGE = "The learning server didn't answer, so nothing was removed. Try again later.";
export const HALF_REMOVED_MESSAGE = "Removed from the learning server, but not here. Try again.";
export const KEPT_MESSAGE =
  "This learner was removed from the learning server, but has activity here, so it was kept. Run Sync Students for this school to restore it on the learning server.";

/** Gives up on the learning server after this long (the same limit as the push of one account). */
export const REMOVE_TIMEOUT_MS = 15_000;

const activityError = () => new ApiError(ErrorCode.ALREADY_EXISTS, ACTIVITY_MESSAGE);
const isApiError = (error: unknown) => error instanceof ApiError;

interface Ids {
  schooluserid: string;
  studentids: string[];
}

interface ActivityCheck {
  table: string;
  /** Does the account have a row here? */
  has: (ids: Ids, transaction?: Transaction) => Promise<boolean>;
}

const anyRow = async (model: ModelStatic<Model>, column: string, values: string[], transaction?: Transaction) =>
  values.length > 0 && (await model.count({ where: { [column]: values }, transaction })) > 0;

const byLogin = (table: string, model: unknown, column: string): ActivityCheck => ({
  table,
  has: (ids, transaction) => anyRow(model as ModelStatic<Model>, column, [ids.schooluserid], transaction),
});
const byLearner = (table: string, model: unknown): ActivityCheck => ({
  table,
  has: (ids, transaction) => anyRow(model as ModelStatic<Model>, "studentid", ids.studentids, transaction),
});
/** A progress table that also carries the login in `userid`. */
const byLearnerOrLogin = (table: string, model: unknown): ActivityCheck => ({
  table,
  has: async (ids, transaction) =>
    (await anyRow(model as ModelStatic<Model>, "studentid", ids.studentids, transaction)) ||
    (await anyRow(model as ModelStatic<Model>, "userid", [ids.schooluserid], transaction)),
});

/**
 * Every central table whose rows would mean the learner has been used. (Central has no practice-progress or quiz-progress table:
 * those models are never initialised and no migration creates them; only the learning server has them.) `studentprogressquestions` is reached through
 * `studentprogress` (a question row hangs off a progress row), so it needs no check of its own.
 */
export const CENTRAL_ACTIVITY: ActivityCheck[] = [
  byLogin("rpiuseraccess", rpiuseraccess, "userid"),
  byLogin("studentappusages", studentappusages, "schooluserid"),
  byLogin("feedbacks", feedbacks, "created_by"),
  byLogin("syncrecords", syncs, "created_by"),
  byLearner("studentprogress", studentprogress),
  byLearnerOrLogin("studentlearningsprogress", studentlearningprogress),
  byLearner("studentgradesprogress", studentgradesprogress),
  byLearner("studentlevelsprogress", studentlevelsprogress),
  byLearner("studentawards", studentawards),
  byLearner("studentlessonsprogress", studentlessonsprogress),
  byLearner("studentpoints", studentpoints),
  byLearner("studentactives", studentactives),
];

const hasCentralActivity = async (ids: Ids, transaction?: Transaction): Promise<boolean> => {
  for (const check of CENTRAL_ACTIVITY) {
    if (await check.has(ids, transaction)) return true;
  }
  return false;
};

/** Every learner row of the login (live or not), with the school each is in; locked `FOR UPDATE` inside a transaction. */
const learnerRowsOf = async (schooluserid: string, transaction?: Transaction) =>
  students.findAll({ where: { schooluserid }, attributes: ["studentid", "schoolid"], transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });

export interface RemovedLearner {
  schooluserid: string;
  username: string;
  removed: true;
  message: string;
}

/** Asks the learning server; throws the 409 or the 503 of the contract, and never returns for an answer that is neither. */
const askLearningServer = async (schooluserid: string, organisationid: string | null): Promise<CloudRemoval> => {
  let answer: CloudRemoval;
  try {
    answer = await removeLearnerFromCloud(schooluserid, organisationid, { timeoutMs: REMOVE_TIMEOUT_MS });
  } catch (error) {
    // logged by error class and mapped code only: an axios error carries the request's config, which holds the server key
    failedPush(error, "removal of a learner from the learner server failed", UNREACHABLE_MESSAGE);
    throw new ApiError(ErrorCode.SERVICE_UNAVAILABLE, UNREACHABLE_MESSAGE);
  }
  if (answer === "activity") throw activityError();
  if (answer === "elsewhere") throw new ApiError(ErrorCode.ALREADY_EXISTS, ELSEWHERE_MESSAGE);
  return answer;
};

/**
 * Removes the caller's learner, or throws and removes nothing (see the order above). A platform user who is not acting as an
 * organisation is asked to choose one; an account that is not a live learner of the caller's schools is the 404 of an account
 * that is not there.
 */
export const removeLearner = async (org: OrgContext, schooluserid: unknown): Promise<RemovedLearner> => {
  const scope = scopeOf(org); // 403 for a caller with no scope
  if (scope.kind === "platform") {
    throw new ApiError(ErrorCode.INVALID_INPUT, ORGANISATION_MESSAGE, { fields: [{ field: "schooluserid", message: ORGANISATION_MESSAGE }] });
  }
  const id = typeof schooluserid === "string" ? schooluserid : null;
  // a learner whose row is deleted is gone, whatever its login says
  await findOwnedStudent(org, { schooluserid: id, isdeleted: false });
  const login = await schoolusers.findOne({
    where: await andInOwnedSchools({ schooluserid: id, schooluserrole: SchoolRole.STUDENT, isdeleted: false }, org),
  });
  if (!login) throw studentNotFound();
  const rows = await learnerRowsOf(login.schooluserid);
  // removing destroys every learner row of the login, so every one of them must be the caller's
  const owned = await ownedSchoolIds(org);
  if (owned !== undefined && rows.some((r) => !owned.includes(r.schoolid))) throw studentNotFound();
  const ids: Ids = { schooluserid: login.schooluserid, studentids: rows.map((r) => r.studentid) };
  const username = login.schoolusername;
  const owners = await ownersOfSchools([login.schoolid]);

  if (await hasCentralActivity(ids)) throw activityError();

  let there: CloudRemoval | undefined;
  if (cloudConfigured()) there = await askLearningServer(login.schooluserid, owners.get(login.schoolid) ?? null);

  // what the transaction refused with, so a refusal after the learning server removed the account is answered as such
  let refusal: "gone" | "activity" | undefined;
  const tnx = await dbinstance.getdbinstance().transaction();
  try {
    const locked = await schoolusers.findOne({
      where: { schooluserid: ids.schooluserid, schooluserrole: SchoolRole.STUDENT, isdeleted: false },
      transaction: tnx,
      lock: tnx.LOCK.UPDATE,
    });
    if (!locked) {
      refusal = "gone";
      throw studentNotFound();
    }
    const current: Ids = { schooluserid: ids.schooluserid, studentids: (await learnerRowsOf(ids.schooluserid, tnx)).map((r) => r.studentid) };
    if (await hasCentralActivity(current, tnx)) {
      refusal = "activity";
      throw activityError();
    }
    await tokens.destroy({ where: { lmsuserid: ids.schooluserid }, transaction: tnx });
    await students.destroy({ where: { schooluserid: ids.schooluserid }, transaction: tnx });
    await schoolusers.destroy({ where: { schooluserid: ids.schooluserid }, transaction: tnx });
    await tnx.commit();
  } catch (error) {
    try {
      await tnx.rollback();
    } catch (rollbackError) {
      Logger.error("rollback of a learner removal failed", { originalerrorclass: (rollbackError as { constructor?: { name?: string } } | null)?.constructor?.name });
    }
    if (there !== "removed") throw error;
    if (isApiError(error)) {
      // the learning server's copy is already gone: say so, and keep the ids only in the log
      Logger.error("a learner was removed from the learner server but central refused to remove it", { schooluserid: ids.schooluserid, refusal });
      if (refusal === "activity") throw new ApiError(ErrorCode.ALREADY_EXISTS, KEPT_MESSAGE);
      throw error;
    }
    Logger.error("a learner was removed from the learner server but not from central", {
      originalerrorclass: (error as { constructor?: { name?: string } } | null)?.constructor?.name,
    });
    throw new ApiError(ErrorCode.INTERNAL, HALF_REMOVED_MESSAGE);
  }
  return {
    schooluserid: ids.schooluserid,
    username,
    removed: true,
    message: `Removed. The username ${username} can be used again.`,
  };
};
