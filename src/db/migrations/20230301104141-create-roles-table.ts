import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.createTable(
            "roles",
            {
              roleid: {
                type: DataTypes.STRING(36),
                allowNull: false,
                primaryKey: true
              },
              rolename: {
                  type: DataTypes.STRING(45),
                  allowNull: false
              },
              created_at: {
                type: DataTypes.DATE,
                defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
                allowNull: true
              },
              updated_at: {
                type: DataTypes.DATE,
                defaultValue: queryInterface.sequelize.Sequelize.fn("NOW"),
                allowNull: true
              },
              created_by: {
                type: DataTypes.STRING(36),
                allowNull: true
              },
              updated_by: {
                type: DataTypes.STRING(36),
                allowNull: true
              },
              deleted_at: {
                type: 'TIMESTAMP',
                allowNull: true
              },
              deleted_by: {
                type: DataTypes.STRING(36),
                allowNull: true
              }
            },
            {
              transaction: transaction,
            }
          );
          return await queryInterface.addIndex(
            "roles",
            ["roleid"],
            {
              transaction,
            }
          );
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.dropTable("roles", { transaction });
        }
    )
};