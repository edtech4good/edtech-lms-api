import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration changes
      return Promise.all([
        queryInterface.addColumn(
          "levels",
          "passing_points",
          {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            defaultValue: null
          },
          {
            transaction: transaction,
          }
        ),
        queryInterface.addColumn(
          "levels",
          "quiz_points",
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
          "levels",
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
          "levels",
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
          "levels",
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
          "levels",
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
          "levels",
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
          "levels",
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
          "levels",
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
