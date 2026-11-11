import { DataTypes, literal, QueryInterface, Transaction } from "sequelize";
import { tableNameList, tableOptionsMatchingCurriculums } from "../migration-helpers";

/**
 * `studentawards`: a learner's lasting award for completing a level (one per learner per level, ever). The same
 * table the learning server (edtech-lms-rpi-api) creates under the same name; central stores the awards its
 * learning servers send and sends them back down with a learner's roster.
 *
 * Awards are immutable here: the log import inserts a missing award and never updates one (the first one wins),
 * and nothing deletes an award except removing the learner. `earnedat_approximate` is 1 on an award the learning
 * server made from a progress row's `lastupdated`, because the day the level was completed was not recorded.
 *
 * No foreign keys, as on the learning server: an award outlives the level it names.
 *
 * Idempotent: a second run finds the table and does nothing. `down` drops the table.
 */
const TABLE = "studentawards";

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      if ((await tableNameList(queryInterface)).includes(TABLE)) {
        return;
      }
      const charset = await tableOptionsMatchingCurriculums(queryInterface);
      await queryInterface.createTable(
        TABLE,
        {
          studentawardid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
          studentid: { type: DataTypes.STRING(36), allowNull: false },
          levelid: { type: DataTypes.STRING(36), allowNull: false },
          gradeid: { type: DataTypes.STRING(36), allowNull: false },
          curid: { type: DataTypes.STRING(36), allowNull: false },
          earnedat: { type: DataTypes.DATE, allowNull: false },
          earnedat_approximate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
          lastupdated: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: literal("CURRENT_TIMESTAMP"),
          },
        },
        { ...charset, transaction },
      );
      await queryInterface.addIndex(TABLE, ["studentid", "levelid"], {
        name: "uq_studentawards_student_level",
        unique: true,
        transaction,
      });
      await queryInterface.addIndex(TABLE, ["studentid"], { name: "idx_studentawards_studentid", transaction });
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await queryInterface.dropTable(TABLE, { transaction });
    }),
};
