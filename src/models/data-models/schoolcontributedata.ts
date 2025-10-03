import {DataTypes, Model, Optional} from "sequelize";
import * as Sequelize from "sequelize";

export interface schoolcontributedataAttributes {
    schoolcontributeid?: string;
    expected?: number;
    actual?: number;
    schoolname?: string;
    schoolid?: string;
    countryid?: string;
    isdeleted?: Boolean;
    created_at?: Date;
    created_by?: string;
    updated_at?: Date;
    updated_by?: string;
    deleted_at?: Date;
    deleted_by?: string;
}

export type contributedataPk = "schoolcontributeid";
export type contributedataId = schoolcontributedata[contributedataPk];
export type contributedataOptionalAttributes = "schoolcontributeid" | "isdeleted";
export type contributedataCreationAttributes = Optional<schoolcontributedataAttributes, contributedataOptionalAttributes>;
export class schoolcontributedata extends Model<schoolcontributedataAttributes, contributedataCreationAttributes> implements schoolcontributedataAttributes {
    schoolcontributeid?: string;
    expected?: number;
    actual?: number;
    schoolname?: string;
    schoolid?: string;
    countryid?: string;
    isdeleted?: Boolean;
    created_at?: Date;
    created_by?: string;
    updated_at?: Date;
    updated_by?: string;
    deleted_at?: Date;
    deleted_by?: string;

    static initModel(sequelize: Sequelize.Sequelize): typeof schoolcontributedata {
        schoolcontributedata.init({
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
            countryid:{
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
        }, {
            sequelize,
            tableName: 'schoolcontributedata',
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [
                        { name: "schoolcontributeid" },
                    ]
                },
            ]
        });
        return schoolcontributedata;
    }
}