import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "lessonpractices",
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
        "lessonpractices",
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
        "lessonpractices",
        "created_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lessonpractices",
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
        "lessonpractices",
        "updated_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lessonpractices",
        "deleted_at",
        {
          type: "TIMESTAMP",
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lessonpractices",
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
        queryInterface.removeColumn("lessonpractices", "points", {
          transaction,
        }),
        queryInterface.removeColumn("lessonpractices", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessonpractices", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("lessonpractices", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessonpractices", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("lessonpractices", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessonpractices", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
