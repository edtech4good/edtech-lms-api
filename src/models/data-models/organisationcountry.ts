import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { countries } from "./countries";
import { organisations } from "./organisations";

export interface organisationcountryAttributes {
  organisationcountryid: string;
  organisationid: string;
  countryid: string;
}

export type organisationcountryPk = "organisationcountryid";
export type organisationcountryId = organisationcountry[organisationcountryPk];
export type organisationcountryCreationAttributes = Optional<
  organisationcountryAttributes,
  organisationcountryPk
>;

export class organisationcountry
  extends Model<
    organisationcountryAttributes,
    organisationcountryCreationAttributes
  >
  implements organisationcountryAttributes
{
  organisationcountryid!: string;
  organisationid!: string;
  countryid!: string;

  // organisationcountry belongsTo organisations via organisationid
  organisation!: organisations;
  // organisationcountry belongsTo countries via countryid
  country!: countries;

  static initModel(sequelize: Sequelize.Sequelize): typeof organisationcountry {
    organisationcountry.init(
      {
        organisationcountryid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        organisationid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: {
            model: "organisations",
            key: "organisationid",
          },
        },
        countryid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: {
            model: "countries",
            key: "countryid",
          },
        },
      },
      {
        sequelize,
        tableName: "organisationcountry",
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "organisationcountryid" }],
          },
          {
            name: "organisationcountry_organisation_country_unique",
            unique: true,
            using: "BTREE",
            fields: [{ name: "organisationid" }, { name: "countryid" }],
          },
        ],
      }
    );
    return organisationcountry;
  }
}
