import axios from "axios";
import { certificateCheckBase, Config, Logger } from "src/config";
import { certificates, CertificateScopeName, CertificateSnapshot } from "src/models/data-models/certificates";
import { Op } from "sequelize";
import { cloudConfigured, learningServerLogFields, ORGANISATION_HEADER } from "./cloud-push";
import { PUSH_TIMEOUT_MS } from "./publish-push";

/**
 * Sending certificates to the learning server (certificates slice 2). The learner app talks only to the learning server,
 * so central copies a learner's certificates there: right after an issue or a revoke commits, and in full with Sync Students.
 * The route is `PUT /import/certificates` (server key, `X-Organisation-Id`), at most 2000 rows and 5000 learner ids to a request.
 *
 * What is sent is an allowlist of named fields (`pushRow`): never the revoke reason, who issued or revoked, or the
 * organisation id. A push after an issue or a revoke is best effort and never throws: the staff action already stands.
 * A Sync Students replace racing an issue, or a slow issue push landing after its revoke push, can leave the learning server
 * briefly out of date; the next Sync Students heals it.
 */

/** The learning server takes this many rows in one request. */
export const MAX_PUSH_ROWS = 2000;
/** ... and this many learner ids in `replaceForStudents`. */
export const MAX_REPLACE_STUDENTS = 5000;
/** Learners looked up in one query. */
const LOOKUP_SIZE = 500;

/** The public check address of a code: `CERTIFICATE_CHECK_URL` (trailing slash removed) + "/" + the code; null when the variable is unset. */
export const checkurl = (shortcode: string): string | null => {
  const base = certificateCheckBase();
  return base === null ? null : `${base}/${shortcode}`;
};

/** One certificate as the learning server takes it. */
export interface CertificatePushRow {
  certificateid: string;
  shortcode: string;
  studentid: string;
  curriculumid: string;
  scope: CertificateScopeName;
  scopeid: string;
  issuedat: Date;
  revokedat: Date | null;
  snapshot: CertificateSnapshot;
  checkurl: string | null;
}

/** The row to send for a certificate: these fields and no others. */
export const pushRow = (row: certificates): CertificatePushRow => ({
  certificateid: row.certificateid,
  shortcode: row.shortcode,
  studentid: row.studentid,
  curriculumid: row.curriculumid,
  scope: row.scope,
  scopeid: row.scopeid,
  issuedat: row.issuedat,
  revokedat: row.revokedat ?? null,
  snapshot: row.snapshot,
  checkurl: checkurl(row.shortcode),
});

interface Batch {
  rows: CertificatePushRow[];
  replaceForStudents?: string[];
}

const lower = (id: string): string => id.toLowerCase();

/**
 * The requests for these rows. Without `replaceForStudents` the rows are cut into runs of 2000. With it, a request that names
 * learners to replace must carry ALL of those learners' rows (the server deletes a named learner's certificates that are not
 * in the request), so the rows are grouped by learner and a learner is never split across requests: whole learners are packed
 * into a request until 2000 rows or 5000 learners would be passed. A learner who alone has more than 2000 rows cannot be
 * sent whole: those rows go in plain runs of 2000 with no replace for that learner (an unheard-of case; stale rows stay
 * until a later push).
 */
export const batchesOf = (rows: CertificatePushRow[], replaceForStudents?: string[]): Batch[] => {
  if (replaceForStudents === undefined) {
    const out: Batch[] = [];
    for (let at = 0; at < rows.length; at += MAX_PUSH_ROWS) out.push({ rows: rows.slice(at, at + MAX_PUSH_ROWS) });
    return out;
  }
  const byStudent = new Map<string, { id: string; rows: CertificatePushRow[] }>();
  for (const id of replaceForStudents) if (!byStudent.has(lower(id))) byStudent.set(lower(id), { id, rows: [] });
  for (const row of rows) {
    const entry = byStudent.get(lower(row.studentid)) ?? { id: row.studentid, rows: [] };
    entry.rows.push(row);
    byStudent.set(lower(row.studentid), entry);
  }
  const out: Batch[] = [];
  let current: { rows: CertificatePushRow[]; ids: string[] } = { rows: [], ids: [] };
  const flush = () => {
    if (current.rows.length > 0 || current.ids.length > 0) out.push({ rows: current.rows, replaceForStudents: current.ids });
    current = { rows: [], ids: [] };
  };
  for (const entry of byStudent.values()) {
    if (entry.rows.length > MAX_PUSH_ROWS) {
      flush();
      for (let at = 0; at < entry.rows.length; at += MAX_PUSH_ROWS) out.push({ rows: entry.rows.slice(at, at + MAX_PUSH_ROWS) });
      continue;
    }
    if (current.rows.length + entry.rows.length > MAX_PUSH_ROWS || current.ids.length + 1 > MAX_REPLACE_STUDENTS) flush();
    current.rows.push(...entry.rows);
    current.ids.push(entry.id);
  }
  flush();
  return out;
};

