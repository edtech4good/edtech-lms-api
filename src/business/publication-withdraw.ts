import { Transaction } from "sequelize";
import { curriculumpublications } from "src/models/data-models/curriculumpublications";

/**
 * Withdraws every published publication of the curriculum (A4 steps 1 and 3): the next payload leaves it out and learners'
 * progress stays. Retire does it, and so does deleting the curriculum, in the same transaction as the delete, so that a
 * deleted curriculum is never left `published` in the admin's view of its state. True when this call withdrew something;
 * false when the curriculum was already withdrawn or never published (nothing is written then).
 *
 * Kept apart from curriculum-publication.ts because the curriculum business class (which the delete lives in) cannot import
 * that file: it reaches the export, which reaches the business class.
 */
export const withdrawPublications = async (curriculumid: string, transaction: Transaction): Promise<boolean> => {
  const [changed] = await curriculumpublications.update(
    { status: "withdrawn" },
    { where: { curriculumid, status: "published" }, transaction },
  );
  return changed > 0;
};
