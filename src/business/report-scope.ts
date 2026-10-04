import { OrgContext } from "src/decorators/org.decorator";
import { countries } from "src/models/data-models/countries";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { IMultiFilter } from "src/models/IPaging";
import { inScope } from "./content-scope";
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

/** Is this one id, of the kind the filter key names, in the caller's scope? (Only asked of an organisation caller.) */
export const referenceInScope = async (org: OrgContext, key: ReferenceKey, id: string): Promise<boolean> => {
  switch (key) {
    case "studentid":
      return (await students.count({ where: await andInOwnedSchools({ studentid: id }, org) })) > 0;
    case "standard":
      return (await standards.count({ where: await andInOwnedSchools({ standardid: id }, org) })) > 0;
    case "curriculumid":
      return inScope(org, "curriculum", id);
    case "gradeid":
      return inScope(org, "grade", id);
    case "levelid":
      return inScope(org, "level", id);
    case "lessonid":
      return inScope(org, "lesson", id);
    case "countryid":
      return (await countries.count({ where: await andLinkedCountries({ countryid: id }, org) })) > 0;
  }
};

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
    const checked: string[] = [];
    for (const id of ids ?? [NO_SUCH_ID]) {
      checked.push((await referenceInScope(org, filter.key as ReferenceKey, id)) ? id : NO_SUCH_ID);
    }
    confined.push({ ...filter, value: typeof filter.value === "string" ? checked[0] : checked });
  }
  return confined;
};
