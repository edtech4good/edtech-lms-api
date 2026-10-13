import { Op, WhereOptions } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { curriculums } from "src/models/data-models/curriculums";
import { grades } from "src/models/data-models/grades";
import { schools } from "src/models/data-models/school";
import { scopeWhere, ContentKind } from "./content-scope";

/**
 * The owning organisation on the rows of a list.
 *
 * Six tables carry `organisationid` themselves; every other row takes its owner from a parent (content-owner.ts
 * resolves one row at a time). The admin's platform view (no organisation chosen) lists every organisation's rows
 * and shows the owner on each, so a list of such rows names it in the row: one query per page for the parents, never
 * one per row. A row whose parent has no owner is reported with `null`.
 *
 * A list can also be narrowed to one organisation with `{ key: "organisationid", value: <id> }` in its filter. That is a
 * filter like any other: for an organisation caller the list is already confined to its own rows, so the filter can only
 * narrow it further (a different organisation's id leaves nothing), never widen it.
 */
export type OwnerById = Map<string, string | null>;

const distinct = (ids: Array<string | null | undefined>): string[] => [...new Set(ids.filter((i): i is string => typeof i === "string" && i.length > 0))];

/** The owner of each curriculum named. */
export const ownersOfCurricula = async (ids: Array<string | null | undefined>): Promise<OwnerById> => {
  const wanted = distinct(ids);
  const rows = wanted.length === 0 ? [] : await curriculums.findAll({ attributes: ["curriculumid", "organisationid"], where: { curriculumid: { [Op.in]: wanted } } });
  return new Map(rows.map((r) => [r.curriculumid, r.organisationid ?? null]));
};

/** The owner of each grade named (its curriculum's). */
export const ownersOfGrades = async (ids: Array<string | null | undefined>): Promise<OwnerById> => {
  const wanted = distinct(ids);
  const rows = wanted.length === 0 ? [] : await grades.findAll({ attributes: ["gradeid", "curriculumid"], where: { gradeid: { [Op.in]: wanted } } });
  const byCurriculum = await ownersOfCurricula(rows.map((r) => r.curriculumid));
  return new Map(rows.map((r) => [r.gradeid, byCurriculum.get(r.curriculumid) ?? null]));
};

/** The owner of each school named (its organisation). */
export const ownersOfSchools = async (ids: Array<string | null | undefined>): Promise<OwnerById> => {
  const wanted = distinct(ids);
  const rows = wanted.length === 0 ? [] : await schools.findAll({ attributes: ["schoolid", "organisationid"], where: { schoolid: { [Op.in]: wanted } } });
  return new Map(rows.map((r) => [r.schoolid, r.organisationid ?? null]));
};

/** The organisation a list was asked to narrow to, and the filter without it. */
export interface OrganisationFilter<T> {
  organisationid: string | undefined;
  rest: T[];
}

export const ORGANISATION_FILTER_KEY = "organisationid";

export const extractOrganisationFilter = <T extends { key?: string; value?: unknown }>(filter: T[] | undefined): OrganisationFilter<T> => {
  const rest: T[] = [];
  let organisationid: string | undefined;
  for (const f of filter ?? []) {
    if (f.key === ORGANISATION_FILTER_KEY) {
      const raw = Array.isArray(f.value) ? f.value[0] : f.value;
      if (typeof raw === "string" && raw.trim().length > 0) {
        organisationid = raw.trim();
      }
    } else {
      rest.push(f);
    }
  }
  return { organisationid, rest };
};

/**
 * The rows of `kind` owned by `organisationid`, as a where-fragment: on the owner column or through the parents, exactly
 * as a caller acting in that organisation would be limited. Nothing is added when no organisation was asked for.
 */
export const organisationFilterWhere = async (kind: ContentKind, organisationid: string | undefined): Promise<WhereOptions> =>
  organisationid === undefined ? {} : scopeWhere(asOrganisation(organisationid), kind);

/** A context standing for "this organisation" only to build a fragment; it never reaches a handler. */
export const asOrganisation = (organisationid: string): OrgContext => ({ organisationid, isplatform: false, permissions: [] });

/** For a table whose rows carry `organisationid` themselves and are not content kinds (schools, staff accounts). */
export const andOwnerColumn = (where: WhereOptions, organisationid: string | undefined): WhereOptions =>
  organisationid === undefined ? where : { [Op.and]: [where, { organisationid }] };

/** `where` AND the rows of `organisationid` (a no-op when none was asked for). */
export const andOrganisation = async (where: WhereOptions | undefined, kind: ContentKind, organisationid: string | undefined): Promise<WhereOptions> =>
  organisationid === undefined ? (where ?? {}) : { [Op.and]: [where ?? {}, await organisationFilterWhere(kind, organisationid)] };
