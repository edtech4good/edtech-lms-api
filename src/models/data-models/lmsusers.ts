/* eslint-disable camelcase */
import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { roles, rolesId } from "./roles";

export interface lmsusersAttributes {
  lmsuserid: string;
  lmsusername: string;
  lmsuserpasswordhash: string;
  firstname: string;
  lastname?: string;
  lmsuserrole: string;
  isverified: boolean;
  verifykey?: string;
  isdisabled: boolean;
  passwordchangekey?: string;
  countries?: Array<string>;
  schools?: Array<string>;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;

  formattedroles?: string;
  roles?: roles[];
}

export type lmsusersPk = "lmsuserid";
export type lmsusersId = lmsusers[lmsusersPk];
export type lmsusersOptionalAttributes =
  | "lmsuserid"
  | "lastname"
  | "isverified"
  | "verifykey"
  | "isdisabled"
  | "passwordchangekey";
export type lmsusersCreationAttributes = Optional<
  lmsusersAttributes,
  lmsusersOptionalAttributes
>;

export class lmsusers
  extends Model<lmsusersAttributes, lmsusersCreationAttributes>
  implements lmsusersAttributes
{
  lmsuserid!: string;
  lmsusername!: string;
  lmsuserpasswordhash!: string;
  firstname!: string;
  lastname?: string;
  lmsuserrole!: string;
  isverified!: boolean;
  verifykey?: string;
  isdisabled!: boolean;
  passwordchangekey?: string;
  countries?: Array<string>;
  schools?: Array<string>;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // lmsusers belongToMany roles via roleid
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

  static initModel(sequelize: Sequelize.Sequelize): typeof lmsusers {
    lmsusers.init(
      {
        lmsuserid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        lmsusername: {
          type: DataTypes.STRING(45),
          allowNull: false,
        },
        lmsuserpasswordhash: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        firstname: {
          type: DataTypes.STRING(45),
          allowNull: false,
        },
        lastname: {
          type: DataTypes.STRING(45),
          allowNull: true,
        },
        lmsuserrole: {
          type: DataTypes.STRING(20),
          allowNull: false,
        },
        isverified: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: 0,
        },
        verifykey: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        isdisabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: 1,
        },
        passwordchangekey: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        countries: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        schools: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        created_at: {
          type: "TIMESTAMP",
          defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
          allowNull: true,
        },
        created_by: {
          type: DataTypes.STRING(36),
          allowNull: true,
        },
        updated_at: {
          type: "TIMESTAMP",
          defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
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
        tableName: "lmsusers",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "lmsuserid" }],
          },
        ],
      }
    );
    return lmsusers;
  }
}
