import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "levels",
        "passing_points",
        {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
          defaultValue: null,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "levels",
        "quiz_points",
        {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
          defaultValue: 0,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "levels",
        "points",
        {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
          defaultValue: 0,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "levels",
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
        "levels",
        "created_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "levels",
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
        "levels",
        "updated_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "levels",
        "deleted_at",
        {
          type: "TIMESTAMP",
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "levels",
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
        queryInterface.removeColumn("levels", "passing_points", {
          transaction,
        }),
        queryInterface.removeColumn("levels", "quiz_points", {
          transaction,
        }),
        queryInterface.removeColumn("levels", "points", {
          transaction,
        }),
        queryInterface.removeColumn("levels", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("levels", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("levels", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("levels", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("levels", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("levels", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
