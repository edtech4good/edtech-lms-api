import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "syncrecords",
        {
          syncid: {
            type: DataTypes.STRING(36),
            allowNull: false,
            primaryKey: true
          },
          filename: {
            type: DataTypes.STRING(255),
            allowNull: true,
          },
          type: {
            type: DataTypes.TINYINT,
            allowNull: false,
          },
          offlineonline: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
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
        },
        {
          transaction: transaction,
        }
      );
      return await queryInterface.addIndex(
        "syncrecords",
        ["syncid"],
        {
          transaction,
        }
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration undo changes
      await queryInterface.dropTable("syncrecords", { transaction });
    }),
};
