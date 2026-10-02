import { col, fn, Transaction, where as sqlWhere } from "sequelize";
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
 * Every lookup takes a shared lock on the school row. A rename (which updates
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

const readOptions = (transaction?: Transaction) => ({
  attributes: ["schoolid", "schoolname"],
  transaction,
  lock: transaction ? transaction.LOCK.SHARE : undefined,
});

const noSuchSchool = (field: string) =>
  new ApiError(ErrorCode.INVALID_INPUT, "That school doesn't exist.", {
    fields: [{ field, message: "That school doesn't exist." }],
  });

/** The school a given name refers to, or null. Throws if the name refers to more than one. */
export async function resolveSchoolByName(
  schoolname: string | null | undefined,
  transaction?: Transaction,
  field = "schoolname",
): Promise<ResolvedSchool | null> {
  if (typeof schoolname !== "string" || schoolname.trim().length === 0) {
    return null;
  }
  // `TRIM(schoolname) = ?` narrows to the schools whose stored name equals the
  // given name once surrounding spaces are ignored on BOTH sides, so a school
  // whose stored name has stray spaces around it is still found. (MySQL's TRIM
  // removes spaces only; the comparison below is what decides.)
  const candidates = await schools.findAll({
    where: sqlWhere(fn("TRIM", col("schoolname")), schoolname.trim().normalize("NFC")),
    ...readOptions(transaction),
  });
  const same = candidates.filter((s) => isSameSchoolName(s.schoolname, schoolname));
  if (same.length > 1) {
    throw new ApiError(ErrorCode.INVALID_INPUT, "That school name matches more than one school.", {
      fields: [{ field, message: "That school name matches more than one school." }],
    });
  }
  return same.length === 1 ? { schoolid: same[0].schoolid, schoolname: same[0].schoolname } : null;
}

/** The school with this id (live or soft-deleted), or null. */
export async function resolveSchoolById(
  schoolid: string | null | undefined,
  transaction?: Transaction,
): Promise<ResolvedSchool | null> {
  if (typeof schoolid !== "string" || schoolid.length === 0) {
    return null;
  }
  const school = await schools.findOne({ where: { schoolid }, ...readOptions(transaction) });
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
 *  - a row with neither is left alone (the columns are nullable).
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
      out.push(row);
      continue;
    }
    out.push({ ...row, schoolid: school.schoolid, schoolname: school.schoolname });
  }
  return out;
}
