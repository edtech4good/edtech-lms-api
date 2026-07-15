import { QueryInterface, DataTypes } from "sequelize";
import { tableNameList, tableOptionsMatchingCurriculums } from "../migration-helpers";

/**
 * JWT access/refresh rows (jti storage) — see models/data-models/tokens.ts and TokenBusiness.
 * Was missing from earlier migration history; login fails without this table.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const names = await tableNameList(queryInterface);
    if (names.includes("tokens")) {
      return;
    }
    const charset = await tableOptionsMatchingCurriculums(queryInterface);
    await queryInterface.createTable(
      "tokens",
      {
        token: {
          type: DataTypes.STRING(500),
          allowNull: false,
          primaryKey: true,
        },
        lmsuserid: {
          type: DataTypes.STRING(36),
          allowNull: false,
        },
        tokentype: {
          type: DataTypes.STRING(8),
          allowNull: false,
        },
      },
      charset,
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable("tokens");
  },
};
