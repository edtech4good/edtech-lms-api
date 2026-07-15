import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "students",
        "familyname",
        {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "students",
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
        "students",
        "created_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "students",
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
        "students",
        "updated_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "students",
        "deleted_at",
        {
          type: "TIMESTAMP",
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "students",
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
        queryInterface.removeColumn("students", "familyname", {
          transaction,
        }),
        queryInterface.removeColumn("students", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("students", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("students", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("students", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("students", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("students", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
