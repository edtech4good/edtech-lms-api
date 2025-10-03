import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.createTable(
            "permissionstitle",
            {
              permissiontitleid: {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: true
              },
              permissiontitle: {
                  type: DataTypes.STRING(45),
                  allowNull: false
              },
              permissiondesc: {
                  type: DataTypes.STRING(45),
                  allowNull: false
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
            "permissionstitle",
            ["permissiontitleid"],
            {
              transaction,
            }
          );
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.dropTable("permissionstitle", { transaction });
        }
    )
};