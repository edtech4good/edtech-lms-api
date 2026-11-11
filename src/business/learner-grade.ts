import { Transaction } from "sequelize";
import { ApiError, ApiFieldError } from "src/models/ApiError";
import { grades } from "src/models/data-models/grades";
import { ErrorCode } from "src/models/enums/errorcode.enum";

/**
 * The one rule for a learner's grade, shared by every path that creates a learner or changes its curriculum (add one, Upload
 * Users, edit, move, Upload Edited Students).
 *
 * A learner's grade is a grade of its PRIMARY curriculum (`students.curriculumid`) that has not been deleted:
 *  - a grade the caller names must be one of those, else it is refused;
 *  - with none named, the current grade is kept while it is still one of those (edit, move and the edit file only);
 *  - else the curriculum's only grade is used; a curriculum with no grade is refused; one with several asks for a choice.
 * Every successful create or update stores the answer in `students.gradeid`.
 *
 * The caller has already checked that the curriculum is one of the caller's organisation's, so the grades read here are
 * the caller's too: a grade is only ever looked up inside that one curriculum.
 */

export const GRADE_INVALID_MESSAGE = "Choose a grade of this curriculum.";
export const GRADE_NONE_MESSAGE = "This curriculum has no grade yet, so a learner can't be put in it.";
export const GRADE_CHOOSE_MESSAGE = "Choose a grade for this student.";

export type GradeRefusalReason = "invalid" | "none" | "choose";

export interface GradeRefusal {
  reason: GradeRefusalReason;
  field: "gradeid";
  message: string;
}

export type GradeResolution = { ok: true; gradeid: string } | ({ ok: false } & GradeRefusal);

export interface ResolveLearnerGradeInput {
  /** The learner's primary curriculum. */
  curriculumid: string;
  /** The grade the caller named, if any (blank counts as none). */
  gradeid?: string | null;
  /** The grade the learner has now (edit, move, edit file). */
  currentGradeid?: string | null;
  transaction?: Transaction;
}

const refuse = (reason: GradeRefusalReason, message: string): GradeResolution => ({ ok: false, reason, field: "gradeid", message });

/** The live grades of a curriculum as `{ gradeid, gradename }`, in their order. */
export const liveGradesOf = async (
  curriculumid: string,
  transaction?: Transaction,
): Promise<Array<{ gradeid: string; gradename: string }>> => {
  const rows = await grades.findAll({
    where: { curriculumid, isdeleted: false },
    attributes: ["gradeid", "gradename", "gradeorder"],
    order: [
      ["gradeorder", "ASC"],
      ["gradeid", "ASC"],
    ],
    transaction,
  });
  return rows.map((r) => ({ gradeid: r.gradeid, gradename: r.gradename }));
};

export const resolveLearnerGrade = async (input: ResolveLearnerGradeInput): Promise<GradeResolution> => {
  const live = await liveGradesOf(input.curriculumid, input.transaction);
  const named = typeof input.gradeid === "string" && input.gradeid.trim() !== "" ? input.gradeid.trim() : undefined;
  if (named !== undefined) {
    return live.some((g) => g.gradeid === named) ? { ok: true, gradeid: named } : refuse("invalid", GRADE_INVALID_MESSAGE);
  }
  if (input.currentGradeid && live.some((g) => g.gradeid === input.currentGradeid)) {
    return { ok: true, gradeid: input.currentGradeid };
  }
  if (live.length === 0) return refuse("none", GRADE_NONE_MESSAGE);
  if (live.length === 1) return { ok: true, gradeid: live[0].gradeid };
  return refuse("choose", GRADE_CHOOSE_MESSAGE);
};

/**
 * The grade a learner is stored with, or a 400 naming `field` (`gradeid` for a form; a file names its own column).
 */
export const gradeOrRefuse = async (input: ResolveLearnerGradeInput, field: string = "gradeid"): Promise<string> => {
  const result = await resolveLearnerGrade(input);
  if (result.ok) return result.gradeid;
  const fields: ApiFieldError[] = [{ field, message: result.message }];
  throw new ApiError(ErrorCode.INVALID_INPUT, result.message, { fields });
};

/**
 * The `gradeid` of a form body: `undefined` when none is sent (a missing key, null or blank), the trimmed id when it is a
 * string of at most 36 characters, and `null` when it is anything else (the caller refuses that with `GRADE_INVALID_MESSAGE`).
 */
export const gradeIdValue = (value: unknown): string | undefined | null => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return trimmed.length <= 36 ? trimmed : null;
};
