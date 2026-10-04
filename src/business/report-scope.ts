import { Op } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { countries } from "src/models/data-models/countries";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { IMultiFilter } from "src/models/IPaging";
import { ownedIds } from "./content-scope";
import { scopeOf } from "./org-scope";
import { andInOwnedSchools, andLinkedCountries } from "./school-scope";

/**
 * Confining the reports to the caller's organisation.
 *
 * A report names the things it is about in the request's `filter` list: a school (by id or by name), a class
 * (`standard`), a learner (`studentid`), a curriculum, a grade, a level, a lesson and a country. For an
 * organisation caller (an organisation's staff, or a platform user acting as one) every such reference is read
 * within the caller's scope, and a reference that is not in it is treated exactly as one that is not there:
 *
 *  - a school (by id or name) that is not the caller's is the 404 an unknown school gets (school-scope.ts);
 *  - on the reports this server answers, any other reference that is not in scope is replaced by an id that
 *    names no row (`NO_SUCH_ID`), so the report runs the path it runs for an id that is not there;
 *  - on the reports answered by the student API (`ReportProxy`), a reference that is not in scope gets the empty
 *    answer a report with no rows gets, and nothing is sent.
 *
 * A platform user who is not acting as an organisation is not limited: the filters and the request are left
 * exactly as they are.
 */

/** An id that names no row of any table. */
export const NO_SUCH_ID = "00000000-0000-0000-0000-000000000000";

/** The filter keys that name a row of one table, and are read within the caller's scope. */
export type ReferenceKey = "studentid" | "standard" | "curriculumid" | "gradeid" | "levelid" | "lessonid" | "countryid";
export const REFERENCE_KEYS: ReadonlySet<string> = new Set<ReferenceKey>([
  "studentid",
  "standard",
  "curriculumid",
  "gradeid",
  "levelid",
  "lessonid",
  "countryid",
]);

/**
 * Which of these ids, of the kind the filter key names, are in the caller's scope: one read per key, however many ids
 * the request names. (Only asked of an organisation caller.) Ids are compared as the database compares them, so
 * letter case does not matter.
 */
export const idsInScope = async (org: OrgContext, key: ReferenceKey, ids: string[]): Promise<Set<string>> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Set();
  }
  let found: string[];
  switch (key) {
    case "studentid":
      found = (await students.findAll({ attributes: ["studentid"], where: await andInOwnedSchools({ studentid: { [Op.in]: unique } }, org) })).map((r) => r.studentid);
      break;
    case "standard":
      found = (await standards.findAll({ attributes: ["standardid"], where: await andInOwnedSchools({ standardid: { [Op.in]: unique } }, org) })).map((r) => r.standardid);
      break;
    case "countryid":
      found = (await countries.findAll({ attributes: ["countryid"], where: await andLinkedCountries({ countryid: { [Op.in]: unique } }, org) })).map((r) => r.countryid);
      break;
    default:
      // the rows of a content kind in scope are read once per request (content-scope.ts)
      found = (await ownedIds(org, KIND_OF[key])) ?? unique;
  }
  const have = new Set(found.map((id) => id.toLowerCase()));
  return new Set(unique.filter((id) => have.has(id.toLowerCase())));
};
const KIND_OF = { curriculumid: "curriculum", gradeid: "grade", levelid: "level", lessonid: "lesson" } as const;

/** The ids a filter's value names: a string, or a list of strings; `undefined` for a value that is neither. */
export const idsOf = (value: unknown): string[] | undefined => {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  return undefined;
};

/**
 * For the reports this server answers: the request's filters with every reference that is not in the caller's scope
 * replaced by `NO_SUCH_ID`. Unchanged for the platform (not acting) and when there is no caller context (the
 * unscoped readers).
 */
export const confineFilters = async (
  org: OrgContext | undefined,
  filters: IMultiFilter[] | undefined,
): Promise<IMultiFilter[] | undefined> => {
  if (org === undefined || scopeOf(org).kind === "platform" || !Array.isArray(filters)) {
    return filters;
  }
  const confined: IMultiFilter[] = [];
  for (const filter of filters) {
    if (!filter || typeof filter !== "object" || !REFERENCE_KEYS.has(filter.key) || !filter.value) {
      confined.push(filter);
      continue;
    }
    const ids = idsOf(filter.value);
    const inside = await idsInScope(org, filter.key as ReferenceKey, ids ?? []);
    const checked = (ids ?? [NO_SUCH_ID]).map((id) => (inside.has(id) ? id : NO_SUCH_ID));
    confined.push({ ...filter, value: typeof filter.value === "string" ? checked[0] : checked });
  }
  return confined;
};
