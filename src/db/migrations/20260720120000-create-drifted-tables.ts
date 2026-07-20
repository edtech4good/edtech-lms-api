import { QueryInterface, DataTypes, literal } from 'sequelize';
import { tableNameList } from '../migration-helpers';

/**
 * Four tables that have Sequelize models (init-models) but were never created by
 * any migration — schema drift. Older dev databases carry them from a pre-
 * migration schema, so it went unnoticed; a fresh migration-only database (the
 * DigitalOcean UAT/prod deploy) is missing them, and any feature that touches
 * them 500s. Surfaced when the demo seed hit
 * `Table 'edtech_lms.lessonpracticequestions' doesn't exist` on UAT.
 *
 * DDL captured from a working dev database. Each table is guarded on
 * `tableNameList` so this is a no-op where they already exist (older dev DBs,
 * and the UAT box where they were created by hand to unblock).
 *
 * - databuild, lmsuseraccess: flat tables, no foreign keys.
 * - lessonpracticequestions, lessonquizquestions: join tables; FK targets
 *   (lessonpractices, lessonquizzes, questions) are created by the baseline.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const names = await tableNameList(queryInterface);
    const opts = { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' };

    if (!names.includes('databuild')) {
      await queryInterface.createTable(
        'databuild',
        {
          databuildid: { type: DataTypes.INTEGER, allowNull: false, autoIncrement: true, primaryKey: true },
          buildname: { type: DataTypes.STRING(45), allowNull: false },
          builddate: { type: DataTypes.DATE, allowNull: false },
          builduser: { type: DataTypes.STRING(36), allowNull: false },
        },
        opts,
      );
    }

    if (!names.includes('lmsuseraccess')) {
      await queryInterface.createTable(
        'lmsuseraccess',
        {
          useraccessid: { type: DataTypes.STRING(45), allowNull: false, primaryKey: true },
          userid: { type: DataTypes.STRING(45), allowNull: false },
          logintime: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
          ipaddress: { type: DataTypes.STRING(45), allowNull: false },
        },
        opts,
      );
    }

    if (!names.includes('lessonpracticequestions')) {
      await queryInterface.createTable(
        'lessonpracticequestions',
        {
          lessonpracticequestionid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
          lessonpracticeid: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: { model: 'lessonpractices', key: 'lessonpracticeid' },
            onUpdate: 'CASCADE',
          },
          lessonpracticequestionstatus: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
          questionid: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: { model: 'questions', key: 'questionid' },
            onUpdate: 'CASCADE',
          },
          lessonpracticequestionorder: { type: DataTypes.INTEGER, allowNull: false },
        },
        opts,
      );
    }

    if (!names.includes('lessonquizquestions')) {
      await queryInterface.createTable(
        'lessonquizquestions',
        {
          lessonquizquestionid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
          lessonquizid: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: { model: 'lessonquizzes', key: 'lessonquizid' },
            onUpdate: 'CASCADE',
          },
          questionid: {
            type: DataTypes.STRING(36),
            allowNull: false,
            references: { model: 'questions', key: 'questionid' },
            onUpdate: 'CASCADE',
          },
          lessonquizquestionstatus: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
          lessonquizquestionorder: { type: DataTypes.INTEGER, allowNull: false },
        },
        opts,
      );
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    // Drop the join tables first (FKs), then the flat tables.
    await queryInterface.dropTable('lessonquizquestions');
    await queryInterface.dropTable('lessonpracticequestions');
    await queryInterface.dropTable('lmsuseraccess');
    await queryInterface.dropTable('databuild');
  },
};
