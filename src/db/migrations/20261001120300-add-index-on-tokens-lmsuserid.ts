import { QueryInterface, Transaction } from "sequelize";

/**
 * An index on `tokens.lmsuserid`. The table is keyed by `token` alone, but it
 * is also searched and written by user: every sign-in and refresh deletes the
 * user's old rows, suspending an organisation deletes the rows of all its staff,
 * and removing Super Admin deletes one user's rows. Without an index each of
 * those is a scan of the whole table, and under InnoDB it locks every row it
 * reads, so a revocation can stall other requests that touch `tokens`.
 *
 * Idempotent: it does nothing if an index with this name, or any index that
 * already covers exactly `lmsuserid`, exists. `down()` removes only the index
 * this migration adds.
 */
const TABLE = "tokens";
const COLUMN = "lmsuserid";
const INDEX = "tokens_lmsuserid_idx";

/** An index as Sequelize's MySQL `showIndex` returns it: one row per index, columns in `fields`. */
type IndexRow = { name?: string; fields?: Array<{ attribute?: string }> };

const covers = (row: IndexRow) =>
  Array.isArray(row.fields) && row.fields.length === 1 && row.fields[0].attribute === COLUMN;

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const rows = (await queryInterface.showIndex(TABLE)) as IndexRow[];
      if (rows.some((row) => row.name === INDEX || covers(row))) {
        return;
      }
      await queryInterface.addIndex(TABLE, [COLUMN], { name: INDEX, transaction });
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const rows = (await queryInterface.showIndex(TABLE)) as IndexRow[];
      if (rows.some((row) => row.name === INDEX)) {
        await queryInterface.removeIndex(TABLE, INDEX, { transaction });
      }
    }),
};
