import type { Transaction } from "sequelize";
import { schools } from "src/models/data-models/school";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";

/**
 * Learners (`students`) and school logins (`schoolusers`) carry both the
 * school's NAME and its ID. Every writer that is handed only a name resolves
 * the id here, inside its own transaction, so the two always describe the same
 * school.
 *
 * ## Exact text, not "equal under the collation"
 *
 * `schools.schoolname` uses a case-insensitive collation that ignores trailing
 * spaces and gives several Khmer marks (bantoc, nikahit, musikatoan) no weight.
 * Under it "សាលាគំរូ" and "សាលាគរូ" compare EQUAL, and so do "School" and
 * "school ". They are different names, and once names are unique per
 * organisation rather than globally, both can exist. The database is therefore
 * only used to narrow the candidates (`WHERE schoolname = ?` finds everything
 * that is equal under the collation); the answer is the one candidate whose
 * text is the same as the one given, character for character. A name that is
 * merely collation-equal resolves to nothing. No trimming and no case folding
 * is applied here: a caller that wants to trim does it before calling.
 *
 * Soft-deleted schools resolve like any other: the id is identity, not
 * liveness. Whether a write into a deleted school is allowed is the caller's
 * existing rule, not this function's.
 *
 * Pass the writer's transaction: the lookup then happens inside it, under a
 * shared lock on the school row, so a rename cannot slip in between "resolve"
 * and "insert".
 */
export async function resolveSchoolIdByName(
  schoolname: string | null | undefined,
  transaction?: Transaction,
): Promise<string | null> {
  if (typeof schoolname !== "string" || schoolname.length === 0) {
    return null;
  }
  const candidates = await schools.findAll({
    where: { schoolname },
    attributes: ["schoolid", "schoolname"],
    transaction,
    lock: transaction ? transaction.LOCK.SHARE : undefined,
  });
  const exact = candidates.filter((s) => s.schoolname === schoolname);
  return exact.length === 1 ? exact[0].schoolid : null;
}

/**
 * Like `resolveSchoolIdByName`, but a name that matches no school fails the
 * write with a field error (400). The name is not echoed back.
 */
export async function requireSchoolIdByName(
  schoolname: string | null | undefined,
  transaction?: Transaction,
  field = "schoolname",
): Promise<string> {
  const schoolid = await resolveSchoolIdByName(schoolname, transaction);
  if (!schoolid) {
    throw new ApiError(ErrorCode.INVALID_INPUT, "That school doesn't exist.", {
      fields: [{ field, message: "That school doesn't exist." }],
    });
  }
  return schoolid;
}

/**
 * Fills `schoolid` on rows about to be inserted. A row that already carries a
 * `schoolid` keeps it (the caller resolved the school and has both). A row with
 * only a `schoolname` gets the id resolved from it, once per distinct name,
 * inside the given transaction; a name that matches no school fails the whole
 * write. A row with neither is left alone (the columns are nullable and some
 * callers legitimately have no school).
 */
export async function withSchoolIds<T extends { schoolid?: string | null; schoolname?: string | null }>(
  rows: T[],
  transaction?: Transaction,
): Promise<T[]> {
  const byName = new Map<string, string>();
  const out: T[] = [];
  for (const row of rows) {
    if (row.schoolid || !row.schoolname) {
      out.push(row);
      continue;
    }
    let schoolid = byName.get(row.schoolname);
    if (!schoolid) {
      schoolid = await requireSchoolIdByName(row.schoolname, transaction);
      byName.set(row.schoolname, schoolid);
    }
    out.push({ ...row, schoolid });
  }
  return out;
}
