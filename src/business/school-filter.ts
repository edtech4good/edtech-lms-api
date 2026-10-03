import { Op } from "sequelize";
import { schools } from "src/models/data-models/school";
import { resolveSchoolRef } from "./school-identity";

/**
 * School filters in a list request's `filter` array.
 *
 * The admin lists (learners, teachers, feedback) let the user search by school
 * NAME: `{ key: "schoolname", value: "..." }`, a partial, case-insensitive text
 * match against the stored name copy. A learner or login belongs to its school
 * by ID, so the search is carried out on the SCHOOLS (which schools' names match
 * the text), and the rows are then limited to those schools' ids. The request
 * means exactly what it meant, and nothing here ties a learner to a school by
 * name. `{ key: "schoolid", value: "<id>" }` is also accepted (exact; an unknown
 * id is a 404).
 *
 * Several comma-separated terms must all match the one school's name (as the
 * old per-column filter required of the learner's `schoolname`).
 */
export interface SchoolFilterEntry {
  key?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
}

export interface SplitFilters<T> {
  /** The filters that are not about a school, untouched. */
  rest: T[];
  /** The school ids the rows must belong to; `undefined` when no school filter was sent. `[]` matches nothing. */
  schoolids?: string[];
}

export async function extractSchoolFilters<T extends SchoolFilterEntry>(filters: T[] | undefined): Promise<SplitFilters<T>> {
  const rest: T[] = [];
  let schoolids: string[] | undefined;
  const narrow = (ids: string[]) => {
    schoolids = schoolids === undefined ? ids : schoolids.filter((id) => ids.includes(id));
  };
  for (const filter of filters ?? []) {
    if (filter.key === "schoolname" && filter.value) {
      const terms = (Array.isArray(filter.value) ? filter.value : String(filter.value).split(","))
        .map((t: unknown) => String(t).trim())
        .filter((t: string) => t.length > 0);
      if (terms.length === 0) {
        continue;
      }
      const matching = await schools.findAll({
        attributes: ["schoolid"],
        where: { [Op.and]: terms.map((term: string) => ({ schoolname: { [Op.like]: `%${term}%` } })) },
      });
      narrow(matching.map((s) => s.schoolid));
    } else if (filter.key === "schoolid" && filter.value) {
      const school = await resolveSchoolRef({ schoolid: Array.isArray(filter.value) ? filter.value[0] : filter.value });
      narrow(school ? [school.schoolid] : []);
    } else {
      rest.push(filter);
    }
  }
  return { rest, schoolids };
}

/** The `where` fragment limiting a table with a `schoolid` column to the filtered schools (nothing added when none was sent). */
export const schoolIdsWhere = (schoolids: string[] | undefined) =>
  schoolids === undefined ? {} : { schoolid: { [Op.in]: schoolids } };

/**
 * The one school an EXACT school filter names: `{ key: "schoolid" }` (an id) or
 * `{ key: "schoolname" }` (a name, as the admin UI sends it), resolved with
 * `resolveSchoolRef` (unknown: 404). `undefined` when neither is present. Used by
 * the report and feedback filters, which compare equal, not "contains".
 */
export async function resolveSchoolFromFilters(filters: SchoolFilterEntry[] | undefined) {
  const name = (filters ?? []).find((f) => f.key === "schoolname" && f.value);
  const id = (filters ?? []).find((f) => f.key === "schoolid" && f.value);
  return resolveSchoolRef({
    schoolid: id ? String(Array.isArray(id.value) ? id.value[0] : id.value) : undefined,
    schoolname: name ? String(Array.isArray(name.value) ? name.value[0] : name.value) : undefined,
  });
}
