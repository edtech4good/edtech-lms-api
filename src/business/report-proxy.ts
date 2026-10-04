import axios from "axios";
import { Config } from "src/config";
import { OrgContext } from "src/decorators/org.decorator";
import { IMultiFilter, IMultiPaging } from "src/models/IPaging";
import { scopeOf } from "./org-scope";
import { idsOf, REFERENCE_KEYS, ReferenceKey, referenceInScope } from "./report-scope";
import { schoolNotFound } from "./school-identity";
import { ownedSchoolIds, resolveOwnedSchoolRef } from "./school-scope";

/**
 * What the student API's report routes take in their `filter` list, as read from its report business: only the
 * status and the last-completed-quiz reports take a school (`schoolid`, and for the status report `schoolname`; a
 * list of ids is read as "one of these"); every other report names a learner (`studentid`) or a class
 * (`standard`), and without either answers for one fixed test learner.
 */
export interface OnlineReport {
  /** The route on the student API. */
  path: string;
  /** The answer is the list screen's (`data.data`, `total`, `pageindex`, `pagesize`) or the download's rows (`data`). */
  shape: "list" | "download";
  /** Does the report take a school filter? */
  school: boolean;
  /** What the list answer's `student` is when there is nothing to show: omitted, or null. */
  student?: "null";
}

export const ONLINE_REPORTS = {
  studentprogress: { path: "studentprogress", shape: "list", school: false },
  studentprogressDownload: { path: "studentprogress/download", shape: "download", school: false },
  classprogress: { path: "studentprogress/class", shape: "list", school: false },
  classprogressDownload: { path: "studentprogress/class/download", shape: "download", school: false },
  lastcompletedquiz: { path: "studentlastcompletedquiz", shape: "list", school: true },
  lastcompletedquizDownload: { path: "studentlastcompletedquiz/download", shape: "download", school: true },
  levelquiz: { path: "studentlevelquiz", shape: "list", school: false },
  levelquizDownload: { path: "studentlevelquiz/download", shape: "download", school: false },
  classlevelquiz: { path: "studentlevelquiz/class", shape: "list", school: false },
  classlevelquizDownload: { path: "studentlevelquiz/class/download", shape: "download", school: false },
  studentstatus: { path: "studentstatus", shape: "list", school: true },
  studentstatusDownload: { path: "studentstatus/download", shape: "download", school: true },
  gradeprogress: { path: "student-grade-progress", shape: "list", school: false },
  levelprogress: { path: "student-level-progress", shape: "list", school: false, student: "null" },
  lessonprogress: { path: "student-lesson-progress", shape: "list", school: false, student: "null" },
} as const satisfies Record<string, OnlineReport>;
export type OnlineReportName = keyof typeof ONLINE_REPORTS;

/**
 * Every school a filter entry names, within the caller's schools. A school that is not the caller's, and a value
 * that is not text, is the 404 an unknown school gets; a blank text names no school (as everywhere else).
 */
const schoolsNamedBy = async (org: OrgContext, key: "schoolid" | "schoolname", value: unknown): Promise<string[]> => {
  const ids: string[] = [];
  for (const one of Array.isArray(value) ? value : [value]) {
    if (typeof one !== "string" && typeof one !== "number") {
      throw schoolNotFound();
    }
    const school = await resolveOwnedSchoolRef(org, { [key]: String(one) });
    if (school !== undefined) {
      ids.push(school.schoolid);
    }
  }
  return ids;
};

/**
 * The body to send to the student API for an organisation caller, or `undefined` when the answer is the empty one and
 * nothing is to be sent.
 *
 * The student API does not know organisations, so the confinement is made here, in the body:
 *  - every school the body names (by id or by name, under either key, in any entry) must be the caller's (else the
 *    404 of an unknown school); the entries are replaced by ONE `schoolid` entry holding the schools named by all of
 *    them (a name is sent as its school's id: another organisation may have a school of the same name), and where the
 *    report takes no school filter they are dropped;
 *  - a report that takes a school filter and names none is sent the caller's own schools;
 *  - every learner, class, curriculum, grade, level, lesson and country the body names (in any entry) must be in
 *    scope, else the answer is the empty one;
 *  - a report that takes no school filter must name a learner or a class, else it would answer for the fixed test
 *    learner, who is not the caller's: the answer is the empty one.
 */
