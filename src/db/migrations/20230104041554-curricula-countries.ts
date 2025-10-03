import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.createTable('curriculumcountry', {
            curriculumcountryid: {
              type: DataTypes.STRING(36),
              allowNull: false,
              primaryKey: true,
            },
            curriculumid: {
              type: DataTypes.STRING(36),
              allowNull: false,
            },
            countryid: {
              type: DataTypes.STRING(36),
              allowNull: false,
            },
          }, {
            charset: 'utf8mb4',
            collate: 'utf8mb4_0900_ai_ci',
            transaction: transaction,
          });
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration undo changes
          await queryInterface.dropTable('curriculumcountry', { transaction });
        }
    )
};