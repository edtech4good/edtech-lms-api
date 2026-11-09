import { Transaction } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiFieldError } from "src/models/ApiError";
import { schoolusers } from "src/models/data-models/schoolusers";
import { UNKNOWN_FIELD_MESSAGE } from "src/services/joi-message.service";
import { hashPassword } from "src/services/password.service";
import { AccountKind, changeAccount, ChangedLogin } from "./account-disable";
import { invalid, passwordIsStrong, PASSWORD_MESSAGE, pushOneAccount } from "./add-learner";
import { PushOutcome } from "./publish-push";

/**
 * Resetting the password of one learner (`PUT student/:schooluserid/password`) or one teacher
 * (`PUT teacher/:schooluserid/password`).
 *
 * The new password follows the rule of the add forms and is stored the way `createSchoolUser` stores one. The account must be
 * one of the caller's schools' (another organisation's, a deleted one and one of the other kind are all the same 404 as an id
 * that does not exist). A disabled account can have its password reset and stays disabled. The write commits first; then the
 * one account is pushed to the student server without failing the request, and the answer says which way the push went. The
 * answer never holds the password or its hash.
 */

const BODY_KEYS = ["password"] as const;

/** The request body, or a 400 naming the field: an object holding `password` that follows the rule, and nothing else. */
export const validatePasswordBody = (body: unknown): string => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid([{ field: "body", message: "Send the new password as an object." }]);
  }
  const raw = body as Record<string, unknown>;
  const errors: ApiFieldError[] = [];
  if (Object.keys(raw).some((k) => !(BODY_KEYS as readonly string[]).includes(k))) {
    errors.push({ field: "body", message: UNKNOWN_FIELD_MESSAGE });
  }
  if (!passwordIsStrong(raw.password)) errors.push({ field: "password", message: PASSWORD_MESSAGE });
  if (errors.length > 0) throw invalid(errors, errors[0].message);
  return raw.password as string;
};

/** Stores a new password hash on the caller's learner or teacher in one transaction (committed here), or throws and writes nothing. */
export const resetAccountPassword = (
  kind: AccountKind,
  org: OrgContext,
  actor: string | undefined,
  schooluserid: unknown,
  body: unknown,
): Promise<ChangedLogin> =>
  changeAccount(
    kind,
    org,
    schooluserid,
    () => validatePasswordBody(body),
    async (login: schoolusers, tnx: Transaction, password: string) => {
      await schoolusers.update(
        { schooluserpasswordhash: hashPassword(password), updated_at: new Date(), updated_by: actor },
        { where: { schooluserid: login.schooluserid }, transaction: tnx },
      );
    },
  );

/** Sends the one changed account to the student server (see `pushOneAccount`); never throws. */
export const pushResetAccount = (kind: AccountKind, change: ChangedLogin): Promise<PushOutcome> => {
  const word = kind === "learner" ? "learner" : "teacher";
  const sync = kind === "learner" ? "Sync Students" : "Sync Teachers";
  return pushOneAccount(kind, change, {
    pushed: `Password changed. The ${word} signs in with the new password.`,
    skipped: "Saved. No learner server is set up here, so nothing was pushed.",
    failed: `The password was saved, but the learning server did not answer. Run ${sync} for this school on the Schools screen.`,
    failedLog: `push of a ${word} with a new password to the learner server failed`,
  });
};

/** The answer of both routes. */
export const passwordAnswer = (change: ChangedLogin, push: PushOutcome) => ({
  schooluserid: change.schooluserid,
  schoolusername: change.schoolusername,
  push,
});
