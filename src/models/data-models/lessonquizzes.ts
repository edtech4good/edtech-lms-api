/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { lessonquizquestions, lessonquizquestionsId } from './lessonquizquestions';
import type { lessons, lessonsId } from './lessons';

export interface lessonquizzesAttributes {
  lessonquizid: string;
  lessonid: string;
  lessonquizorder: number;
  points?: number;
  lessonquizname: string;
  lessonquizstatus: boolean;
  lessonquizdescription: string;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type lessonquizzesPk = "lessonquizid";
export type lessonquizzesId = lessonquizzes[lessonquizzesPk];
export type lessonquizzesOptionalAttributes = "lessonquizid" | "lessonquizstatus";
export type lessonquizzesCreationAttributes = Optional<lessonquizzesAttributes, lessonquizzesOptionalAttributes>;

export class lessonquizzes extends Model<lessonquizzesAttributes, lessonquizzesCreationAttributes> implements lessonquizzesAttributes {
  lessonquizid!: string;
  lessonid!: string;
  lessonquizorder!: number;
  points!: number;
  lessonquizname!: string;
  lessonquizstatus!: boolean;
  lessonquizdescription!: string;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // lessonquizzes hasMany lessonquizquestions via lessonquizid
  lessonquizquestions!: lessonquizquestions[];
  getLessonquizquestions!: Sequelize.HasManyGetAssociationsMixin<lessonquizquestions>;
  setLessonquizquestions!: Sequelize.HasManySetAssociationsMixin<lessonquizquestions, lessonquizquestionsId>;
  addLessonquizquestion!: Sequelize.HasManyAddAssociationMixin<lessonquizquestions, lessonquizquestionsId>;
  addLessonquizquestions!: Sequelize.HasManyAddAssociationsMixin<lessonquizquestions, lessonquizquestionsId>;
  createLessonquizquestion!: Sequelize.HasManyCreateAssociationMixin<lessonquizquestions>;
  removeLessonquizquestion!: Sequelize.HasManyRemoveAssociationMixin<lessonquizquestions, lessonquizquestionsId>;
  removeLessonquizquestions!: Sequelize.HasManyRemoveAssociationsMixin<lessonquizquestions, lessonquizquestionsId>;
  hasLessonquizquestion!: Sequelize.HasManyHasAssociationMixin<lessonquizquestions, lessonquizquestionsId>;
  hasLessonquizquestions!: Sequelize.HasManyHasAssociationsMixin<lessonquizquestions, lessonquizquestionsId>;
  countLessonquizquestions!: Sequelize.HasManyCountAssociationsMixin;
  // lessonquizzes belongsTo lessons via lessonid
  lesson!: lessons;
  getLesson!: Sequelize.BelongsToGetAssociationMixin<lessons>;
  setLesson!: Sequelize.BelongsToSetAssociationMixin<lessons, lessonsId>;
  createLesson!: Sequelize.BelongsToCreateAssociationMixin<lessons>;

  static initModel(sequelize: Sequelize.Sequelize): typeof lessonquizzes {
    lessonquizzes.init({
    lessonquizid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      primaryKey: true
    },
    lessonid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'lessons',
        key: 'lessonid'
      }
    },
    lessonquizorder: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    lessonquizname: {
      type: DataTypes.STRING(250),
      allowNull: false
    },
    lessonquizstatus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    lessonquizdescription: {
      type: DataTypes.TEXT,
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
    tableName: 'lessonquizzes',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "lessonquizid" },
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
  return lessonquizzes;
  }
}
