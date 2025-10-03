/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { curriculums, curriculumsId } from './curriculums';
import type { levels, levelsId } from './levels';
import { studentgradesprogress } from './studentgradesprogress';
import type { students, studentsId } from './students';

export interface gradesAttributes {
  gradeid: string;
  curriculumid: string;
  gradestatus: boolean;
  gradename: string;
  gradedescription?: string;
  gradeorder: number;
  isdeleted: boolean;
  passing_points?: number;
  points?: number;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;

  studentgradeprogress?: studentgradesprogress;
}

export type gradesPk = "gradeid";
export type gradesId = grades[gradesPk];
export type gradesOptionalAttributes = "gradeid" | "gradestatus" | "gradedescription" | "isdeleted";
export type gradesCreationAttributes = Optional<gradesAttributes, gradesOptionalAttributes>;

export class grades extends Model<gradesAttributes, gradesCreationAttributes> implements gradesAttributes {
  gradeid!: string;
  curriculumid!: string;
  gradestatus!: boolean;
  gradename!: string;
  gradedescription?: string;
  gradeorder!: number;
  isdeleted!: boolean;
  passing_points!: number;
  points!: number;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // grades belongsTo curriculums via curriculumid
  curriculum!: curriculums;
  getCurriculum!: Sequelize.BelongsToGetAssociationMixin<curriculums>;
  setCurriculum!: Sequelize.BelongsToSetAssociationMixin<curriculums, curriculumsId>;
  createCurriculum!: Sequelize.BelongsToCreateAssociationMixin<curriculums>;
  // grades hasMany levels via gradeid
  levels!: levels[];
  getLevels!: Sequelize.HasManyGetAssociationsMixin<levels>;
  setLevels!: Sequelize.HasManySetAssociationsMixin<levels, levelsId>;
  addLevel!: Sequelize.HasManyAddAssociationMixin<levels, levelsId>;
  addLevels!: Sequelize.HasManyAddAssociationsMixin<levels, levelsId>;
  createLevel!: Sequelize.HasManyCreateAssociationMixin<levels>;
  removeLevel!: Sequelize.HasManyRemoveAssociationMixin<levels, levelsId>;
  removeLevels!: Sequelize.HasManyRemoveAssociationsMixin<levels, levelsId>;
  hasLevel!: Sequelize.HasManyHasAssociationMixin<levels, levelsId>;
  hasLevels!: Sequelize.HasManyHasAssociationsMixin<levels, levelsId>;
  countLevels!: Sequelize.HasManyCountAssociationsMixin;
  // grades hasMany students via gradeid
  students!: students[];
  getStudents!: Sequelize.HasManyGetAssociationsMixin<students>;
  setStudents!: Sequelize.HasManySetAssociationsMixin<students, studentsId>;
  addStudent!: Sequelize.HasManyAddAssociationMixin<students, studentsId>;
  addStudents!: Sequelize.HasManyAddAssociationsMixin<students, studentsId>;
  createStudent!: Sequelize.HasManyCreateAssociationMixin<students>;
  removeStudent!: Sequelize.HasManyRemoveAssociationMixin<students, studentsId>;
  removeStudents!: Sequelize.HasManyRemoveAssociationsMixin<students, studentsId>;
  hasStudent!: Sequelize.HasManyHasAssociationMixin<students, studentsId>;
  hasStudents!: Sequelize.HasManyHasAssociationsMixin<students, studentsId>;
  countStudents!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof grades {
    grades.init({
    gradeid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      primaryKey: true
    },
    curriculumid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'curriculums',
        key: 'curriculumid'
      }
    },
    gradestatus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    gradename: {
      type: DataTypes.STRING(250),
      allowNull: false
    },
    gradedescription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    gradeorder: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    isdeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 0
    },
    passing_points: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      defaultValue: null
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
    tableName: 'grades',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "gradeid" },
        ]
      },
      {
        name: "curriculumid",
        using: "BTREE",
        fields: [
          { name: "curriculumid" },
        ]
      },
    ]
  });
  return grades;
  }
}
