import * as Sequelize from "sequelize";
import { DataTypes, Model } from "sequelize";

/**
 * A translation of one learner-visible text of a content row (design note: bilingual content). The row's own column
 * keeps the organisation's base-language text (`organisations.contentlanguage`); this row carries the same text in
 * another `language`, with the sha-256 of the base text it translated (`sourcehash`: a translation whose base text has
 * since changed is stale, and the student API does not serve it).
 *
 * `(tablename, rowid)` names the content row (polymorphic: no foreign key); `field` names the text; `subkey` names the
 * option, matching partner or distractor id, or the feedback message key, and is `''` (never NULL: MySQL treats NULLs
 * in a unique key as distinct) when the field has none. Hard-deleted, never soft. The allow-lists, the answer-bearing
 * fields and the hash are in `src/constants/content-translations.ts`, which is the student API's file byte for byte.
 */
export interface contenttranslationsAttributes {
  translationid: string;
  organisationid: string;
  tablename: string;
  rowid: string;
  field: string;
  subkey: string;
  language: string;
  text: string;
  sourcehash: string;
  lastupdated: Date;
}

export type contenttranslationsPk = "translationid";
export type contenttranslationsId = contenttranslations[contenttranslationsPk];
export type contenttranslationsCreationAttributes = contenttranslationsAttributes;

export class contenttranslations
  extends Model<contenttranslationsAttributes, contenttranslationsCreationAttributes>
  implements contenttranslationsAttributes
{
  translationid!: string;
  organisationid!: string;
  tablename!: string;
  rowid!: string;
  field!: string;
  subkey!: string;
  language!: string;
  text!: string;
  sourcehash!: string;
  lastupdated!: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof contenttranslations {
    contenttranslations.init(
      {
        translationid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
        organisationid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: { model: "organisations", key: "organisationid" },
        },
        tablename: { type: DataTypes.STRING(40), allowNull: false },
        rowid: { type: DataTypes.STRING(36), allowNull: false },
        field: { type: DataTypes.STRING(64), allowNull: false },
        subkey: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "" },
        language: { type: DataTypes.STRING(8), allowNull: false },
        text: { type: DataTypes.TEXT, allowNull: false },
        sourcehash: { type: DataTypes.CHAR(64), allowNull: false },
        lastupdated: { type: DataTypes.DATE(3), allowNull: false },
      },
      {
        sequelize,
        tableName: "contenttranslations",
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci",
        timestamps: false,
        indexes: [
          { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "translationid" }] },
          {
            name: "contenttranslations_parent_language_unique",
            unique: true,
            using: "BTREE",
            fields: [{ name: "tablename" }, { name: "rowid" }, { name: "field" }, { name: "subkey" }, { name: "language" }],
          },
          { name: "contenttranslations_organisationid", using: "BTREE", fields: [{ name: "organisationid" }] },
          { name: "contenttranslations_table_row", using: "BTREE", fields: [{ name: "tablename" }, { name: "rowid" }] },
        ],
      },
    );
    return contenttranslations;
  }
}
