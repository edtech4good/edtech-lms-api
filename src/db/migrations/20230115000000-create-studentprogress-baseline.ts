import { QueryInterface, DataTypes } from "sequelize";
import { tableNameList, tableOptionsMatchingCurriculums } from "../migration-helpers";

/**
 * `studentprogress` is altered by `20230116033420` and later migrations but was never created earlier.
 * Columns here are everything those migrations expect to *add*, not the baseline row shape.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const names = await tableNameList(queryInterface);
    if (names.includes("studentprogress")) {
      return;
    }
    const charset = await tableOptionsMatchingCurriculums(queryInterface);
    await queryInterface.createTable(
      "studentprogress",
      {
        studentprogressid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
        studentid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: { model: "students", key: "studentid" },
        },
        ispass: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        studentprogressreferenceid: { type: DataTypes.STRING(36), allowNull: false },
        starttime: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
        },
        endtime: { type: DataTypes.DATE, allowNull: true },
        progresstype: { type: DataTypes.INTEGER, allowNull: false },
      },
      charset,
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable("studentprogress");
  },
};
