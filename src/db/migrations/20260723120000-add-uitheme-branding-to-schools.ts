import { QueryInterface, DataTypes, Transaction } from "sequelize";
import { addColumnIfMissing } from "../migration-helpers";

/**
 * Per-school UI theme + branding. `uitheme` drives which mobile shell
 * ('kids' | 'corporate') a school's app renders; NOT NULL DEFAULT 'kids' so
 * every existing school keeps today's behaviour with no backfill needed.
 * `brandingconfig` is a nullable JSON blob ({ logourl?, displayname? }) for a
 * later logo-upload slice — left null until that ships.
 */
const TABLE = "schools";

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await addColumnIfMissing(
        queryInterface,
        TABLE,
        "uitheme",
        {
          type: DataTypes.STRING(16),
          allowNull: false,
          defaultValue: "kids",
        },
        transaction,
      );
      await addColumnIfMissing(
        queryInterface,
        TABLE,
        "brandingconfig",
        {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: null,
        },
        transaction,
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(TABLE, "brandingconfig", { transaction });
      await queryInterface.removeColumn(TABLE, "uitheme", { transaction });
    }),
};
