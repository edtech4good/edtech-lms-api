import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "logfiles",
        {
          logfileid: {
            type: DataTypes.STRING(36),
            allowNull: false,
            primaryKey: true
          },
          parentfileid: {
            type: DataTypes.STRING(36),
            allowNull: true,
          },
          logfilename: {
            type: DataTypes.STRING(45),
            allowNull: false
          },
          logfilemeta: {
            type: DataTypes.JSON,
            allowNull: true
          },
          type: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1
          },
          isdeleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: 0
          },
          created_at: {
            type: 'TIMESTAMP',
            defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
            allowNull: true
          },
          created_by: {
            type: DataTypes.STRING(36),
            allowNull: true
          },
          updated_at: {
            type: 'TIMESTAMP',
            defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
            allowNull: true
          },
          updated_by: {
            type: DataTypes.STRING(36),
            allowNull: true
          },
          deleted_at: {
            type: 'TIMESTAMP',
            allowNull: true
          },
          deleted_by: {
            type: DataTypes.STRING(36),
            allowNull: true
          }
        },
        {
          transaction: transaction,
        }
      );
      return await queryInterface.addIndex("logfiles", ["logfileid"], {
        transaction,
      });
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("logfiles", { transaction });
    }),
};
