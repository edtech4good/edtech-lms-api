import { col, fn, Op, Transaction, where as sqlWhere, WhereOptions } from "sequelize";
import { schools } from "src/models/data-models/school";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";

/**
 * Learners (`students`) and school logins (`schoolusers`) carry both the
 * school's NAME and its ID. Every writer stores them together, and stores the
 * school's OWN stored name, never the text it was given, so a row's name is
 * its school's name byte for byte. Writers resolve the school here, inside
 * their own transaction.
 *
 * ## When is a given name a school's name?
 *
 * Two names are the same when they are the same text after trimming
 * surrounding whitespace, Unicode NFC normalisation and lower-casing, applied
 * to the given AND the stored name (the same rule `email-address.ts` uses for
 * an email, written separately because a school name is not an email). A CSV
 * with a trailing space or different capitals therefore still finds its
 * school. A name that differs by a Khmer mark, an accent or anything else is a
 * different school.
 *
 * `schools.schoolname`'s own collation is NOT the judge. It ignores trailing
 * spaces and gives several Khmer marks (bantoc, nikahit, musikatoan) no
 * weight, so under it "សាលាគំរូ" and "សាលាគរូ" compare EQUAL. The database is
 * only used to narrow the candidates (`WHERE TRIM(schoolname) = ?`); the answer is
 * the candidate that passes the comparison above. More than one candidate
 * passing acts on none and fails.
 *
 * Soft-deleted schools resolve like any other: the id is identity, not
 * liveness. Whether a write into a deleted school is allowed is the caller's
 * existing rule, not this module's.
 *
 * ## Inside the writer's transaction, under a shared lock
 *
 * Every lookup ends in a shared lock on ONE school row, taken by primary key. A rename (which updates
 * the school and then every learner and login carrying its name) cannot
 * commit between "read the school" and "insert the learner": either the
 * insert waits for the rename and then reads the new name, or the rename waits
 * for the insert and its cascade then renames the new learner too.
 */
export const normaliseSchoolName = (name: string): string => name.trim().normalize("NFC").toLowerCase();

export const isSameSchoolName = (stored: unknown, given: unknown): boolean => {
  if (typeof stored !== "string" || typeof given !== "string") {
    return false;
  }
  const a = normaliseSchoolName(stored);
  return a.length > 0 && a === normaliseSchoolName(given);
};

export interface ResolvedSchool {
  schoolid: string;
  /** The school's own stored name: what the row must carry. */
  schoolname: string;
}

const columns = ["schoolid", "schoolname"];

/** A read with no lock (the by-name narrowing). */
const plainRead = (transaction?: Transaction) => ({ attributes: [...columns, "isdeleted"], transaction });

/** A read by primary key under a shared lock when there is a transaction. */
const lockedRead = (transaction?: Transaction) => ({
  attributes: columns,
  transaction,
  lock: transaction ? transaction.LOCK.SHARE : undefined,
});

const schoolRequired = () =>
  new ApiError(ErrorCode.INVALID_INPUT, "Choose a school.", {
    fields: [{ field: "schoolid", message: "Choose a school." }],
  });

const noSuchSchool = (field: string) =>
  new ApiError(ErrorCode.INVALID_INPUT, "That school doesn't exist.", {
    fields: [{ field, message: "That school doesn't exist." }],
  });

/**
 * The schools whose stored name is `schoolname` under the text rule above, live or
 * soft-deleted, read WITHOUT a lock.
 *
 * `TRIM(schoolname) = ?` narrows to the schools whose stored name equals the
 * given name once surrounding spaces are ignored on BOTH sides, so a school
 * whose stored name has stray spaces around it is still found. (MySQL's TRIM
 * removes spaces only; the comparison below is what decides.)
 *
 * The narrowing takes NO LOCK. A locking read on this predicate scans the
 * `schoolname` index and locks every entry it passes for the whole
 * transaction: that blocks the rename or create of an UNRELATED school until
 * this transaction ends, and it deadlocks with a rename of the chosen school
 * (the rename needs the index entry, the insert's foreign-key check needs the
 * school row). So the school is chosen unlocked and then locked BY PRIMARY
 * KEY, which locks one row.
 */
