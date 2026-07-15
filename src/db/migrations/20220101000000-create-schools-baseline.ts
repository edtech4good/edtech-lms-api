import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Baseline table missing from original migration history.
 * `20221220143728-countries-schools` alters `schools` and expects it to exist.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.createTable(
      'schools',
      {
        schoolid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        schoolname: {
          type: DataTypes.STRING(45),
          allowNull: false,
          unique: true,
        },
        isdeleted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: 0,
        },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
      },
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('schools');
  },
};
