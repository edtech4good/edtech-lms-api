import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.createTable(
            "roles_permissions",
            {
              roleid: {
                type: DataTypes.STRING(36),
                references: {
                  model: 'roles',
                  key: 'roleid'
                }
              },
              permissionid: {
                type: DataTypes.STRING(36),
                references: {
                  model: 'permissions',
                  key: 'permissionid'
                }
              },
              createdAt: {
                type: DataTypes.DATE,
                defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
                allowNull: true
              },
              updatedAt: {
                type: DataTypes.DATE,
                defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
                allowNull: true
              },
            },
            {
              transaction: transaction,
            }
          );
          return await queryInterface.addIndex(
            "roles_permissions",
            ["roleid","permissionid"],
            {
              transaction,
            }
          );
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.dropTable("roles_permissions", { transaction });
        }
    )
};