import { Model, ModelStatic, Op, Transaction, WhereOptions } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { organisationcountry } from "src/models/data-models/organisationcountry";
import { schools } from "src/models/data-models/school";
import { schoolcontributedata } from "src/models/data-models/schoolcontributedata";
import { schoolusers } from "src/models/data-models/schoolusers";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { ownedWhere, scopeOf } from "./org-scope";
import {
  ResolvedSchool,
  resolveSchoolById,
  resolveSchoolByName,
  resolveSchoolRef,
  resolveSchoolSegment,
  schoolNotFound,
  SegmentOptions,
} from "./school-identity";

/**
 * Confining schools and the people and records that hang off a school to the
 * caller's organisation.
 *
 * A school belongs to an organisation (`schools.organisationid`); its learners
 * (`students.schoolid`), logins (`schoolusers.schoolid`), classes
 * (`standards.schoolid`) and Fees Collection rows (`schoolcontributedata.schoolid`)
 * belong to the organisation of their school. A row is IN SCOPE for an
 * organisation caller when its school's organisation is the caller's. A school
 * with no organisation, and a row with no school, are in scope for the platform
 * (not acting as an organisation) only.
 *
 * Every lookup here takes the caller's `OrgContext` as a required argument (the
 * unscoped lookups in school-identity.ts stay for the routes that are not yet
 * scoped). A row that does not exist, belongs to another organisation, or has no
 * organisation is reported by the SAME 404 with the SAME message, so a
 * response never shows whether it exists. A school given by NAME is looked up
 * among the caller's schools only, before the "more than one school" decision, so
 * a namesake in another organisation neither makes the name ambiguous nor shows
 * that it exists.
 */

/**
 * "That school doesn't exist." (404), naming the request field it was given in when there is one, so a
 * form or a file with several rows can show which. The same for a school that is not there and one that is
 * not the caller's.
 */
const schoolNotFoundAt = (field?: string) =>
  field === undefined
    ? schoolNotFound()
    : new ApiError(ErrorCode.NOT_FOUND, "That school doesn't exist.", {
        fields: [{ field, message: "That school doesn't exist." }],
      });

const notFound = (what: string) => new ApiError(ErrorCode.NOT_FOUND, `That ${what} doesn't exist.`);
export const studentNotFound = () => notFound("student");
export const teacherNotFound = () => notFound("teacher");
export const standardNotFound = () => notFound("standard");
export const feesNotFound = () => notFound("school contribution");

/**
 * The caller's limit on the `schools` table as a where-fragment, or `undefined` for the platform (not
 * limited: the query is then exactly what it was before scoping).
 */
export const schoolScope = (org: OrgContext): WhereOptions | undefined => {
  const owned = ownedWhere(org); // throws first when there is no scope
  return scopeOf(org).kind === "platform" ? undefined : owned;
};

/** `where` AND the caller's limit on `schools`; for the platform, `where` itself. */
export const andSchoolScope = (where: WhereOptions, org: OrgContext): WhereOptions => {
  const limit = schoolScope(org);
  return limit ? { [Op.and]: [where, limit] } : where;
};

// The ids are read once per caller context: a request's `@Org()` value is built for that request, so the memo lives
// as long as the request does (a context object is never shared between requests). A failed read is not kept.
const idsByContext = new WeakMap<object, Promise<string[]>>();

/** The ids of the schools in scope, or `undefined` for the platform (every school, owned or not). */
export const ownedSchoolIds = async (org: OrgContext, transaction?: Transaction): Promise<string[] | undefined> => {
  const scope = scopeOf(org);
  if (scope.kind === "platform") {
    return undefined;
  }
  let ids = idsByContext.get(org);
  if (!ids) {
    ids = schools
      .findAll({ attributes: ["schoolid"], where: { organisationid: scope.organisationid }, transaction })
      .then((rows) => rows.map((s) => s.schoolid));
    idsByContext.set(org, ids);
    ids.catch(() => idsByContext.delete(org));
  }
  return ids;
};

