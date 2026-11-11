import { Op, Transaction } from "sequelize";
import { ApiError } from "src/models/ApiError";
import { schools } from "src/models/data-models/school";
import { ErrorCode } from "src/models/enums/errorcode.enum";

/** What a create or rename is told when a school that was deleted once still holds the name (the learning server keeps every name it ever had). */
export const NAME_HELD_BEFORE_MESSAGE = "A school with this name existed before. Choose another name.";

/**
 * Refuses a name that a deleted school holds. The learning server's `schools.schoolname` is unique across the whole table
 * (every organisation, deleted rows included), so a name held on central by a deleted school would later be refused there
 * and block the organisation's whole set. A live school that holds the name is refused too (the name is unique on central as well).
 * `exceptschoolid` is the school being renamed. Reads on the transaction it is given.
 */
export const assertNameNeverHeld = async (schoolname: string, exceptschoolid: string | null, transaction: Transaction) => {
  const holder = await schools.findOne({
    where: { schoolname, ...(exceptschoolid ? { schoolid: { [Op.ne]: exceptschoolid } } : {}) },
    attributes: ["schoolid", "isdeleted"],
    transaction,
  });
  if (holder === null) return;
  const message = holder.isdeleted ? NAME_HELD_BEFORE_MESSAGE : "That school already exists.";
  throw new ApiError(ErrorCode.INVALID_INPUT, message, { fields: [{ field: "schoolname", message }] });
};
