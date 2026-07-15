import { QueryInterface, DataTypes } from "sequelize";
import { tableNameList, tableOptionsMatchingCurriculums } from "../migration-helpers";

/**
 * Baseline table missing from original migration history.
 * `20230502034445-add-baseline-fields` alters `curriculumbaseline` and
 * `20230508084356-create-baselinequestion` stores a `curriculumbaselineid`,
 * but no migration ever created the table.
 *
 * Only the columns the later migrations do not add: the id, the curriculum it
 * belongs to, and the curriculum used as the baseline. Everything else arrives
 * in `20230502034445-add-baseline-fields`.
 *
 * `curriculumid` and `baselineid` both point at `curriculums.curriculumid`, but
 * models/data-models/curriculumbaseline.ts keeps those `references` commented
 * out, so no foreign keys are declared here either.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const names = await tableNameList(queryInterface);
    if (names.includes("curriculumbaseline")) {
      return;
    }
    const charset = await tableOptionsMatchingCurriculums(queryInterface);
    await queryInterface.createTable(
      "curriculumbaseline",
      {
        curriculumbaselineid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        curriculumid: {
          type: DataTypes.STRING(36),
          allowNull: false,
        },
        baselineid: {
          type: DataTypes.STRING(36),
          allowNull: false,
        },
      },
      charset,
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable("curriculumbaseline");
  },
};