/** A where-fragment limiting a table with a `schoolid` column to the schools in scope (nothing added for the platform). */
export const inOwnedSchools = async (org: OrgContext, transaction?: Transaction): Promise<WhereOptions> => {
  const ids = await ownedSchoolIds(org, transaction);
  return ids === undefined ? {} : { schoolid: { [Op.in]: ids } };
};

/** `where` AND the schools in scope. */
export const andInOwnedSchools = async (
  where: WhereOptions | undefined,
  org: OrgContext,
  transaction?: Transaction,
): Promise<WhereOptions> => {
  const ids = await ownedSchoolIds(org, transaction);
  return ids === undefined ? (where ?? {}) : { [Op.and]: [where ?? {}, { schoolid: { [Op.in]: ids } }] };
};

/** Is this school in scope? (Inside the caller's transaction when there is one.) */
export const schoolInScope = async (org: OrgContext, schoolid: unknown, transaction?: Transaction): Promise<boolean> => {
  const owned = ownedWhere(org); // throws first when there is no scope
  if (typeof schoolid !== "string" || schoolid.length === 0) {
    return false;
  }
  return (await schools.count({ where: { [Op.and]: [{ schoolid }, owned] }, transaction })) > 0;
};

export interface FindSchoolOptions {
  /** Soft-deleted schools are found too (the id is identity, not liveness). */
  includeDeleted?: boolean;
  /** The request field the school came from: named in the 404. */
  field?: string;
  transaction?: Transaction;
  lock?: Transaction["LOCK"][keyof Transaction["LOCK"]];
}

/** One school by id, in scope; absent, deleted (unless asked for) or not the caller's: 404. */
export const findOwnedSchool = async (org: OrgContext, schoolid: unknown, options: FindSchoolOptions = {}): Promise<schools> => {
  scopeOf(org); // throws first when there is no scope
  if (typeof schoolid !== "string" || schoolid.length === 0) {
    throw schoolNotFoundAt(options.field);
  }
  const row = await schools.findOne({
    where: andSchoolScope(options.includeDeleted ? { schoolid } : { schoolid, isdeleted: false }, org),
    transaction: options.transaction,
    lock: options.lock,
  });
  if (!row) {
    throw schoolNotFoundAt(options.field);
  }
  return row;
};

/** A school (live or deleted) by id, in scope, as the id and the school's own stored name; else 404. */
export const requireOwnedSchoolById = async (org: OrgContext, schoolid: unknown, transaction?: Transaction, field?: string): Promise<ResolvedSchool> => {
  const found = await resolveSchoolById(typeof schoolid === "string" ? schoolid : null, transaction, schoolScope(org));
  if (!found) {
    throw schoolNotFoundAt(field);
  }
  return found;
};

/** For a write: a school by NAME among the caller's schools; none: 404 (more than one of the caller's: 400, as for any writer). */
export const requireOwnedSchoolByName = async (
  org: OrgContext,
  schoolname: unknown,
  transaction?: Transaction,
  field = "schoolname",
): Promise<ResolvedSchool> => {
  const found = await resolveSchoolByName(typeof schoolname === "string" ? schoolname : null, transaction, field, schoolScope(org));
  if (!found) {
    throw schoolNotFoundAt(field);
  }
  return found;
};

/** A school named by `schoolid` or `schoolname` in a request (neither: `undefined`); unknown or not the caller's: 404. */
export const resolveOwnedSchoolRef = (org: OrgContext, ref: { schoolid?: unknown; schoolname?: unknown }) =>
  resolveSchoolRef(ref, schoolScope(org));

/** A path segment that is a school's NAME or id, among the caller's schools; else 404. */
export const resolveOwnedSchoolSegment = (org: OrgContext, segment: string, options: Omit<SegmentOptions, "scopeWhere"> = {}) =>
  resolveSchoolSegment(segment, { ...options, scopeWhere: schoolScope(org) });

