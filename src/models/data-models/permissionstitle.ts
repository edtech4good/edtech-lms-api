import * as Sequelize from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { permissions, permissionsId } from './permissions';

export interface permissionsTitleAttributes {
    permissiontitleid: string;
    permissiontitle: string;
    permissiondesc: string;
    permissiontitleorder?: number;
    type?: number;
    parentid?: string;

    // permissions: permissions[];
}

export type permissionsTitlePk = "permissiontitleid";
export type permissionsTitleId = permissionstitle[permissionsTitlePk];

export class permissionstitle extends Model implements permissionsTitleAttributes {
    permissiontitleid!: string;
    permissiontitle!: string;
    permissiondesc!: string;
    permissiontitleorder!: number;
    type?: number;
    parentid?: string;

    // permissionstitle hasMany permissions via permissionid
    permissions!: permissions[];
    getPermissions!: Sequelize.HasManyGetAssociationsMixin<permissions>;
    setPermissions!: Sequelize.HasManySetAssociationsMixin<permissions, permissionsId>;
    addPermission!: Sequelize.HasManyAddAssociationMixin<permissions, permissionsId>;
    addPermissions!: Sequelize.HasManyAddAssociationsMixin<permissions, permissionsId>;
    createPermission!: Sequelize.HasManyCreateAssociationMixin<permissions>;
    removePermission!: Sequelize.HasManyRemoveAssociationMixin<permissions, permissionsId>;
    removePermissions!: Sequelize.HasManyRemoveAssociationsMixin<permissions, permissionsId>;
    hasPermission!: Sequelize.HasManyHasAssociationMixin<permissions, permissionsId>;
    hasPermissions!: Sequelize.HasManyHasAssociationsMixin<permissions, permissionsId>;
    countPermissions!: Sequelize.HasManyCountAssociationsMixin;

    static initModel(sequelize: Sequelize.Sequelize): typeof permissionstitle {
        permissionstitle.init({
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
            permissiontitleorder: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: 0
            },
            type: {
                type: DataTypes.TINYINT,
                allowNull: true,
                defaultValue: 1
            },
            parentid: {
                type: DataTypes.UUID,
                allowNull: true,
            },
        }, {
            sequelize,
            charset: 'latin1',
            collate: 'latin1_swedish_ci',
            tableName: 'permissionstitle',
            timestamps: true,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [
                        { name: "permissiontitleid" },
                    ]
                },
            ]
        });
        return permissionstitle;
    }
}
