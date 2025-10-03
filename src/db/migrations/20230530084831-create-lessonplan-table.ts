import { QueryInterface, DataTypes } from 'sequelize';
import * as Sequelize from "sequelize";

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
            return await queryInterface.createTable(
                "lessonplans",
                {
                  lessonplanid: {
                    type: DataTypes.STRING(36),
                    allowNull: false,
                    primaryKey: true
                  },
                  lessonplanname: {
                    type: DataTypes.STRING(250),
                    allowNull: false
                  },
                  lessonplandescription: {
                    type: DataTypes.TEXT,
                    allowNull: false
                  },
                  lessonplanstatus: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: 1
                  },
                  lessonid: {
                    type: DataTypes.STRING(36),
                    allowNull: false,
                  },
                  documentid: {
                    type: DataTypes.STRING(36),
                    allowNull: false,
                  },
                  lessonplanorder: {
                    type: DataTypes.INTEGER,
                    allowNull: false
                  },
                  points: {
                    type: DataTypes.INTEGER.UNSIGNED,
                    allowNull: true,
                    defaultValue: 0
                  },
                  created_at: {
                    type: 'TIMESTAMP',
                    defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP'),
                    allowNull: true
                  },
                  created_by: {
                    type: DataTypes.STRING(36),
                    allowNull: true
                  },
                  updated_at: {
                    type: 'TIMESTAMP',
                    defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP'),
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
        }),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
            await queryInterface.dropTable("lessonplans", { transaction });
        }
    )
};