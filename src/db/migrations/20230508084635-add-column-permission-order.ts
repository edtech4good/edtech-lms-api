import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration changes
          await queryInterface.addColumn(
            "permissionstitle",
            "permissiontitleorder",
            {
              type: DataTypes.INTEGER,
              allowNull: true,
              defaultValue: 0
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "permissionstitle",
            "type",
            {
              type: DataTypes.TINYINT,
              allowNull: true,
              defaultValue: 1
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "permissionstitle",
            "parentid",
            {
              type: DataTypes.UUID,
              allowNull: true,
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "permissions",
            "type",
            {
              type: DataTypes.TINYINT,
              allowNull: true,
              defaultValue: 0
            },
            {
              transaction: transaction,
            }
          );
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration undo changes
          await queryInterface.removeColumn("permissionstitle", "permissiontitleorder", {
            transaction,
          });
          await queryInterface.removeColumn("permissionstitle", "type", {
            transaction,
          });
          await queryInterface.removeColumn("permissionstitle", "parentid", {
            transaction,
          });
          await queryInterface.removeColumn("permissions", "type", {
            transaction,
          });
        }
    )
};