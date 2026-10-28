import { OrgContext } from "src/decorators/org.decorator";
import { Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { ApiError } from "src/models/ApiError";
import { organisations } from "src/models/data-models/organisations";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { cloudConfigured, PushCounts, pushToCloud } from "./cloud-push";
import { publishCurriculum, PublishResult, publishingOrganisation, retireCurriculum, RetireResult } from "./curriculum-publication";
import { SyncBusiness } from "./sync.business";

/**
 * Pushing the organisation's published set to the cloud student server after an act that changes it (A4 step 3, design
 * decision 3): a publish, a retire, and the delete of a curriculum that was published. Central does it with the server key,
 * so the organisation's admin never holds the key and a publish reaches online learners without a platform admin.
 *
 * ## What is pushed
 *
 * The same thing `POST /sync/cloud` pushes: the organisation's PUBLISHED content (published-content.ts), whole, as the
 * student API's scoped replace. It is built from the committed rows, so a draft edit is never in it.
 *
 * ## When
 *
 * AFTER the act has committed, never inside its transaction: the build reads through the pool, and a transaction held
 * open while it does would starve the pool of the connections the build needs (the lesson of the step 1 lock-order
 * regression). A failed push does not undo the act: the answer carries `push.status: "failed"` and what went wrong, and the
 * organisation's admin is told that a platform admin can push again from Sync Content, which pushes the same published
 * set. A publish repeated after a failed push still pushes (a publish with nothing changed still records a publication).
 *
 * The push runs before the HTTP answer returns, so the admin sees its result. It gives up on the student server after
 * `PUSH_TIMEOUT_MS`, so a server that hangs cannot hold the admin's request for longer than that.
 *
 * ## Turns
 *
 * Two acts of one organisation close together each push, and each push builds the payload when its turn comes, so the later
 * push always carries the earlier act (a payload built before another act committed, sent after that act's push, would
 * put an older set on the student server). Pushes of one organisation take turns within this process; the student server
 * serialises writes to one organisation's content itself, and a second central process is not covered (there is one).
 *
 * ## The answer
 *
 * - `pushed`: the student server accepted the set (`counts` are what it wrote, when it said).
 * - `skipped`: nothing was attempted, because no student server is set up here (`RPI_CLOUD` unset), or because the act
 *   changed nothing a learner can see (a retire of a curriculum that was never published; a delete of one that was not
 *   published). An organisation whose last published curriculum was just retired is NOT skipped: its set is empty and is
 *   pushed as empty, which is how the student server learns the curriculum is gone.
 * - `failed`: the attempt did not succeed. `cause` is the words an error answer would have used for it (the 502 text when the
 *   student server refused this server's key, the 400 text it gave for an invalid payload, the 503 text when it could not be
 *   reached or timed out) and `code` its error code; neither names a host, a key or a row.
 */

export const PUSH_TIMEOUT_MS = 30_000;

/** The act the push follows, as the message names it. */
export type PushVerb = "Published" | "Retired" | "Deleted";

export interface PushOutcome {
  status: "pushed" | "failed" | "skipped";
  /** A sentence for the admin, starting with what was done ("Published. ..."). */
  message: string;
  /** failed: why, in the catalogue's words. */
  cause?: string;
  /** failed: the catalogue's hint for that cause, when it has one. */
  hint?: string;
  /** failed: the error code of that cause. */
  code?: ErrorCode;
  /** pushed: what the student server wrote, deleted and marked deleted, per table, when it said. */
  counts?: PushCounts;
  /** skipped: why. */
  reason?: "nocloud" | "nothingpublished";
}

const FAILED_SUFFIX = "The push to the learner server failed; a platform admin can re-push from Sync Content.";

export const skippedNoCloud = (verb: PushVerb): PushOutcome => ({
  status: "skipped",
  reason: "nocloud",
  message: `${verb}. No learner server is set up here, so nothing was pushed.`,
});

export const skippedNothingPublished = (verb: PushVerb): PushOutcome => ({
  status: "skipped",
  reason: "nothingpublished",
  message: `${verb}. That curriculum was not published, so there was nothing to push.`,
});

const failedOutcome = (verb: PushVerb, error: unknown): PushOutcome => {
  const mapped = new GlobalExceptionFilter().map(error);
  // class and mapped code only: an axios error carries the request's config, which holds the server key
  Logger.error("push of the published set to the learner server failed", {
    originalerrorclass: (error as { constructor?: { name?: string } } | null)?.constructor?.name,
    code: mapped.code,
    status: mapped.status,
  });
  return {
    status: "failed",
    message: `${verb}. ${FAILED_SUFFIX} ${mapped.errormessage}`,
    cause: mapped.errormessage,
    ...(mapped.hint ? { hint: mapped.hint } : {}),
    code: mapped.code,
  };
};

const turns = new Map<string, Promise<void>>();

/** Runs `job` after every earlier job under the same key has finished (whether it succeeded or not). */
const inTurn = <T>(key: string, job: () => Promise<T>): Promise<T> => {
  const result = (turns.get(key) ?? Promise.resolve()).then(job);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  turns.set(key, tail);
  void tail.then(() => {
    if (turns.get(key) === tail) turns.delete(key);
  });
  return result;
};

/**
 * Pushes the organisation's published set (see above). Never throws: whatever goes wrong is the `failed` outcome. Call it only
 * after the act has committed.
 */
export const pushPublishedSet = async (organisationid: string | null | undefined, verb: PushVerb): Promise<PushOutcome> => {
  if (!cloudConfigured()) return skippedNoCloud(verb);
  if (!organisationid) return skippedNothingPublished(verb);
  return inTurn<PushOutcome>(organisationid, async () => {
    try {
      const organisation = await organisations.findOne({ where: { organisationid, isdeleted: false } });
      if (organisation === null) {
        throw new ApiError(ErrorCode.NOT_FOUND, "That organisation doesn't exist.");
      }
      const json = await new SyncBusiness().syncontentVersion3(organisation);
      const answer = await pushToCloud("master", "syncfile.ini", json, organisationid, { timeoutMs: PUSH_TIMEOUT_MS });
      const counts = "counts" in answer ? answer.counts : undefined;
      return {
        status: "pushed",
        message: `${verb}. The learner server has the organisation's published curricula.`,
        ...(counts ? { counts } : {}),
      };
    } catch (error) {
      return failedOutcome(verb, error);
    }
  });
};

/** Publishes the curriculum (committing), then pushes the organisation's published set. */
export const publishAndPush = async (
  org: OrgContext,
  publishedby: string,
  curriculumid: string,
): Promise<PublishResult & { push: PushOutcome }> => {
  const result = await publishCurriculum(org, publishedby, curriculumid);
  return { ...result, push: await pushPublishedSet(publishingOrganisation(org), "Published") };
};

/**
 * Retires the curriculum (committing), then pushes the organisation's published set, so that the curriculum is gone from the
 * student server at once. A curriculum that was never published has nothing to push. One already retired is pushed again:
 * that is how a retire whose push failed is repeated.
 */
export const retireAndPush = async (org: OrgContext, curriculumid: string): Promise<RetireResult & { push: PushOutcome }> => {
  const result = await retireCurriculum(org, curriculumid);
  const push =
    result.publicationstatus === "never" ? skippedNothingPublished("Retired") : await pushPublishedSet(publishingOrganisation(org, "retire"), "Retired");
  return { ...result, push };
};

/**
 * The push that follows the delete of a curriculum (curriculum.business.ts `deleteCurriculum`, which has withdrawn its
 * publications in the same transaction as the delete). Nothing to push when the curriculum was not published: the set a
 * learner is served did not change.
 */
export const pushAfterDelete = async (deleted: { organisationid: string | null; withdrew: boolean }): Promise<PushOutcome> =>
  deleted.withdrew ? pushPublishedSet(deleted.organisationid, "Deleted") : skippedNothingPublished("Deleted");
