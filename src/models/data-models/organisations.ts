/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface organisationsAttributes {
  organisationid: string;
  organisationname: string;
  organisationcode: string;
  organisationshortname: string;
  organisationpreset: string;
  organisationstatus?: boolean;
  uitheme?: string;
  brandingconfig?: object | null;
  settingsconfig?: object | null;
  isdeleted?: Boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type organisationsPk = "organisationid";
export type organisationsId = organisations[organisationsPk];
export type organisationsOptionalAttributes =
  | "organisationid"
  | "organisationstatus"
  | "uitheme"
  | "brandingconfig"
  | "settingsconfig"
  | "isdeleted";
export type organisationsCreationAttributes = Optional<organisationsAttributes, organisationsOptionalAttributes>;

export class organisations extends Model<organisationsAttributes, organisationsCreationAttributes> implements organisationsAttributes {
  organisationid!: string;
  organisationname!: string;
  organisationcode!: string;
  organisationshortname!: string;
  organisationpreset!: string;
  organisationstatus!: boolean;
  uitheme!: string;
  brandingconfig!: object | null;
  settingsconfig!: object | null;
  isdeleted!: Boolean;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  static initModel(sequelize: Sequelize.Sequelize): typeof organisations {
    organisations.init({
      organisationid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        primaryKey: true
      },
      organisationname: {
        // Unique among live rows only, and compared accent-sensitively
        // (utf8mb4_0900_as_ci): see migration 20261001120000.
        type: DataTypes.STRING(250),
        allowNull: false
      },
      organisationcode: {
        type: DataTypes.STRING(16),
        allowNull: false,
        unique: true
      },
      organisationshortname: {
        type: DataTypes.STRING(12),
        allowNull: false
      },
      organisationpreset: {
        type: DataTypes.STRING(16),
        allowNull: false
      },
      organisationstatus: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      uitheme: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'kids'
      },
      brandingconfig: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null
      },
      settingsconfig: {
        type: DataTypes.JSON,
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
      tableName: 'organisations',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: false,
      indexes: [
        {
          name: "PRIMARY",
          unique: true,
          using: "BTREE",
          fields: [
            { name: "organisationid" },
          ]
        },
      ]
    });
    return organisations;
  }
}
