import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration changes
      return Promise.all([
        queryInterface.addColumn(
          "grades",
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
          "grades",
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
          "grades",
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
          "grades",
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
          "grades",
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
          "grades",
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
          "grades",
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
          "grades",
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
        queryInterface.removeColumn("grades", "passing_points", {
          transaction,
        }),
        queryInterface.removeColumn("grades", "points", {
          transaction,
        }),
        queryInterface.removeColumn("grades", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("grades", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("grades", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("grades", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("grades", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("grades", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
