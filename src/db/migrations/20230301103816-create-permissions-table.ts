import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.createTable(
            "permissions",
            {
              permissionid: {
                type: DataTypes.STRING(36),
                allowNull: false,
                primaryKey: true
              },
              permissionname: {
                type: DataTypes.STRING(45),
                allowNull: false
              },
              permissiondesc: {
                type: DataTypes.TEXT,
                allowNull: true
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
              // permissiontitleid: {
              //   type: DataTypes.UUID,
              //   allowNull: true,
              //   primaryKey: true
              // },
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            'permissions', // name of Source model
            'permissiontitleid', // name of the key we're adding 
            {
              type: DataTypes.UUID,
              references: {
                model: 'permissionstitle', // name of Target model
                key: 'permissiontitleid', // key in Target model that we're referencing
              },
              onUpdate: 'CASCADE',
              onDelete: 'SET NULL',
            }
          );
          return await queryInterface.addIndex(
            "permissions",
            ["permissionid", "permissiontitleid"],
            {
              transaction,
            }
          );
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          await queryInterface.dropTable("permissions", { transaction });
        }
    )
};