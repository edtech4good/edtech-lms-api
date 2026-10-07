import AdmZip from "adm-zip";
import axios from "axios";
import FormData from "form-data";
import { Config } from "src/config";

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
  const response = await axios.put(`${Config.fortyk.api.rpi.cloud}/import/${kind}`, file, {
    headers: {
      Authorization: Config.fortyk.api.serversynckey,
      ...(organisationid ? { [ORGANISATION_HEADER]: organisationid } : {}),
      ...file.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  if (response.status === 200) {
    return { error: false, data: true };
  }
  throw Error(response.data);
};

/** The learners' file of one school: `{ schoolid, studentusers }`, every row carrying its `schoolid`. */
export const studentsFile = (schoolid: string, studentusers: unknown[]) => ({ schoolid, studentusers });

/** The teachers' file of one school: `{ schoolid, teachers }`, every row carrying its `schoolid`. */
export const teachersFile = (schoolid: string, teachers: unknown[]) => ({ schoolid, teachers });
