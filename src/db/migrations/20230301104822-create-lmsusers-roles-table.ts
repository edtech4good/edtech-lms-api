import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "lmsusers_roles",
        {
          roleid: {
            type: DataTypes.STRING(36),
            references: {
              model: 'roles',
              key: 'roleid'
            }
          },
          lmsuserid: {
            type: DataTypes.STRING(36),
            references: {
              model: 'lmsusers',
              key: 'lmsuserid'
            }
          },
          createdAt: {
            type: DataTypes.DATE,
            defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
            allowNull: true,
          },
          updatedAt: {
            type: DataTypes.DATE,
            defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
            allowNull: true,
          },
        },
        {
          transaction: transaction,
        }
      );
      return await queryInterface.addIndex(
        "lmsusers_roles",
        ["roleid", "lmsuserid"],
        {
          transaction,
        }
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("lmsusers_roles", { transaction });
    }),
};
