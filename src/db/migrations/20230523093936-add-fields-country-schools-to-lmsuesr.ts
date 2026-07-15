import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "lmsusers",
        "countries",
        {
          type: DataTypes.JSON,
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lmsusers",
        "schools",
        {
          type: DataTypes.JSON,
          allowNull: true,
        },
        transaction,
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("lmsusers", "countries", {
        transaction,
      });
      await queryInterface.removeColumn("lmsusers", "schools", {
        transaction,
      });
    }),
};