async function sameNameCandidates(schoolname: string, transaction?: Transaction, scopeWhere?: WhereOptions): Promise<schools[]> {
  const byName = sqlWhere(fn("TRIM", col("schoolname")), schoolname.trim().normalize("NFC"));
  const candidates = await schools.findAll({
    // `scopeWhere` (the callers in school-scope.ts pass the caller's organisation) is applied BEFORE the
    // "more than one school" decision, so a namesake in another organisation neither makes the name
    // ambiguous nor shows that it exists.
    where: scopeWhere ? { [Op.and]: [byName, scopeWhere] } : byName,
    ...plainRead(transaction),
  });
  return candidates.filter((s) => isSameSchoolName(s.schoolname, schoolname));
}

const ambiguousName = (field: string) =>
  new ApiError(ErrorCode.INVALID_INPUT, "That school name matches more than one school.", {
    fields: [{ field, message: "That school name matches more than one school." }],
  });

/** The school a given name refers to, or null. Throws if the name refers to more than one. */
export async function resolveSchoolByName(
  schoolname: string | null | undefined,
  transaction?: Transaction,
  field = "schoolname",
  scopeWhere?: WhereOptions,
): Promise<ResolvedSchool | null> {
  if (typeof schoolname !== "string" || schoolname.trim().length === 0) {
    return null;
  }
  const same = await sameNameCandidates(schoolname, transaction, scopeWhere);
  if (same.length > 1) {
    throw ambiguousName(field);
  }
  if (same.length === 0) {
    return null;
  }
  if (!transaction) {
    return { schoolid: same[0].schoolid, schoolname: same[0].schoolname };
  }
  // Lock the chosen school by primary key (shared) and decide again on the
  // LOCKED row, which is the committed current one: if the school was renamed
  // after the narrowing read, the given name no longer names it, and the answer
  // is "not found".
  const locked = await schools.findOne({
    where: { schoolid: same[0].schoolid },
    ...lockedRead(transaction),
  });
  if (!locked || !isSameSchoolName(locked.schoolname, schoolname)) {
    return null;
  }
  return { schoolid: locked.schoolid, schoolname: locked.schoolname };
}

/**
 * The school a given name refers to, for a READ (a report, a list, an export).
 *
 * This differs from `resolveSchoolByName` on purpose. A writer acts on the school
 * the caller named and must never guess ("the id is identity": a name that
 * matches two schools, one of them soft-deleted, is ambiguous and fails). A read
 * asks for what is there to look at, so when more than one school matches and
 * EXACTLY ONE of them is live, that live school is the answer; the soft-deleted
 * namesake stays reachable by its id. Two live matches are still ambiguous (400).
 * No lock: a read does not hold the school.
 */
export async function resolveSchoolByNameForRead(
  schoolname: string | null | undefined,
  field = "schoolname",
  scopeWhere?: WhereOptions,
): Promise<ResolvedSchool | null> {
  if (typeof schoolname !== "string" || schoolname.trim().length === 0) {
    return null;
  }
  let same = await sameNameCandidates(schoolname, undefined, scopeWhere);
  if (same.length > 1) {
    same = same.filter((s) => !s.isdeleted);
    if (same.length !== 1) {
      throw ambiguousName(field);
    }
  }
  return same.length === 1 ? { schoolid: same[0].schoolid, schoolname: same[0].schoolname } : null;
}

/** The school with this id (live or soft-deleted), or null. */
export async function resolveSchoolById(
  schoolid: string | null | undefined,
  transaction?: Transaction,
  scopeWhere?: WhereOptions,
): Promise<ResolvedSchool | null> {
  if (typeof schoolid !== "string" || schoolid.length === 0) {
    return null;
  }
  const school = await schools.findOne({
    where: scopeWhere ? { [Op.and]: [{ schoolid }, scopeWhere] } : { schoolid },
    ...lockedRead(transaction),
  });
  return school ? { schoolid: school.schoolid, schoolname: school.schoolname } : null;
}

/** Like `resolveSchoolByName`, but a name that matches no school fails the write (400 field error, name not echoed). */
export async function requireSchoolByName(
  schoolname: string | null | undefined,
  transaction?: Transaction,
  field = "schoolname",
): Promise<ResolvedSchool> {
  const school = await resolveSchoolByName(schoolname, transaction, field);
  if (!school) {
    throw noSuchSchool(field);
  }
  return school;
}

/**
 * Fills `schoolid` AND the school's own `schoolname` on rows about to be
 * inserted, inside the given transaction:
 *
 *  - a row with a `schoolid` gets the school read now, under the lock, so a
 *    name the caller read earlier (before a rename) is replaced by the current
 *    one; an id that matches no school fails the write;
 *  - a row with only a `schoolname` gets the school resolved from it, once per
 *    distinct name; a name that matches no school fails the whole write;
 *  - a row with neither fails the write (400, "Choose a school."): a learner and a
 *    login always belong to a school (`schoolid` is required), so nothing is
 *    inserted for a row that names none.
 */
