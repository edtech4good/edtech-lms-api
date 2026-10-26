import { ModelStatic } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { ValidationException } from "src/models/ValidationException";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { ContentKind, findOwned } from "./content-scope";

/** How one tier of children is found and ordered under its parent. */
export interface ReorderSpec {
  /** The kind of the children, as content-scope.ts names it (the owner check for each id in the list). */
  kind: ContentKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: ModelStatic<any>;
  idColumn: string;
  parentColumn: string;
  orderColumn: string;
  /** The body field that carries the list, as the client knows it. */
  field: string;
  /** The child and its parent, singular, for the message ("grade", "curriculum"). */
  noun: string;
  parentNoun: string;
  /** Children of this tier are soft-deleted (`isdeleted`); a deleted one is not part of the set. */
  softDelete: boolean;
}

const refusal = (spec: ReorderSpec, missing: number, elsewhere: number, repeated: number) => {
  const parts = [
    missing > 0 ? `${missing} missing` : "",
    elsewhere > 0 ? `${elsewhere} not in this ${spec.parentNoun}` : "",
    repeated > 0 ? `${repeated} repeated` : "",
  ].filter((p) => p !== "");
  return new ValidationException([
    {
      field: spec.field,
      message: `The list must hold every ${spec.noun} of this ${spec.parentNoun}, once each, and nothing else: ${parts.join(", ")}.`,
    },
  ]);
};

/**
 * Sets the order of ALL the live children of one parent in one call: 1..n in the order given (the same rules as a
 * lesson's learning items). The caller has already checked that the parent is in scope.
 *
 * Every id in the list is the caller's own, or the 404 an absent one gets (another organisation's, an unowned one and a
 * missing one are not told apart), before anything is compared; then the list must be exactly the parent's live
 * children, once each, or it is a 400 that counts what is wrong (missing, not in this parent, repeated) and names no id.
 * Nothing is written unless the whole list is accepted, and the writes are one transaction.
 */
export const reorderChildren = async (org: OrgContext | undefined, spec: ReorderSpec, parentid: string, ids: string[]) => {
  const { model, idColumn, parentColumn, orderColumn } = spec;
  const given = new Set<string>();
  let elsewhere = 0;
  let repeated = 0;
  for (const id of ids) {
    const row = org ? await findOwned(org, spec.kind, id) : await model.findOne({ where: { [idColumn]: id } });
    if (!row || row[parentColumn] !== parentid || (spec.softDelete && row.isdeleted === true)) {
      elsewhere += 1;
    } else if (given.has(id)) {
      repeated += 1;
    } else {
      given.add(id);
    }
  }
  const live = await model.findAll({
    where: spec.softDelete ? { [parentColumn]: parentid, isdeleted: false } : { [parentColumn]: parentid },
    attributes: [idColumn],
  });
  const missing = live.filter((x) => !given.has(x[idColumn])).length;
  if (elsewhere > 0 || repeated > 0 || missing > 0) {
    throw refusal(spec, missing, elsewhere, repeated);
  }
  const transaction = await dbinstance.getdbinstance().transaction();
  try {
    for (const [index, id] of ids.entries()) {
      await model.update(
        { [orderColumn]: index + 1 },
        { where: { [idColumn]: id, [parentColumn]: parentid }, fields: [orderColumn], transaction },
      );
    }
    await transaction.commit();
  } catch (e) {
    await rollbackQuietly(transaction);
    throw e;
  }
  return true;
};
