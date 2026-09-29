import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

/**
 * Central's slice of the server-grading protocol (student API #93/#94).
 *
 * Central does NOT get the `answer` column: raw typed learner answers are
 * not needed here (data minimisation), so `log/import` never copies that
 * field across even though the student API sends it.
 *
 * studentprogressquestions gets:
 *  - clientiscorrect: the client's own claimed verdict, imported as-is
 *    (kept for future reporting of client/server grading disagreement).
 *  - servergrade: 'correct' | 'incorrect' | 'ungradable', as graded by the
 *    student API that submitted the row.
 *
 * studentprogress gets `verified`, defaulting to false like the student
 * API's column - but central never trusts an imported `verified` value:
 * `LogBusiness.importprogresslog` forces it to false on every imported row
 * regardless of what the payload says (see log.business.ts). Existing rows
 * are NOT backfilled, same rationale as the student API's migration.
 */
module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "studentprogressquestions",
        "clientiscorrect",
        {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          defaultValue: null,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "studentprogressquestions",
        "servergrade",
        {
          type: DataTypes.ENUM("correct", "incorrect", "ungradable"),
          allowNull: true,
          defaultValue: null,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "studentprogress",
        "verified",
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        transaction,
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("studentprogress", "verified", { transaction });
      await queryInterface.removeColumn("studentprogressquestions", "servergrade", { transaction });
      await queryInterface.removeColumn("studentprogressquestions", "clientiscorrect", { transaction });
      // MySQL leaves the servergrade ENUM type attached to nothing once the
      // column is dropped - nothing further to clean up here.
    }),
};