export interface CertificatePushCounts {
  upserted: number;
  deleted: number;
}

const countOf = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * Sends the rows to the learning server for one organisation, one request per batch, in order. Throws on the first failure
 * (the caller decides what that means); the counts are summed over the batches that went through.
 */
export const pushCertificates = async (
  organisationid: string,
  rows: CertificatePushRow[],
  replaceForStudents?: string[],
): Promise<CertificatePushCounts> => {
  const total: CertificatePushCounts = { upserted: 0, deleted: 0 };
  for (const batch of batchesOf(rows, replaceForStudents)) {
    const body = { certificates: batch.rows, ...(batch.replaceForStudents ? { replaceForStudents: batch.replaceForStudents } : {}) };
    const response = await axios.put(`${Config.fortyk.api.rpi.cloud}/import/certificates`, body, {
      headers: { Authorization: Config.fortyk.api.serversynckey, [ORGANISATION_HEADER]: organisationid },
      timeout: PUSH_TIMEOUT_MS,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    const data = (response?.data as { data?: { upserted?: unknown; deleted?: unknown } } | undefined)?.data;
    total.upserted += countOf(data?.upserted);
    total.deleted += countOf(data?.deleted);
  }
  return total;
};

/**
 * After an issue or a revoke committed: sends these certificates, best effort. True when the learning server took them
 * (or there was nothing to send); false when none is set up here or the push failed. Never throws. The log names the class of
 * the failure and the learning server's status, code and refused field names, never a row, a name or the key.
 */
export const pushAffected = async (organisationid: string, rows: certificates[]): Promise<boolean> => {
  if (rows.length === 0) return true;
  if (!cloudConfigured()) return false;
  try {
    await pushCertificates(organisationid, rows.map(pushRow));
    return true;
  } catch (error) {
    Logger.warn("push of certificates to the learning server failed", {
      originalerrorclass: (error as { constructor?: { name?: string } } | null)?.constructor?.name,
      ...learningServerLogFields(error),
    });
    return false;
  }
};

/** What Sync Students says about the certificates it sent, next to the roster result. */
export type CertificateSyncOutcome =
  | { status: "pushed"; upserted: number; deleted: number; message: string }
  | { status: "skipped"; message: string }
  | { status: "failed"; message: string };

export const CERTIFICATES_FAILED_MESSAGE =
  "The learners were synced, but their certificates could not be sent to the learning server. Run Sync Students again to send them.";

/**
 * The certificates of these learners (revoked ones too, so a revoke reaches the learning server), sent after the roster went
 * through, with `replaceForStudents` = every one of these learners (one with no certificates is named too, so what the
 * learning server still holds for them is cleared). Never throws: the roster result stands whatever this says.
 */
export const syncCertificatesFor = async (organisationid: string, studentids: string[]): Promise<CertificateSyncOutcome> => {
  const ids = [...new Map(studentids.map((id) => [lower(id), id])).values()];
  if (ids.length === 0) return { status: "skipped", message: "No learners, so no certificates were sent." };
  if (!cloudConfigured()) return { status: "skipped", message: "No learning server is set up, so no certificates were sent." };
  try {
    const rows: certificates[] = [];
    for (let at = 0; at < ids.length; at += LOOKUP_SIZE) {
      rows.push(
        ...(await certificates.findAll({
          where: { organisationid, studentid: { [Op.in]: ids.slice(at, at + LOOKUP_SIZE) } },
          order: [["certificateid", "ASC"]],
        })),
      );
    }
    const counts = await pushCertificates(organisationid, rows.map(pushRow), ids);
    return { status: "pushed", ...counts, message: "Certificates sent to the learning server." };
  } catch (error) {
    Logger.warn("push of the learners' certificates to the learning server failed", {
      originalerrorclass: (error as { constructor?: { name?: string } } | null)?.constructor?.name,
      ...learningServerLogFields(error),
    });
    return { status: "failed", message: CERTIFICATES_FAILED_MESSAGE };
  }
};