const findOwnedChild = async <M extends Model>(
  model: ModelStatic<M>,
  org: OrgContext,
  where: WhereOptions,
  absent: () => Error,
  transaction?: Transaction,
): Promise<M> => {
  const row = await model.findOne({ where: await andInOwnedSchools(where, org, transaction), transaction });
  if (!row) {
    throw absent();
  }
  return row;
};

/** A learner by `studentid` (or any `where` that names one), in scope (live or soft-deleted, as the routes read them); else 404. */
export const findOwnedStudent = (org: OrgContext, where: WhereOptions, transaction?: Transaction) =>
  findOwnedChild(students, org, where, studentNotFound, transaction);

/** A teacher login by `schooluserid`, in scope; else 404. */
export const findOwnedTeacher = (org: OrgContext, schooluserid: unknown, transaction?: Transaction) =>
  findOwnedChild(
    schoolusers,
    org,
    { schooluserid: typeof schooluserid === "string" ? schooluserid : null, schooluserrole: SchoolRole.TEACHER },
    teacherNotFound,
    transaction,
  );

/** A class by id (live), in scope (and, when `schoolid` is given, in that school); else 404. */
export const findOwnedStandard = (org: OrgContext, standardid: unknown, transaction?: Transaction, schoolid?: string) =>
  findOwnedChild(
    standards,
    org,
    { standardid: typeof standardid === "string" ? standardid : null, isdeleted: false, ...(schoolid === undefined ? {} : { schoolid }) },
    standardNotFound,
    transaction,
  );

/** A Fees Collection row by id (live), in scope; else 404. */
export const findOwnedFeesRow = (org: OrgContext, schoolcontributeid: unknown, transaction?: Transaction) =>
  findOwnedChild(
    schoolcontributedata,
    org,
    { schoolcontributeid: typeof schoolcontributeid === "string" ? schoolcontributeid : null, isdeleted: false },
    feesNotFound,
    transaction,
  );

/**
 * The organisation context of a school-user (teacher) token: the organisation that owns the school of the token's
 * `schoolusers` row (the row decides, not the school name the token carries), as a context for an organisation's
 * user. `null` when the login is unknown, deleted or disabled, has no school, or its school is deleted or belongs to
 * no organisation: such a caller is in scope of no organisation, and a list for it is empty.
 */
export const schoolUserOrgContext = async (user: { schooluserid?: unknown }): Promise<OrgContext | null> => {
  if (typeof user.schooluserid !== "string" || user.schooluserid.length === 0) {
    return null;
  }
  const login = await schoolusers.findOne({
    attributes: ["schoolid"],
    where: { schooluserid: user.schooluserid, isdeleted: false, isdisabled: false },
  });
  if (!login?.schoolid) {
    return null;
  }
  const school = await schools.findOne({ attributes: ["organisationid"], where: { schoolid: login.schoolid, isdeleted: false } });
  return school?.organisationid ? { organisationid: school.organisationid, isplatform: false, permissions: [] } : null;
};

/**
 * A where-fragment limiting `countries` to the countries the caller's
 * organisation is linked to (`organisationcountry`); nothing added for the
 * platform.
 */
export const linkedCountriesWhere = async (org: OrgContext): Promise<WhereOptions> => {
  const scope = scopeOf(org);
  if (scope.kind === "platform") {
    return {};
  }
  const links = await organisationcountry.findAll({
    attributes: ["countryid"],
    where: { organisationid: scope.organisationid },
  });
  return { countryid: { [Op.in]: links.map((l) => l.countryid) } };
};

/** `where` AND the countries the caller's organisation is linked to; for the platform, `where` itself. */
export const andLinkedCountries = async (where: WhereOptions, org: OrgContext): Promise<WhereOptions> => {
  const linked = await linkedCountriesWhere(org);
  return Object.keys(linked).length === 0 ? where : { [Op.and]: [where, linked] };
};
