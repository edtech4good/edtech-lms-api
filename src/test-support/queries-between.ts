import { ContentFake } from "./content-fake";

/**
 * Every call made on a model between two moments (jest's global call order, `invocationCallOrder`), with whether it was given
 * the transaction. For the specs that pin the pool rule: between a transaction's begin and its commit, every query takes the
 * transaction, so none is waiting on a pool connection the transaction's own lock is keeping others from.
 */
export const queriesBetween = (db: ContentFake, transaction: unknown, from: number, to: number) => {
  const out: Array<{ method: string; inTransaction: boolean }> = [];
  for (const model of db.models()) {
    for (const method of ["findOne", "findAll", "findAndCountAll", "count", "create", "bulkCreate", "update", "destroy"]) {
      const fn = (model as Record<string, unknown>)[method] as jest.Mock;
      fn.mock.calls.forEach((args: unknown[], n: number) => {
        const order = fn.mock.invocationCallOrder[n];
        if (order > from && order < to) {
          out.push({ method, inTransaction: args.some((a) => typeof a === "object" && a !== null && (a as { transaction?: unknown }).transaction === transaction) });
        }
      });
    }
  }
  return out;
};
