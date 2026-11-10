import { Transaction } from "sequelize";
import { schoolusers } from "src/models/data-models/schoolusers";
import { AccountKind } from "./account-disable";
import { pushOneAccount, PushedAccount } from "./add-learner";
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

/**
 * The school and the owning organisation of a login whose delete has just been written in `tnx`, for the push that follows
 * the commit. Read before the commit, so a failed read rolls the delete back rather than leaving an account that cannot be pushed.
 */
export const deletedAccountOf = async (schooluserid: string, tnx: Transaction): Promise<PushedAccount> => {
  const login = await schoolusers.findOne({ where: { schooluserid }, transaction: tnx });
  const schoolid = login?.schoolid as string;
  const owners = await ownersOfSchools([schoolid]);
  return { schooluserid, schoolid, organisationid: owners.get(schoolid) ?? null };
};

/** Sends the one deleted account to the student server (see `pushOneAccount`); never throws. Call it after the commit. */
export const pushDeletedAccount = (kind: AccountKind, account: PushedAccount): Promise<PushOutcome> => {
  const { word, sync } = WORDS[kind];
  return pushOneAccount(kind, account, {
    pushed: `Deleted. The ${word} can no longer sign in.`,
    skipped: "Deleted. No learner server is set up here, so nothing was pushed.",
    failed: `Deleted, but the learning server did not answer. Run ${sync} for this school on the Schools screen.`,
    failedLog: `push of a deleted ${word} to the learner server failed`,
  });
};

/** The answer of both routes: `data: true` stays for callers that read only that. */
export const deletedAnswer = (push: PushOutcome) => ({ error: false, data: true, push });
