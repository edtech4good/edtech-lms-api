import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration changes
      return Promise.all([
        queryInterface.addColumn(
          "lessons",
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
          "lessons",
          "learning_points",
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
          "lessons",
          "quizzes_points",
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
          "lessons",
          "practices_points",
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
          "lessons",
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
          "lessons",
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
          "lessons",
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
          "lessons",
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
          "lessons",
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
          "lessons",
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
        queryInterface.removeColumn("lessons", "passing_points", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "learning_points", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "quizzes_points", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "practices_points", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("lessons", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
