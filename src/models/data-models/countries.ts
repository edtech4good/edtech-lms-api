/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface countriesAttributes {
  countryid: string;
  countryname: string;
  expectedusage?: number;
  isdeleted: Boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type countriesPk = "countryid";
export type countriesId = countries[countriesPk];
export type countriesOptionalAttributes = "countryid" | "isdeleted";
export type countriesCreationAttributes = Optional<countriesAttributes, countriesOptionalAttributes>;

export class countries extends Model<countriesAttributes, countriesCreationAttributes> implements countriesAttributes {
  countryid!: string;
  countryname!: string;
  expectedusage!: number;
  isdeleted!: Boolean;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // countries hasMany countrymap via countryid

  static initModel(sequelize: Sequelize.Sequelize): typeof countries {
    countries.init({
      countryid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        primaryKey: true
      },
      countryname: {
        type: DataTypes.STRING(45),
        allowNull: false
      },
      expectedusage: {
        type: DataTypes.DOUBLE.UNSIGNED,
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
      tableName: 'countries',
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      timestamps: false,
      indexes: [
        {
          name: "PRIMARY",
          unique: true,
          using: "BTREE",
          fields: [
            { name: "countryid" },
          ]
        },
      ]
    });
    return countries;
  }
}
