import { QueryInterface, DataTypes } from 'sequelize';
import { tableNameList } from '../migration-helpers';

/**
 * Baseline table missing from original migration history.
 * `20221220143728-countries-schools` alters `schools` and expects it to exist.
 *
 * Guarded: on a database created before these baselines existed, `schools` is
 * already present but this migration is not in SequelizeMeta, so it would run
 * and abort on CREATE TABLE.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const names = await tableNameList(queryInterface);
    if (names.includes('schools')) {
      return;
    }
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
