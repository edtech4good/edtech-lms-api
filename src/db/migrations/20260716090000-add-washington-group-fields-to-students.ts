import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

/**
 * Washington Group Short Set fields on `students`, for disability
 * disaggregation. Nullable throughout: enrolment must never be blocked on an
 * unanswered question, and NULL records "not collected" rather than "no
 * difficulty".
 *
 * This cannot be backfilled for accounts created before it runs — the answers
 * come from the enrolment interview, not from data we already hold — so it
 * lands before the first real student account exists.
 */
const WG_DOMAINS = [
  "wg_seeing",
  "wg_hearing",
  "wg_walking",
  "wg_remembering",
  "wg_selfcare",
  "wg_communicating",
];

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      for (const domain of WG_DOMAINS) {
        await addColumnIfMissing(
          queryInterface,
          "students",
          domain,
          {
            type: DataTypes.TINYINT,
            allowNull: true,
            defaultValue: null,
          },
          transaction,
        );
      }

      await addColumnIfMissing(
        queryInterface,
        "students",
        "wg_source",
        {
          type: DataTypes.TINYINT,
          allowNull: true,
          defaultValue: null,
        },
        transaction,
      );

      await addColumnIfMissing(
        queryInterface,
        "students",
        "wg_collected_at",
        {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
        transaction,
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      for (const column of [...WG_DOMAINS, "wg_source", "wg_collected_at"]) {
        await queryInterface.removeColumn("students", column, { transaction });
      }
    }),
};
