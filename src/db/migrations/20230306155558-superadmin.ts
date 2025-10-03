import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration changes
          await queryInterface.addColumn(
            "lmsusers",
            "type",
            {
              type: DataTypes.INTEGER.UNSIGNED,
              allowNull: true,
              defaultValue: 1
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.sequelize.query("INSERT INTO `lmsusers` (`lmsuserid`, `lmsusername`, `lmsuserpasswordhash`, `firstname`, `lmsuserrole`, `isverified`, `isdisabled`, `created_at`, `type`) VALUES ('5ec8814c-4390-40e3-8d93-828adca9aa08', 'superadmin@superadmin.com', '36237ee4e2207807adde67236d2dc7bd', 'superadmin', 'Mapyr2Pw', '1', '0', '2023-01-19 02:55:08', '0');");
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration undo changes
          await queryInterface.removeColumn("studentprogress", "scores", {
            transaction,
          });
          await queryInterface.sequelize.query("DELETE FROM `lmsusers` WHERE (`lmsuserid` = '5ec8814c-4390-40e3-8d93-828adca9aa08');");
        }
    )
};