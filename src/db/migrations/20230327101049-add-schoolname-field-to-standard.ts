import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration changes
          await queryInterface.addColumn(
            "standards",
            "schoolname",
            {
              type: DataTypes.STRING(255),
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
          await queryInterface.removeColumn("standards", "schoolname", {
            transaction,
          });
        }
    )
};