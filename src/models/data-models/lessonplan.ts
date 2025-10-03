/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import { documents, documentsId } from './documents';
import type { lessons, lessonsId } from './lessons';

export interface lessonplansAttributes {
  lessonplanid: string;
  lessonplanname: string;
  lessonplandescription: string;
  lessonplanstatus: boolean;
  lessonid: string;
  lessonplanorder: number;
  documentid: string;
  points?: number;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type lessonplansPk = "lessonplanid";
export type lessonplansId = lessonplans[lessonplansPk];
export type lessonplansOptionalAttributes = "lessonplanid" | "lessonplanstatus";
export type lessonplansCreationAttributes = Optional<lessonplansAttributes, lessonplansOptionalAttributes>;

export class lessonplans extends Model<lessonplansAttributes, lessonplansCreationAttributes> implements lessonplansAttributes {
  lessonplanid!: string;
  lessonplanname!: string;
  lessonplandescription!: string;
  lessonplanstatus!: boolean;
  lessonid!: string;
  lessonplanorder!: number;
  documentid!: string;
  points!: number;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // lessonplans belongsTo lessons via lessonid
  lesson!: lessons;
  document!:documents;
  getLesson!: Sequelize.BelongsToGetAssociationMixin<lessons>;
  setLesson!: Sequelize.BelongsToSetAssociationMixin<lessons, lessonsId>;
  createLesson!: Sequelize.BelongsToCreateAssociationMixin<lessons>;

  getDocument!: Sequelize.BelongsToGetAssociationMixin<documents>;
  setDocument!: Sequelize.BelongsToSetAssociationMixin<documents, documentsId>;
  createDocument!: Sequelize.BelongsToCreateAssociationMixin<documents>;

  static initModel(sequelize: Sequelize.Sequelize): typeof lessonplans {
    lessonplans.init({
    lessonplanid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      primaryKey: true
    },
    lessonplanname: {
      type: DataTypes.STRING(250),
      allowNull: false
    },
    lessonplandescription: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    lessonplanstatus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    lessonid: {
      type: DataTypes.STRING(36),
      allowNull: false,
    },
    documentid: {
      type: DataTypes.STRING(36),
      allowNull: false,
    },
    lessonplanorder: {
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
    tableName: 'lessonplans',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "lessonplanid" },
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
  return lessonplans;
  }
}
