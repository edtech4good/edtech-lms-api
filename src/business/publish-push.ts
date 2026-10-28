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
 * ## Turns, and sharing
 *
 * Two acts of one organisation close together must not each build a payload and send it in whatever order the requests
 * happen to finish: a payload built before another act committed, sent after that act's push, would put an older set on the
 * student server. So an organisation has one push in flight at a time, and a push builds its payload when it starts, so it
 * carries every act that committed before it.
 *
 * The acts that arrive while a push is in flight do not each take a turn behind it (with a student server that hangs, a
 * queue of them would answer after 30 s, 60 s, 90 s, one timeout each). They wait for the one in flight and then share ONE
 * later push, built when that one finishes, so the newest state wins; every one of them gets that single push's outcome (each
 * in its own words: a retire that shared a publish's push still says "Retired."). With a hung student server, the first act
 * answers after one timeout and all the others after a second.
 *
 * This is in-process only: a second central process is not covered (there is one), and the student server does NOT
 * serialise imports for one organisation (its master import takes no organisation-level lock; a ticket is filed on the
 * student side). A push that gave up at the timeout may therefore still be importing on the student server when the next one
 * arrives, and the two can overlap there. That is the student side's to close.
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

/**
 * The catalogue's hints for a 5xx and a 502 end with "contact support with the reference". The `push` outcome carries no
 * reference (the act itself succeeded, so there is no error answer to carry one), so that sentence is dropped from the hint
 * and what remains is kept.
 */
const withoutReference = (hint: string | undefined): string | undefined => {
  const kept = hint?.replace(/\s*(?:If it keeps happening, c|C)ontact support with the reference\.\s*$/, "").trim();
  return kept ? kept : undefined;
};

const failedOutcome = (verb: PushVerb, error: unknown): PushOutcome => {
  const mapped = new GlobalExceptionFilter().map(error);
  // class and mapped code only: an axios error carries the request's config, which holds the server key
  Logger.error("push of the published set to the learner server failed", {
    originalerrorclass: (error as { constructor?: { name?: string } } | null)?.constructor?.name,
    code: mapped.code,
    status: mapped.status,
  });
  const hint = withoutReference(mapped.hint);
  return {
    status: "failed",
    message: `${verb}. ${FAILED_SUFFIX} ${mapped.errormessage}`,
    cause: mapped.errormessage,
    ...(hint ? { hint } : {}),
    code: mapped.code,
  };
};

/** How one push ended, before any act's words are put to it: the student server's answer, or what went wrong. */
export type PushSettled = { ok: true; answer: Awaited<ReturnType<typeof pushToCloud>> } | { ok: false; error: unknown };

/** One build and send of the organisation's published set. Never throws. */
const buildAndSend = async (organisationid: string): Promise<PushSettled> => {
  try {
    const organisation = await organisations.findOne({ where: { organisationid, isdeleted: false } });
    if (organisation === null) {
      throw new ApiError(ErrorCode.NOT_FOUND, "That organisation doesn't exist.");
    }
    const json = await new SyncBusiness().syncontentVersion3(organisation);
    return { ok: true, answer: await pushToCloud("master", "syncfile.ini", json, organisationid, { timeoutMs: PUSH_TIMEOUT_MS }) };
  } catch (error) {
    return { ok: false, error };
  }
};

/** An organisation that has a push in flight: the later acts' shared push, once one has asked for it. */
interface Lane {
  waiting: Promise<PushSettled> | null;
  start: (() => void) | null;
}
const lanes = new Map<string, Lane>();

/**
 * Pushes the organisation's published set, taking its turn (see "Turns, and sharing"): when nothing is in flight the push
 * starts at once; when one is, this waits for it and shares the one later push with every other act that waits.
 */
const takeTurn = (organisationid: string): Promise<PushSettled> => {
  const lane = lanes.get(organisationid);
  if (lane !== undefined) {
    if (lane.waiting === null) {
      lane.waiting = new Promise<PushSettled>((resolve) => {
        lane.start = () => void buildAndSend(organisationid).then(resolve);
      });
    }
    return lane.waiting;
  }
  const fresh: Lane = { waiting: null, start: null };
  lanes.set(organisationid, fresh);
  const own = buildAndSend(organisationid);
  void serveWaiting(organisationid, fresh, own);
  return own;
};

/** When the push in flight is over, runs the shared one the waiting acts asked for (and any asked for meanwhile), then frees the lane. */
const serveWaiting = async (organisationid: string, lane: Lane, inFlight: Promise<PushSettled>): Promise<void> => {
  await inFlight;
  while (lane.waiting !== null) {
    const waiting = lane.waiting;
    const start = lane.start;
    lane.waiting = null;
    lane.start = null;
    start?.();
    await waiting;
  }
  lanes.delete(organisationid);
};

/**
 * The manual re-push (`POST /sync/cloud`): the organisation's turn and the timeout, and what the push settled as, for the
 * caller to throw or answer as it always has. No `cloudConfigured` check: the manual push always attempts.
 */
export const pushOrganisationSet = (organisationid: string): Promise<PushSettled> => takeTurn(organisationid);

/**
 * Pushes the organisation's published set (see above). Never throws: whatever goes wrong is the `failed` outcome. Call it only
 * after the act has committed.
 */
export const pushPublishedSet = async (organisationid: string | null | undefined, verb: PushVerb): Promise<PushOutcome> => {
  if (!cloudConfigured()) return skippedNoCloud(verb);
  if (!organisationid) return skippedNothingPublished(verb);
  const settled = await takeTurn(organisationid);
  if (!settled.ok) return failedOutcome(verb, settled.error);
  const counts = "counts" in settled.answer ? settled.answer.counts : undefined;
  return {
    status: "pushed",
    message: `${verb}. The learner server has the organisation's published curricula.`,
    ...(counts ? { counts } : {}),
  };
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