export async function withSchoolIds<T extends { schoolid?: string | null; schoolname?: string | null }>(
  rows: T[],
  transaction?: Transaction,
): Promise<T[]> {
  const byId = new Map<string, ResolvedSchool>();
  const byName = new Map<string, ResolvedSchool>();
  const out: T[] = [];
  for (const row of rows) {
    let school: ResolvedSchool | undefined;
    if (row.schoolid) {
      school = byId.get(row.schoolid);
      if (!school) {
        const found = await resolveSchoolById(row.schoolid, transaction);
        if (!found) {
          throw noSuchSchool("schoolid");
        }
        school = found;
        byId.set(row.schoolid, school);
      }
    } else if (row.schoolname) {
      school = byName.get(row.schoolname);
      if (!school) {
        school = await requireSchoolByName(row.schoolname, transaction);
        byName.set(row.schoolname, school);
      }
    } else {
      throw schoolRequired();
    }
    out.push({ ...row, schoolid: school.schoolid, schoolname: school.schoolname });
  }
  return out;
}

/**
 * ## Reading: a school named at a route's boundary
 *
 * A route that is handed a school (a query parameter, a path segment, a body
 * field) resolves it to the school's ID once, here, and the business layer works
 * with the id. The id is the identity: two organisations can each have a school
 * of the same name, so nothing below the boundary may look a school up by name.
 *
 *  - A `schoolid` is checked to exist (live or soft-deleted: the id is identity,
 *    not liveness) and wins when both are given.
 *  - A `schoolname` is resolved with the same text rule the writers use (trim,
 *    NFC, lower-case on both sides; a Khmer mark or an accent still makes a
 *    different school; more than one school passing fails).
 *  - Neither given (undefined, null, empty or blank): no school filter, `undefined`.
 *  - What comes back is the school's id AND its own stored name (for file names).
 *  - An unknown id or name is a 404 ("That school doesn't exist."), never an
 *    empty result that looks like a school with no learners.
 */
export const schoolNotFound = () => new ApiError(ErrorCode.NOT_FOUND, "That school doesn't exist.");

const present = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export async function resolveSchoolRef(
  ref: { schoolid?: unknown; schoolname?: unknown },
  scopeWhere?: WhereOptions,
): Promise<ResolvedSchool | undefined> {
  if (present(ref.schoolid)) {
    const school = await resolveSchoolById(ref.schoolid.trim(), undefined, scopeWhere);
    if (!school) {
      throw schoolNotFound();
    }
    return school;
  }
  if (present(ref.schoolname)) {
    const school = await resolveSchoolByNameForRead(ref.schoolname, "schoolname", scopeWhere);
    if (!school) {
      throw schoolNotFound();
    }
    return school;
  }
  return undefined;
}

export interface SegmentOptions {
  /** Resolve a name for a read: one live school among several namesakes wins. Writers leave this off. */
  forRead?: boolean;
  /** Only the schools matching this are candidates (the caller's organisation: see school-scope.ts). */
  scopeWhere?: WhereOptions;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A path segment that used to be a school NAME (`/export/:schoolname/students`)
 * and may now also be a school ID. A segment shaped like a UUID that is a
 * school's id is that school; anything else is resolved as a name. (A school
 * whose NAME is a UUID that is some other school's id cannot be reached by name
 * here; use the id.) `null` when it names no school.
 */
export async function findSchoolSegment(segment: string, options: SegmentOptions = {}): Promise<ResolvedSchool | null> {
  const trimmed = (segment ?? "").trim();
  if (UUID.test(trimmed)) {
    const byId = await resolveSchoolById(trimmed, undefined, options.scopeWhere);
    if (byId) {
      return byId;
    }
  }
  return options.forRead
    ? resolveSchoolByNameForRead(trimmed, "schoolname", options.scopeWhere)
    : resolveSchoolByName(trimmed, undefined, "schoolname", options.scopeWhere);
}

/**
 * `findSchoolSegment`, but an unknown school is a 404. Returns the id and the school's own stored name (for file names).
 * A route that only READS passes `{ forRead: true }` (see `resolveSchoolByNameForRead`); a route that writes does not.
 */
export async function resolveSchoolSegment(segment: string, options: SegmentOptions = {}): Promise<ResolvedSchool> {
  const school = await findSchoolSegment(segment, options);
  if (!school) {
    throw schoolNotFound();
  }
  return school;
}
