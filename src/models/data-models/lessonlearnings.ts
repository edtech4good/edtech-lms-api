/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import { documents, documentsId } from './documents';
import type { lessons, lessonsId } from './lessons';

export interface lessonlearningsAttributes {
  lessonlearningid: string;
  lessonlearningname: string;
  lessonlearningdescription: string;
  lessonlearningstatus: boolean;
  lessonid: string;
  lessonlearningorder: number;
  documentid: string;
  points?: number;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type lessonlearningsPk = "lessonlearningid";
export type lessonlearningsId = lessonlearnings[lessonlearningsPk];
export type lessonlearningsOptionalAttributes = "lessonlearningid" | "lessonlearningstatus";
export type lessonlearningsCreationAttributes = Optional<lessonlearningsAttributes, lessonlearningsOptionalAttributes>;

export class lessonlearnings extends Model<lessonlearningsAttributes, lessonlearningsCreationAttributes> implements lessonlearningsAttributes {
  lessonlearningid!: string;
  lessonlearningname!: string;
  lessonlearningdescription!: string;
  lessonlearningstatus!: boolean;
  lessonid!: string;
  lessonlearningorder!: number;
  documentid!: string;
  points!: number;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // lessonlearnings belongsTo lessons via lessonid
  lesson!: lessons;
  document!:documents;
  getLesson!: Sequelize.BelongsToGetAssociationMixin<lessons>;
  setLesson!: Sequelize.BelongsToSetAssociationMixin<lessons, lessonsId>;
  createLesson!: Sequelize.BelongsToCreateAssociationMixin<lessons>;

  getDocument!: Sequelize.BelongsToGetAssociationMixin<documents>;
  setDocument!: Sequelize.BelongsToSetAssociationMixin<documents, documentsId>;
  createDocument!: Sequelize.BelongsToCreateAssociationMixin<documents>;

  static initModel(sequelize: Sequelize.Sequelize): typeof lessonlearnings {
    lessonlearnings.init({
    lessonlearningid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      primaryKey: true
    },
    lessonlearningname: {
      type: DataTypes.STRING(250),
      allowNull: false
    },
    lessonlearningdescription: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    lessonlearningstatus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    lessonid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'lessons',
        key: 'lessonid'
      }
    },
    documentid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'documents',
        key: 'documentid'
      }
    },
    lessonlearningorder: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    points: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
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
    tableName: 'lessonlearnings',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "lessonlearningid" },
        ]
      },
      {
        name: "lessonid",
        using: "BTREE",
        fields: [
          { name: "lessonid" },
        ]
      },
    ]
  });
  return lessonlearnings;
  }
}
