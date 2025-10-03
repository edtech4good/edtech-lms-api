/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface documenttagsAttributes {
  documenttagid: string;
  documenttagname: string;
  isdeleted: Boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type documenttagsPk = "documenttagid";
export type documenttagsId = documenttags[documenttagsPk];
export type documenttagsOptionalAttributes = "documenttagid" | "isdeleted";
export type documenttagsCreationAttributes = Optional<documenttagsAttributes, documenttagsOptionalAttributes>;

export class documenttags extends Model<documenttagsAttributes, documenttagsCreationAttributes> implements documenttagsAttributes {
  documenttagid!: string;
  documenttagname!: string;
  isdeleted!: Boolean;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;


  static initModel(sequelize: Sequelize.Sequelize): typeof documenttags {
    documenttags.init({
    documenttagid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      primaryKey: true
    },
    documenttagname: {
      type: DataTypes.STRING(45),
      allowNull: false
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
    tableName: 'documenttags',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "documenttagid" },
        ]
      },
    ]
  });
  return documenttags;
  }
}
