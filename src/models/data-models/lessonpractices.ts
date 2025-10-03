/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { lessonpracticequestions, lessonpracticequestionsId } from './lessonpracticequestions';
import type { lessons, lessonsId } from './lessons';

export interface lessonpracticesAttributes {
  lessonpracticeid: string;
  lessonid: string;
  lessonpracticeorder: number;
  points?: number;
  lessonpracticestatus: boolean;
  lessonpracticename: string;
  lessonpracticedescription: string;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type lessonpracticesPk = "lessonpracticeid";
export type lessonpracticesId = lessonpractices[lessonpracticesPk];
export type lessonpracticesOptionalAttributes = "lessonpracticeid" | "lessonpracticestatus";
export type lessonpracticesCreationAttributes = Optional<lessonpracticesAttributes, lessonpracticesOptionalAttributes>;

export class lessonpractices extends Model<lessonpracticesAttributes, lessonpracticesCreationAttributes> implements lessonpracticesAttributes {
  lessonpracticeid!: string;
  lessonid!: string;
  lessonpracticeorder!: number;
  points!: number;
  lessonpracticestatus!: boolean;
  lessonpracticename!: string;
  lessonpracticedescription!: string;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // lessonpractices hasMany lessonpracticequestions via lessonpracticeid
  lessonpracticequestions!: lessonpracticequestions[];
  getLessonpracticequestions!: Sequelize.HasManyGetAssociationsMixin<lessonpracticequestions>;
  setLessonpracticequestions!: Sequelize.HasManySetAssociationsMixin<lessonpracticequestions, lessonpracticequestionsId>;
  addLessonpracticequestion!: Sequelize.HasManyAddAssociationMixin<lessonpracticequestions, lessonpracticequestionsId>;
  addLessonpracticequestions!: Sequelize.HasManyAddAssociationsMixin<lessonpracticequestions, lessonpracticequestionsId>;
  createLessonpracticequestion!: Sequelize.HasManyCreateAssociationMixin<lessonpracticequestions>;
  removeLessonpracticequestion!: Sequelize.HasManyRemoveAssociationMixin<lessonpracticequestions, lessonpracticequestionsId>;
  removeLessonpracticequestions!: Sequelize.HasManyRemoveAssociationsMixin<lessonpracticequestions, lessonpracticequestionsId>;
  hasLessonpracticequestion!: Sequelize.HasManyHasAssociationMixin<lessonpracticequestions, lessonpracticequestionsId>;
  hasLessonpracticequestions!: Sequelize.HasManyHasAssociationsMixin<lessonpracticequestions, lessonpracticequestionsId>;
  countLessonpracticequestions!: Sequelize.HasManyCountAssociationsMixin;
  // lessonpractices belongsTo lessons via lessonid
  lesson!: lessons;
  getLesson!: Sequelize.BelongsToGetAssociationMixin<lessons>;
  setLesson!: Sequelize.BelongsToSetAssociationMixin<lessons, lessonsId>;
  createLesson!: Sequelize.BelongsToCreateAssociationMixin<lessons>;

  static initModel(sequelize: Sequelize.Sequelize): typeof lessonpractices {
    lessonpractices.init({
    lessonpracticeid: {
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
    lessonpracticeorder: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    lessonpracticestatus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    lessonpracticename: {
      type: DataTypes.STRING(250),
      allowNull: false
    },
    lessonpracticedescription: {
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
    tableName: 'lessonpractices',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "lessonpracticeid" },
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
  return lessonpractices;
  }
}
