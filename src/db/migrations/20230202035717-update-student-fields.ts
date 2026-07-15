import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "students",
        "type",
        {
          type: DataTypes.STRING(10),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "students",
        "profileimage",
        {
          type: DataTypes.STRING(250),
          allowNull: true,
        },
        transaction,
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("students", "type", {
        transaction,
      });
      return await queryInterface.removeColumn("students", "profileimage", {
        transaction,
      });
    }),
};