export const confineOnlineBody = async (
  org: OrgContext,
  report: OnlineReport,
  body: IMultiPaging | undefined,
): Promise<IMultiPaging | undefined> => {
  const given = Array.isArray(body?.filter) ? body!.filter! : [];
  const entries = given.filter((f) => f && typeof f === "object" && typeof f.key === "string");

  // schools first: a school that is not the caller's is the same 404 whatever else the body names
  let named: string[] | undefined;
  for (const entry of entries) {
    if ((entry.key === "schoolid" || entry.key === "schoolname") && entry.value) {
      const ids = await schoolsNamedBy(org, entry.key, entry.value);
      if (ids.length > 0) {
        named = named === undefined ? ids : named.filter((id) => ids.includes(id));
      }
    }
  }

  const kept: IMultiFilter[] = [];
  let names = false; // a learner or a class
  for (const entry of entries) {
    if (entry.key === "schoolid" || entry.key === "schoolname") {
      continue;
    }
    if (REFERENCE_KEYS.has(entry.key) && entry.value) {
      const ids = idsOf(entry.value);
      if (ids === undefined) {
        return undefined;
      }
      for (const id of ids) {
        if (!(await referenceInScope(org, entry.key as ReferenceKey, id))) {
          return undefined;
        }
      }
      names = names || entry.key === "studentid" || entry.key === "standard";
    }
    kept.push(entry);
  }

  if (report.school) {
    const schoolids = named ?? (await ownedSchoolIds(org)) ?? [];
    if (schoolids.length === 0) {
      return undefined;
    }
    // one school the caller named is sent as the id; the caller's own schools, or several named, as the list
    kept.push({ key: "schoolid", value: named !== undefined && schoolids.length === 1 ? schoolids[0] : schoolids });
  } else if (!names) {
    return undefined;
  }
  return { ...(body ?? {}), filter: kept };
};

/** The student API's answer for a report with no rows (what `ReportProxy.post` hands back when nothing is to be sent). */
const emptyAnswer = (report: OnlineReport, body: IMultiPaging | undefined) => ({
  data: {
    error: false,
    data:
      report.shape === "download"
        ? []
        : {
            data: [],
            ...(report.student === "null" ? { student: null } : {}),
            total: 0,
            pageindex: body?.pageindex || 0,
            pagesize: body?.pagesize || 0,
          },
  },
});

/**
 * The reports the student API answers, asked for on the caller's behalf. For the platform (not acting as an
 * organisation) the request is sent as it came. For an organisation caller it is confined first (see
 * `confineOnlineBody`), nothing is sent when the answer is the empty one, and the request carries the acting
 * organisation's id (`X-Organisation-Id`). The student API's own answer, and its errors, are handed back as they are.
 */
export class ReportProxy {
  constructor(private readonly org: OrgContext) {}

  async post(name: OnlineReportName, body: IMultiPaging) {
    const report: OnlineReport = ONLINE_REPORTS[name];
    const scope = scopeOf(this.org); // throws first when there is no scope
    let send: IMultiPaging | undefined = body;
    if (scope.kind === "organisation") {
      send = await confineOnlineBody(this.org, report, body);
      if (send === undefined) {
        return emptyAnswer(report, body);
      }
    }
    return axios.post(`${Config.fortyk.api.rpi.cloud}/report/${report.path}`, send, {
      headers: {
        Authorization: Config.fortyk.api.serversynckey,
        ...(scope.kind === "organisation" ? { "X-Organisation-Id": scope.organisationid } : {}),
      },
    });
  }
}
