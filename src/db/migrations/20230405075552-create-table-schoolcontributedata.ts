import { QueryInterface, DataTypes } from 'sequelize';
import * as Sequelize from "sequelize";

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
            await queryInterface.createTable(
                "schoolcontributedata",
                {
                    schoolcontributeid: {
                        type: DataTypes.STRING(36),
                        allowNull: false,
                        primaryKey: true
                    },
                    expected: {
                        type: DataTypes.DOUBLE.UNSIGNED,
                        allowNull: true,
                        defaultValue: null,
                    },
                    actual: {
                        type: DataTypes.DOUBLE.UNSIGNED,
                        allowNull: true,
                        defaultValue: null
                    },
                    schoolname: {
                        type: DataTypes.STRING(45),
                        allowNull: false,
                    },
                    schoolid: {
                        type: DataTypes.STRING(36),
                        allowNull: true,
                        defaultValue: null
                    },
                    countryid: {
                        type: DataTypes.STRING(36),
                        allowNull: true,
                        defaultValue: null
                    },
                    isdeleted: {
                        type: DataTypes.BOOLEAN,
                        allowNull: false,
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
            return await queryInterface.addIndex("schoolcontributedata", ["schoolcontributeid"], {
                transaction,
            });
        }),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
            await queryInterface.dropTable("schoolcontributedata", { transaction });
        }
    )
};