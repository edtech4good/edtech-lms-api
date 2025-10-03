import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration changes
          await queryInterface.addColumn(
            "countries",
            "expectedusage",
            {
              type: DataTypes.DOUBLE.UNSIGNED,
              allowNull: true,
              defaultValue: null
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "schools",
            "expectedcontribution",
            {
              type: DataTypes.DOUBLE.UNSIGNED,
              allowNull: true,
              defaultValue: null
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "schools",
            "expectedusage",
            {
              type: DataTypes.DOUBLE.UNSIGNED,
              allowNull: true,
              defaultValue: null
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
          await queryInterface.removeColumn("countries", "expectedusage", {
            transaction,
          });
          await queryInterface.removeColumn("schools", "expectedcontribution", {
            transaction,
          });
          await queryInterface.removeColumn("schools", "expectedusage", {
            transaction,
          });
        }
    )
};