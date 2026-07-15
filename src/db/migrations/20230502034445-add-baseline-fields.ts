import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const qi = queryInterface;
      const t = "curriculumbaseline";
      const now = qi.sequelize.Sequelize.fn("NOW");

      await addColumnIfMissing(
        qi,
        t,
        "baselinename",
        { type: DataTypes.STRING(36), allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "baselinetype",
        { type: DataTypes.TINYINT, allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "baselinestatus",
        { type: DataTypes.BOOLEAN, allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "startdate",
        { type: DataTypes.DATE, allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "enddate",
        { type: DataTypes.DATE, allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "schoolid",
        { type: DataTypes.JSON, allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "isdeleted",
        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "created_at",
        { type: "TIMESTAMP", defaultValue: now, allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "created_by",
        { type: DataTypes.STRING(36), allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "updated_at",
        { type: "TIMESTAMP", defaultValue: now, allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "updated_by",
        { type: DataTypes.STRING(36), allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "deleted_at",
        { type: "TIMESTAMP", allowNull: true },
        transaction,
      );
      await addColumnIfMissing(
        qi,
        t,
        "deleted_by",
        { type: DataTypes.STRING(36), allowNull: true },
        transaction,
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      const t = "curriculumbaseline";
      const cols = [
        "baselinename",
        "baselinetype",
        "baselinestatus",
        "startdate",
        "enddate",
        "schoolid",
        "isdeleted",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "deleted_at",
        "deleted_by",
      ];
      for (const c of cols) {
        await queryInterface.removeColumn(t, c, { transaction });
      }
    }),
};
