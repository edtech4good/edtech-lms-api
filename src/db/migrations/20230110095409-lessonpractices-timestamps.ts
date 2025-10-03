import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration changes
      return Promise.all([
        queryInterface.addColumn(
          "lessonpractices",
          "points",
          {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            defaultValue: 0
          },
          {
            transaction: transaction,
          }
        ),
        queryInterface.addColumn(
          "lessonpractices",
          "created_at",
          {
            type: "TIMESTAMP",
            defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
            allowNull: true,
          },
          {
            transaction: transaction,
          }
        ),
        queryInterface.addColumn(
          "lessonpractices",
          "created_by",
          {
            type: DataTypes.STRING(36),
            allowNull: true,
          },
          {
            transaction: transaction,
          }
        ),
        queryInterface.addColumn(
          "lessonpractices",
          "updated_at",
          {
            type: "TIMESTAMP",
            defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
            allowNull: true,
          },
          {
            transaction: transaction,
          }
        ),
        queryInterface.addColumn(
          "lessonpractices",
          "updated_by",
          {
            type: DataTypes.STRING(36),
            allowNull: true,
          },
          {
            transaction: transaction,
          }
        ),
        queryInterface.addColumn(
          "lessonpractices",
          "deleted_at",
          {
            type: "TIMESTAMP",
            allowNull: true,
          },
          {
            transaction: transaction,
          }
        ),
        queryInterface.addColumn(
          "lessonpractices",
          "deleted_by",
          {
            type: DataTypes.STRING(36),
            allowNull: true,
          },
          {
            transaction: transaction,
          }
        ),
      ]);
    }),

  down: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration undo changes
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
