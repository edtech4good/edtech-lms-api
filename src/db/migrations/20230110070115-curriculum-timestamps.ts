import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        "curriculums",
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
        "curriculums",
        "created_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "curriculums",
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
        "curriculums",
        "updated_by",
        {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "curriculums",
        "deleted_at",
        {
          type: "TIMESTAMP",
          allowNull: true,
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        "curriculums",
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
        queryInterface.removeColumn("curriculums", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("curriculums", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("curriculums", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("curriculums", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("curriculums", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("curriculums", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
