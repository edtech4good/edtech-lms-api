import { QueryInterface, DataTypes } from 'sequelize';

/**
 * `curriculums` is altered by `20230110070115-curriculum-timestamps` but was never created
 * in an earlier migration. Baseline columns only — timestamp columns are added by that migration.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : (t as { tableName?: string }).tableName ?? String(t)));
    if (names.includes('curriculums')) {
      return;
    }
    await queryInterface.createTable(
      'curriculums',
      {
        curriculumid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        curriculumname: {
          type: DataTypes.STRING(250),
          allowNull: false,
        },
        curriculumstatus: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        curriculumdescription: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        isdeleted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        subjectid: {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
      },
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('curriculums');
  },
};
