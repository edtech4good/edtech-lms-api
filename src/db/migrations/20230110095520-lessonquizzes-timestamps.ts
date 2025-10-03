import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration changes
      return Promise.all([
        queryInterface.addColumn(
          "lessonquizzes",
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
          "lessonquizzes",
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
          "lessonquizzes",
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
          "lessonquizzes",
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
          "lessonquizzes",
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
          "lessonquizzes",
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
          "lessonquizzes",
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
