import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

/**
 * The documents an item references beyond its primary one (`lessonlearnings.documentid`): a rendition or an asset, in
 * order. No audit columns. Empty until an item type uses it.
 */
export interface lessonlearningdocumentsAttributes {
  lessonlearningdocumentid: string;
  lessonlearningid: string;
  documentid: string;
  lessonlearningdocumentrole: string;
  lessonlearningdocumentorder: number;
}

export type lessonlearningdocumentsPk = "lessonlearningdocumentid";
export type lessonlearningdocumentsId = lessonlearningdocuments[lessonlearningdocumentsPk];
export type lessonlearningdocumentsCreationAttributes = Optional<
  lessonlearningdocumentsAttributes,
  lessonlearningdocumentsPk | "lessonlearningdocumentorder"
>;

export class lessonlearningdocuments
  extends Model<lessonlearningdocumentsAttributes, lessonlearningdocumentsCreationAttributes>
  implements lessonlearningdocumentsAttributes
{
  lessonlearningdocumentid!: string;
  lessonlearningid!: string;
  documentid!: string;
  lessonlearningdocumentrole!: string;
  lessonlearningdocumentorder!: number;

  static initModel(sequelize: Sequelize.Sequelize): typeof lessonlearningdocuments {
    lessonlearningdocuments.init(
      {
        lessonlearningdocumentid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        lessonlearningid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: {
            model: "lessonlearnings",
            key: "lessonlearningid",
          },
        },
        documentid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: {
            model: "documents",
            key: "documentid",
          },
        },
        lessonlearningdocumentrole: {
          type: DataTypes.STRING(16),
          allowNull: false,
        },
        lessonlearningdocumentorder: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
      },
      {
        sequelize,
        tableName: "lessonlearningdocuments",
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "lessonlearningdocumentid" }],
          },
          {
            name: "lessonlearningdocuments_item_document_unique",
            unique: true,
            using: "BTREE",
            fields: [{ name: "lessonlearningid" }, { name: "documentid" }],
          },
          {
            name: "lessonlearningdocuments_documentid",
            using: "BTREE",
            fields: [{ name: "documentid" }],
          },
        ],
      },
    );
    return lessonlearningdocuments;
  }
}
