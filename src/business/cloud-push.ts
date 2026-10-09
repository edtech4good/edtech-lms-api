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
 * Sends one file to the student API's import route, as a zip holding `entry`, with the server key. The request names the
 * organisation it is for (`X-Organisation-Id`) when there is one: a content push always has one, a push of a school's
 * learners or teachers has the school's.
 */
export const pushToCloud = async (kind: CloudImport, entry: string, json: string, organisationid?: string | null) => {
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

/** The learners' file of one school: `{ schoolid, studentusers }`, every row carrying its `schoolid`. */
export const studentsFile = (schoolid: string, studentusers: unknown[]) => ({ schoolid, studentusers });

/** The teachers' file of one school: `{ schoolid, teachers }`, every row carrying its `schoolid`. */
export const teachersFile = (schoolid: string, teachers: unknown[]) => ({ schoolid, teachers });
