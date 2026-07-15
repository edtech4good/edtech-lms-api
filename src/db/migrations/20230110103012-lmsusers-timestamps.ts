import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "lmsusers",
        "created_at",
        {
          type: "TIMESTAMP",
          defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lmsusers",
        "created_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lmsusers",
        "updated_at",
        {
          type: "TIMESTAMP",
          defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lmsusers",
        "updated_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lmsusers",
        "deleted_at",
        {
          type: "TIMESTAMP",
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lmsusers",
        "deleted_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
    }),

  down: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      return Promise.all([
        queryInterface.removeColumn("lmsusers", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("lmsusers", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("lmsusers", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("lmsusers", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("lmsusers", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("lmsusers", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
