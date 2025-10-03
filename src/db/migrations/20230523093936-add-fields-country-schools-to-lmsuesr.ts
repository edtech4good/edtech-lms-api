import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration changes
          await queryInterface.addColumn(
            "lmsusers",
            "countries",
            {
              type: DataTypes.JSON,
              allowNull: true,
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "lmsusers",
            "schools",
            {
              type: DataTypes.JSON,
              allowNull: true,
            },
            {
              transaction: transaction,
            }
          );
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration undo changes
          await queryInterface.removeColumn("lmsusers", "countries", {
            transaction,
          });
          await queryInterface.removeColumn("lmsusers", "schools", {
            transaction,
          });
        }
    )
};