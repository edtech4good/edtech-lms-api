import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

/**
 * `isdeleted` on `students` and `schoolusers`, so a learner can be soft-deleted
 * the way the rest of the app already deletes everything else (subjects,
 * questions, curricula, …): flip the flag, stamp `deleted_at` / `deleted_by`,
 * keep the row and its progress history.
 *
 * Both tables already carry `deleted_at` / `deleted_by`; only the boolean
 * marker was missing, which is why `DELETE /student/:schooluserid` had its two
 * business calls commented out and did nothing. NOT NULL DEFAULT false so every
 * existing learner reads as not-deleted — the only safe backfill.
 *
 * Distinct from the existing status columns on purpose: `schoolusers.isdisabled`
 * / `schooluserstatus` and `students.isactive` drive the reversible
 * enable/disable feature, and overloading them would let a re-enable resurrect a
 * deleted learner.
 */
const TABLES = ["students", "schoolusers"];

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      for (const table of TABLES) {
        await addColumnIfMissing(
          queryInterface,
          table,
          "isdeleted",
          {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          transaction,
        );
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of TABLES) {
        await queryInterface.removeColumn(table, "isdeleted", { transaction });
      }
    }),
};
