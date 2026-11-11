import { Transaction } from "sequelize";
import { schoolusers } from "src/models/data-models/schoolusers";
import { AccountKind } from "./account-disable";
import { failedPush, pushOneAccount, PushedAccount } from "./add-learner";
import { PushOutcome } from "./publish-push";
import { ownersOfSchools } from "./row-owner";

/**
 * Deleting one learner (`DELETE student/:schooluserid`) or one teacher (`DELETE teacher/:schooluserid`) keeps its row and its
 * history (a soft delete, `isdeleted`). The student server refuses a sign-in for a login that is deleted there, so the one
 * account is sent to it after the delete commits, with `isdeleted` true: the roster getters filter `schooluserstatus` and not
 * `isdeleted`, so a deleted login and its learner row are still found and are sent with their flags.
 */

const WORDS: Record<AccountKind, { word: string; sync: string }> = {
  learner: { word: "learner", sync: "Sync Students" },
  teacher: { word: "teacher", sync: "Sync Teachers" },
};

/** The login whose delete has just been written: what is read inside the transaction, so the push can follow the commit. */
export interface DeletedLogin {
  schooluserid: string;
  schoolid: string;
}

/**
 * The school of a login whose delete has just been written in `tnx`. Only this read runs inside the transaction: the owner
 * lookup takes a second pool connection, and a transaction that holds one while it waits for another can stall the pool, so it
 * waits until `pushDeletedAccount`, after the commit.
 */
export const deletedAccountOf = async (schooluserid: string, tnx: Transaction): Promise<DeletedLogin> => {
  const login = await schoolusers.findOne({ where: { schooluserid }, transaction: tnx });
  return { schooluserid, schoolid: login?.schoolid as string };
};

/**
 * Sends the one deleted account to the student server (see `pushOneAccount`); never throws. Call it after the commit. The
 * owner of the school is read here, outside any transaction; if that read fails the delete stands and the push is `failed`.
 */
export const pushDeletedAccount = async (kind: AccountKind, login: DeletedLogin): Promise<PushOutcome> => {
  const { word, sync } = WORDS[kind];
  const failed = `Deleted, but the learning server did not answer. Run ${sync} for this school on the Schools screen.`;
  const failedLog = `push of a deleted ${word} to the learner server failed`;
  let account: PushedAccount;
  try {
    const owners = await ownersOfSchools([login.schoolid]);
    account = { ...login, organisationid: owners.get(login.schoolid) ?? null };
  } catch (error) {
    return failedPush(error, failedLog, failed);
  }
  return pushOneAccount(kind, account, {
    pushed: `Deleted. The ${word} can no longer sign in.`,
    skipped: "Deleted. No learner server is set up here, so nothing was pushed.",
    failed,
    failedLog,
    missingRefs: "Deleted, but the learning server doesn't have this school, class or curriculum yet, so the learner can still sign in there. Run Sync Content, then Sync Students for this school.",
  });
};

/** The answer of both routes: `data: true` stays for callers that read only that. */
export const deletedAnswer = (push: PushOutcome) => ({ error: false, data: true, push });
