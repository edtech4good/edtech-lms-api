import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "lessonquizzes",
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
        "lessonquizzes",
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
        "lessonquizzes",
        "created_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lessonquizzes",
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
        "lessonquizzes",
        "updated_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lessonquizzes",
        "deleted_at",
        {
          type: "TIMESTAMP",
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "lessonquizzes",
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
        queryInterface.removeColumn("lessonquizzes", "points", {
          transaction,
        }),
        queryInterface.removeColumn("lessonquizzes", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessonquizzes", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("lessonquizzes", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessonquizzes", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("lessonquizzes", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessonquizzes", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
