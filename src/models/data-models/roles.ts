import * as Sequelize from "sequelize";
import { DataTypes, Model } from "sequelize";
import { lmsusers, lmsusersId } from "./lmsusers";
import { permissions, permissionsId } from "./permissions";

export interface rolesAttributes {
  roleid: string;
  rolename: string;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;

  perms?: string[];
}

export interface rolePermAttributes {
  roleid: string;
  permissionid: string;
}

export type rolePk = "roleid";
export type rolesId = roles[rolePk];

export class roles extends Model implements rolesAttributes {
  roleid!: string;
  rolename!: string;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // roles belongToMany permissions via roleid
  permissions!: permissions[];
  getPermissions!: Sequelize.BelongsToManyGetAssociationsMixin<permissions>;
  setPermissions!: Sequelize.BelongsToManySetAssociationsMixin<
    permissions,
    permissionsId
  >;
  addPermission!: Sequelize.BelongsToManyAddAssociationMixin<
    permissions,
    permissionsId
  >;
  addPermissions!: Sequelize.BelongsToManyAddAssociationsMixin<
    permissions,
    permissionsId
  >;
  createPermission!: Sequelize.BelongsToManyCreateAssociationMixin<permissions>;
  removePermission!: Sequelize.BelongsToManyRemoveAssociationMixin<
    permissions,
    permissionsId
  >;
  removePermissions!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    permissions,
    permissionsId
  >;
  hasPermission!: Sequelize.BelongsToManyHasAssociationMixin<
    permissions,
    permissionsId
  >;
  hasPermissions!: Sequelize.BelongsToManyHasAssociationsMixin<
    permissions,
    permissionsId
  >;
  countPermissions!: Sequelize.BelongsToManyCountAssociationsMixin;

  // roles belongToMany lmsusers via roleid
  lmsusers!: lmsusers[];
  getLmsusers!: Sequelize.BelongsToManyGetAssociationsMixin<lmsusers>;
  setLmsusers!: Sequelize.BelongsToManySetAssociationsMixin<
    lmsusers,
    lmsusersId
  >;
  addLmsuser!: Sequelize.BelongsToManyAddAssociationMixin<lmsusers, lmsusersId>;
  addLmsusers!: Sequelize.BelongsToManyAddAssociationsMixin<
    lmsusers,
    lmsusersId
  >;
  createLmsuser!: Sequelize.BelongsToManyCreateAssociationMixin<lmsusers>;
  removeLmsuser!: Sequelize.BelongsToManyRemoveAssociationMixin<
    lmsusers,
    lmsusersId
  >;
  removeLmsusers!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    lmsusers,
    lmsusersId
  >;
  hasLmsuser!: Sequelize.BelongsToManyHasAssociationMixin<lmsusers, lmsusersId>;
  hasLmsusers!: Sequelize.BelongsToManyHasAssociationsMixin<
    lmsusers,
    lmsusersId
  >;
  countLmsusers!: Sequelize.BelongsToManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof roles {
    roles.init(
      {
        roleid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        rolename: {
          type: DataTypes.STRING(45),
          allowNull: false,
        },
        created_at: {
          type: "TIMESTAMP",
          defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
          allowNull: true,
        },
        updated_at: {
          type: "TIMESTAMP",
          defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
          allowNull: true,
        },
        created_by: {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        updated_by: {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        deleted_at: {
          type: "TIMESTAMP",
          allowNull: true,
        },
        deleted_by: {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
      },
      {
        sequelize,
        charset: "latin1",
        collate: "latin1_swedish_ci",
        tableName: "roles",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "roleid" }],
          },
        ],
      }
    );
    return roles;
  }
}
