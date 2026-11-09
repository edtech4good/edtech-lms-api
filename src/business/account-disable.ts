import { OrgContext } from "src/decorators/org.decorator";
import { ApiFieldError } from "src/models/ApiError";
import { schoolusers } from "src/models/data-models/schoolusers";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { dbinstance } from "src/services/dbservice";
import { UNKNOWN_FIELD_MESSAGE } from "src/services/joi-message.service";
import { invalid, ORGANISATION_MESSAGE, pushOneAccount } from "./add-learner";
import { scopeOf } from "./org-scope";
import { PushOutcome } from "./publish-push";
import { ownersOfSchools } from "./row-owner";
import { andInOwnedSchools, findOwnedStudent, studentNotFound, teacherNotFound } from "./school-scope";

/**
 * Disabling and enabling one learner (`PUT student/:schooluserid/disabled`) or one teacher (`PUT teacher/:schooluserid/disabled`).
 *
 * A disabled account keeps its row and its history; only `schoolusers.isdisabled` changes, and the student server refuses a
 * sign-in for a disabled login. The account must be one of the caller's schools' (another organisation's, a deleted one and
 * one of the other kind are all the same 404 as an id that does not exist). The write commits first; then the one account is
 * pushed to the student server without failing the request, and the answer says which way the push went. Setting the value an
 * account already has is a success and still pushes, so a push that failed once can be sent again by repeating the call.
 */

const BODY_KEYS = ["disabled"] as const;
const DISABLED_MESSAGE = "Send disabled as true or false.";

export type AccountKind = "learner" | "teacher";

/** The request body, or a 400 naming the field: an object holding `disabled` as a boolean and nothing else. */
export const validateDisabledBody = (body: unknown): boolean => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid([{ field: "body", message: "Send the change as an object." }]);
  }
  const raw = body as Record<string, unknown>;
  const errors: ApiFieldError[] = [];
  if (Object.keys(raw).some((k) => !(BODY_KEYS as readonly string[]).includes(k))) {
    errors.push({ field: "body", message: UNKNOWN_FIELD_MESSAGE });
  }
  if (typeof raw.disabled !== "boolean") errors.push({ field: "disabled", message: DISABLED_MESSAGE });
  if (errors.length > 0) throw invalid(errors, errors[0].message);
  return raw.disabled as boolean;
};

export interface DisabledChange {
  schooluserid: string;
  disabled: boolean;
  schoolid: string;
  organisationid: string | null;
}

const WORDS: Record<AccountKind, { word: string; sync: string }> = {
  learner: { word: "learner", sync: "Sync Students" },
  teacher: { word: "teacher", sync: "Sync Teachers" },
};

/**
 * Writes `isdisabled` on the caller's learner or teacher in one transaction (committed here), or throws and writes nothing.
 * A platform user who is not acting as an organisation is asked to choose one.
 */
export const setAccountDisabled = async (
  kind: AccountKind,
  org: OrgContext,
  actor: string | undefined,
  schooluserid: unknown,
  body: unknown,
): Promise<DisabledChange> => {
  const scope = scopeOf(org); // 403 for a caller with no scope
  if (scope.kind === "platform") {
    throw invalid([{ field: "schooluserid", message: ORGANISATION_MESSAGE }], ORGANISATION_MESSAGE);
  }
  const disabled = validateDisabledBody(body);
  const role = kind === "learner" ? SchoolRole.STUDENT : SchoolRole.TEACHER;
  const absent = kind === "learner" ? studentNotFound : teacherNotFound;
  const id = typeof schooluserid === "string" ? schooluserid : null;
  let schoolid = "";
  let resolved = "";
  const tnx = await dbinstance.getdbinstance().transaction();
  try {
    if (kind === "learner") {
      // a learner whose row is deleted is gone, whatever its login says
      await findOwnedStudent(org, { schooluserid: id, isdeleted: false }, tnx);
    }
    const login = await schoolusers.findOne({
      where: await andInOwnedSchools({ schooluserid: id, schooluserrole: role, isdeleted: false }, org, tnx),
      transaction: tnx,
    });
    if (!login) throw absent();
    await schoolusers.update(
      { isdisabled: disabled, updated_at: new Date(), updated_by: actor },
      { where: { schooluserid: login.schooluserid }, transaction: tnx },
    );
    await tnx.commit();
    schoolid = login.schoolid;
    resolved = login.schooluserid;
  } catch (error) {
    await tnx.rollback();
    throw error;
  }
  const owners = await ownersOfSchools([schoolid]);
  return { schooluserid: resolved, disabled, schoolid, organisationid: owners.get(schoolid) ?? null };
};

/** Sends the one changed account to the student server (see `pushOneAccount`); never throws. */
export const pushChangedAccount = (kind: AccountKind, change: DisabledChange): Promise<PushOutcome> => {
  const { word, sync } = WORDS[kind];
  return pushOneAccount(kind, change, {
    pushed: change.disabled ? `Disabled. The ${word} can no longer sign in.` : `Enabled. The ${word} can sign in again.`,
    skipped: "Saved. No learner server is set up here, so nothing was pushed.",
    failed: `The change was saved, but the learning server did not answer. Run ${sync} for this school on the Schools screen.`,
    failedLog: `push of a changed ${word} to the learner server failed`,
  });
};

/** The answer of both routes. */
export const disabledAnswer = (change: DisabledChange, push: PushOutcome) => ({
  schooluserid: change.schooluserid,
  disabled: change.disabled,
  push,
});
