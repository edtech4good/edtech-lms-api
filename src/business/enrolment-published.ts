import { Transaction } from "sequelize";
import { ApiError } from "src/models/ApiError";
import { curriculums } from "src/models/data-models/curriculums";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { publicationStates } from "./curriculum-publication";

/**
 * A learner can only be enrolled in a curriculum the learning server holds, and it holds only the ones whose latest
 * publication is `published` (a curriculum that was never published, or was retired, is not in the organisation's set).
 */
export const unpublishedMessage = (curriculumname: string): string => `Publish ${curriculumname} first, or choose another curriculum.`;

/** The 400 for an enrolment in a curriculum that is not published: field `curriculumids` (or the file's own name for it), naming the curriculum. */
export const unpublishedError = (curriculumname: string, field = "curriculumids"): ApiError =>
  new ApiError(ErrorCode.INVALID_INPUT, unpublishedMessage(curriculumname), {
    fields: [{ field, message: unpublishedMessage(curriculumname) }],
  });

/**
 * The name of the first curriculum of `curriculumids`, in the order given, whose latest publication is not `published`; undefined
 * when every one is published. Reads on `transaction` when given.
 */
export const firstUnpublished = async (curriculumids: ReadonlyArray<string>, transaction?: Transaction): Promise<string | undefined> => {
  const ids = [...new Set(curriculumids)];
  if (ids.length === 0) return undefined;
  const states = await publicationStates(ids, transaction);
  const missing = ids.filter((id) => states.get(id)?.publicationstatus !== "published");
  if (missing.length === 0) return undefined;
  const rows = await curriculums.findAll({
    where: { curriculumid: missing },
    attributes: ["curriculumid", "curriculumname"],
    transaction,
  });
  const names = new Map(rows.map((r) => [r.curriculumid, r.curriculumname]));
  return names.get(missing[0]) ?? "this curriculum";
};

/** Throws the 400 above for the first curriculum that is not published; returns when all are. */
export const assertPublishedForEnrolment = async (curriculumids: ReadonlyArray<string>, transaction?: Transaction, field = "curriculumids"): Promise<void> => {
  const name = await firstUnpublished(curriculumids, transaction);
  if (name !== undefined) throw unpublishedError(name, field);
};
