import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { curriculums } from "./curriculums";

export interface curriculumcountryAttributes {
  curriculumcountryid: string;
  curriculumid: string;
  countryid: string;
}

export type curriculumcountryPk = "curriculumcountryid";
export type curriculumcountryId = curriculumcountry[curriculumcountryPk];
export type curriculumcountryCreationAttributes = Optional<
  curriculumcountryAttributes,
  curriculumcountryPk
>;

export class curriculumcountry
  extends Model<
    curriculumcountryAttributes,
    curriculumcountryCreationAttributes
  >
  implements curriculumcountryAttributes
{
  curriculumcountryid!: string;
  curriculumid!: string;
  countryid!: string;

  // curriculumcountry belongsTo curriculums via curriculumid
  curriculum!: curriculums;
  // curriculumcountry belongsTo curriculums via countryid
  country!: curriculums;

  static initModel(sequelize: Sequelize.Sequelize): typeof curriculumcountry {
    curriculumcountry.init(
      {
        curriculumcountryid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        curriculumid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          // references: {
          //   model: "curriculums",
          //   key: "curriculumid",
          // },
        },
        countryid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          // references: {
          //   model: "curriculums",
          //   key: "curriculumid",
          // },
        },
      },
      {
        sequelize,
        tableName: "curriculumcountry",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "curriculumcountryid" }],
          },
        ],
      }
    );
    return curriculumcountry;
  }
}
