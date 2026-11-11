import AdmZip from "adm-zip";
import axios from "axios";
import FormData from "form-data";
import { Config } from "src/config";
import { ApiError, ApiFieldError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";

/** The student API routes a sync writes to. */
export type CloudImport = "master" | "students" | "teachers";

/** The header that tells the student API which organisation a request is on behalf of. */
export const ORGANISATION_HEADER = "X-Organisation-Id";

/**
 * Whether this server has a student server to push to: `RPI_CLOUD` is set to something other than the placeholder the
 * configuration falls back to. An unset one is not an error (a central server with no online learners has none); a push
 * that is asked for without one is skipped, never attempted.
 */
export const cloudConfigured = (): boolean => {
  const url = Config.fortyk.api.rpi?.cloud;
  return typeof url === "string" && url.trim() !== "" && !url.trim().startsWith("your-");
};

export interface PushOptions {
  /**
   * Gives up on the student server after this long. Left out, the request waits as long as the server does (the manual
   * Sync Content has always done so); a push made while an admin waits for the answer to a publish sets one.
   */
  timeoutMs?: number;
}

/**
 * Sends one file to the student API's import route, as a zip holding `entry`, with the server key. The request names the
 * organisation it is for (`X-Organisation-Id`) when there is one: a content push always has one, a push of a school's
 * learners or teachers has the school's.
 */
export const pushToCloud = async (
  kind: CloudImport,
  entry: string,
  json: string,
  organisationid?: string | null,
  options: PushOptions = {},
) => {
  const zip = new AdmZip();
  zip.addFile(entry, Buffer.from(json, "utf8"));
  const file = new FormData();
  file.append("importfile", zip.toBuffer(), "importfile.zip");
  let response;
  try {
    response = await axios.put(`${Config.fortyk.api.rpi.cloud}/import/${kind}`, file, {
      headers: {
        Authorization: Config.fortyk.api.serversynckey,
        ...(organisationid ? { [ORGANISATION_HEADER]: organisationid } : {}),
        ...file.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
    });
  } catch (error) {
    throw (kind === "master" ? refusalOf(error) : undefined) ?? error;
  }
  if (response.status === 200) {
    const counts = countsOf(response.data);
    return counts ? { error: false, data: true, counts } : { error: false, data: true };
  }
  throw Error(response.data);
};

/** What the learning server said to a request to remove one learner: it removed it, it never held it, or the learner has activity there. */
export type CloudRemoval = "removed" | "absent" | "activity" | "elsewhere";

/**
 * Asks the learning server to remove one learner who has never signed in (`DELETE import/students/:schooluserid`), with the
 * server key and the organisation's header. A 200 saying it removed the learner or never held it, and a 409 (the learner has
 * activity there), are answers; anything else (no answer, a timeout, a 5xx, another status, a 200 that says neither) throws, so
 * the caller does not go on.
 */
export const removeLearnerFromCloud = async (
  schooluserid: string,
  organisationid: string | null | undefined,
  options: PushOptions = {},
): Promise<CloudRemoval> => {
  const response = await axios.delete(`${Config.fortyk.api.rpi.cloud}/import/students/${encodeURIComponent(schooluserid)}`, {
    headers: {
      Authorization: Config.fortyk.api.serversynckey,
      ...(organisationid ? { [ORGANISATION_HEADER]: organisationid } : {}),
    },
    validateStatus: () => true,
    ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
  });
  // a 409 without a reason this server knows is read as activity: either way nothing is removed
  if (response.status === 409) return (response.data as { reason?: unknown } | null)?.reason === "elsewhere" ? "elsewhere" : "activity";
  const body = (response.data ?? {}) as { removed?: unknown; absent?: unknown };
  if (response.status === 200 && body.removed === true) return "removed";
  if (response.status === 200 && body.removed === false && body.absent === true) return "absent";
  throw new Error(`unexpected answer ${response.status}`);
};

/** What the student API wrote, deleted and marked deleted, per table of the payload (only numbers are relayed). */
export type PushCounts = Record<string, Record<string, number>>;

const countsOf = (data: unknown): PushCounts | undefined => {
  const raw = (data as { counts?: unknown } | null | undefined)?.counts;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const counts: PushCounts = {};
  for (const [table, entry] of Object.entries(raw)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const numbers = Object.fromEntries(Object.entries(entry).filter(([, n]) => typeof n === "number" && Number.isFinite(n))) as Record<string, number>;
    counts[table] = numbers;
  }
  return Object.keys(counts).length > 0 ? counts : undefined;
};

const MAX_RELAYED_MESSAGE = 1000;

/**
 * The student API refused the file as invalid (400): its own message goes to the admin, unchanged, because it says what is
 * wrong with the payload (a table it does not know, a type it does not support) and counts rows, never naming them. Only
 * the content push (`master`) relays it; the roster pushes keep the generic answer. Any other failure (the server key
 * refused, the server down, a 500) is left to the error filter's generic answers: those messages are about the receiving
 * server, not about the admin's data.
 */
const refusalOf = (error: unknown): ApiError | undefined => {
  const response = (error as { isAxiosError?: boolean; response?: { status?: number; data?: unknown } } | null)?.response;
  if (!(error as { isAxiosError?: boolean } | null)?.isAxiosError || response?.status !== 400) {
    return undefined;
  }
  const body = (response.data ?? {}) as { errormessage?: unknown; fields?: unknown };
  if (typeof body.errormessage !== "string" || body.errormessage.trim().length === 0) {
    return undefined;
  }
  const fields: ApiFieldError[] = Array.isArray(body.fields)
    ? body.fields
        .filter((f): f is ApiFieldError => typeof f?.field === "string" && typeof f?.message === "string")
        .map((f) => ({ field: f.field.slice(0, 100), message: f.message.slice(0, MAX_RELAYED_MESSAGE) }))
    : [];
  return new ApiError(ErrorCode.INVALID_INPUT, body.errormessage.slice(0, MAX_RELAYED_MESSAGE), { fields });
};

/**
 * The answer Sync Students and Sync Teachers give when the learning server refused the roster for a school, class or
 * curriculum it does not hold yet (409, central's own words); undefined for any other failure, which is left to the error filter.
 */
export const rosterApiError = (kind: "students" | "teachers", error: unknown): ApiError | undefined => {
  const refusal = rosterRefusalOf(error);
  if (refusal === "school-or-class") {
    return new ApiError(
      ErrorCode.ALREADY_EXISTS,
      `The learning server doesn't have this school or one of its classes yet. Run Sync Content, then Sync ${kind === "students" ? "Students" : "Teachers"}.`,
      { hint: "" },
    );
  }
  if (refusal === "curriculum" && kind === "students") {
    return new ApiError(ErrorCode.ALREADY_EXISTS, "A curriculum these learners use isn't on the learning server. Publish it, then Sync Students.", { hint: "" });
  }
  return undefined;
};

/** What the learning server answered to a push, read from the failure: its status, its error code and the names of the fields it refused. */
export interface LearningServerAnswer {
  status: number;
  code?: string;
  fields: string[];
}

/**
 * The learning server's answer inside a failed push, when it gave one (an axios error with a response). Only the status, the
 * code and the field names are read: nothing of its text is relayed. A timeout or a refused connection has no answer.
 */
export const learningServerAnswer = (error: unknown): LearningServerAnswer | undefined => {
  const e = error as { isAxiosError?: boolean; response?: { status?: unknown; data?: { code?: unknown; fields?: unknown } } } | null;
  if (!e?.isAxiosError || typeof e.response?.status !== "number") return undefined;
  const data = e.response.data;
  const raw: unknown[] = Array.isArray(data?.fields) ? (data?.fields as unknown[]) : [];
  const fields = raw
    .map((f) => (f as { field?: unknown } | null)?.field)
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.slice(0, 100));
  return { status: e.response.status, ...(typeof data?.code === "string" ? { code: data.code.slice(0, 100) } : {}), fields };
};

/** The log fields for a failed push: the learning server's status, code and refused fields when it answered. */
export const learningServerLogFields = (error: unknown): Record<string, unknown> => {
  const answer = learningServerAnswer(error);
  return answer ? { learnerserverstatus: answer.status, learnerservercode: answer.code, learnerserverfields: answer.fields } : {};
};

const SCHOOL_FIELDS = ["schoolid", "schoolname", "standard"];

/** The learning server's own words for why a roster push cannot be taken, mapped to what the admin is told. */
export type RosterRefusal = "school-or-class" | "curriculum";

/**
 * A roster push (learners or teachers) that the learning server refused with a 400 naming the school, a class (`standard`) or a
 * curriculum it does not hold yet. Only the field names are read. School and class win over the curriculum when both are named.
 */
export const rosterRefusalOf = (error: unknown): RosterRefusal | undefined => {
  const answer = learningServerAnswer(error);
  if (answer?.status !== 400) return undefined;
  if (answer.fields.some((f) => SCHOOL_FIELDS.includes(f))) return "school-or-class";
  if (answer.fields.includes("curriculumids")) return "curriculum";
  return undefined;
};

/** The learners' file of one school: `{ schoolid, studentusers }`, every row carrying its `schoolid`. */
export const studentsFile = (schoolid: string, studentusers: unknown[]) => ({ schoolid, studentusers });

/** The teachers' file of one school: `{ schoolid, teachers }`, every row carrying its `schoolid`. */
export const teachersFile = (schoolid: string, teachers: unknown[]) => ({ schoolid, teachers });
