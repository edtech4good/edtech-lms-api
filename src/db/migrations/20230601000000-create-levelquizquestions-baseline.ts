import { QueryInterface, DataTypes } from "sequelize";
import { tableNameList, tableOptionsMatchingCurriculums } from "../migration-helpers";

/**
 * Baseline table missing from original migration history.
 * `20230602063906-add-lessonid-to-levelquizquestion` alters `levelquizquestions`
 * but no migration ever created it. `lessonid` is deliberately absent here; that
 * migration adds it.
 *
 * `levels` and `questions` are created by `20230108000000-create-domain-tables-baseline`,
 * which runs earlier, so the foreign keys declared in
 * models/data-models/levelquizquestions.ts can be created here.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const names = await tableNameList(queryInterface);
    if (names.includes("levelquizquestions")) {
      return;
    }
    const charset = await tableOptionsMatchingCurriculums(queryInterface);
    await queryInterface.createTable(
      "levelquizquestions",
      {
        levelquizquestionid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        levelid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: { model: "levels", key: "levelid" },
        },
        questionid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: { model: "questions", key: "questionid" },
        },
        levelquizquestionstatus: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        levelquizquestionorder: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
      },
      charset,
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable("levelquizquestions");
  },
};
