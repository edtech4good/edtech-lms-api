import * as Sequelize from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { permissionstitle, permissionsTitleId } from './permissionstitle';
import { roles, rolesId } from './roles';

export interface permissionsAttributes {
  permissionid: string;
  permissionname: string;
  permissiondesc: string;
  permissiontitleid: string;
  type?: number;
}

export type permissionsPk = "permissionid";
export type permissionsId = permissions[permissionsPk];

export class permissions extends Model implements permissionsAttributes {
  permissionid!: string;
  permissionname!: string;
  permissiondesc!: string;
  permissiontitleid!: string;
  type?: number;
  createdAt!: Date;

  // permissions belongToMany roles via roleid
  roles!: roles[];
  getRoles!: Sequelize.BelongsToManyGetAssociationsMixin<roles>;
  setRoles!: Sequelize.BelongsToManySetAssociationsMixin<roles, rolesId>;
  addRole!: Sequelize.BelongsToManyAddAssociationMixin<roles, rolesId>;
  addRoles!: Sequelize.BelongsToManyAddAssociationsMixin<roles, rolesId>;
  createRole!: Sequelize.BelongsToManyCreateAssociationMixin<roles>;
  removeRole!: Sequelize.BelongsToManyRemoveAssociationMixin<roles, rolesId>;
  removeRoles!: Sequelize.BelongsToManyRemoveAssociationsMixin<roles, rolesId>;
  hasRole!: Sequelize.BelongsToManyHasAssociationMixin<roles, rolesId>;
  hasRoles!: Sequelize.BelongsToManyHasAssociationsMixin<roles, rolesId>;
  countRoles!: Sequelize.BelongsToManyCountAssociationsMixin;

  // permissions belongsTo permissionstitle via permissionstitleid
  permissionstitle!: permissionstitle;
  getPermissionstitle!: Sequelize.BelongsToGetAssociationMixin<permissionstitle>;
  setPermissionstitle!: Sequelize.BelongsToSetAssociationMixin<permissionstitle, permissionsTitleId>;
  createPermissionstitle!: Sequelize.BelongsToCreateAssociationMixin<permissionstitle>;

  static initModel(sequelize: Sequelize.Sequelize): typeof permissions {
    permissions.init({
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
    type: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
  }, {
    sequelize,
    tableName: 'permissions',
    charset: 'latin1',
    collate: 'latin1_swedish_ci',
    timestamps: true,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "permissionid" },
        ]
      },
    ]
  });
  return permissions;
  }
}
