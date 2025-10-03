import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration changes
      return Promise.all([
        queryInterface.addColumn(
          "documenttags",
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
          "documenttags",
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
          "documenttags",
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
          "documenttags",
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
          "documenttags",
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
          "documenttags",
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
        queryInterface.removeColumn("documenttags", "created_at", {
          transaction,
        }),
        queryInterface.removeColumn("documenttags", "created_by", {
          transaction,
        }),
        queryInterface.removeColumn("documenttags", "updated_at", {
          transaction,
        }),
        queryInterface.removeColumn("documenttags", "updated_by", {
          transaction,
        }),
        queryInterface.removeColumn("documenttags", "deleted_at", {
          transaction,
        }),
        queryInterface.removeColumn("documenttags", "deleted_by", {
          transaction,
        }),
      ]);
    }),
};
