/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import { rpiuseraccess } from './rpiuseraccess';
import { schools } from './school';
import { studentappusages } from './studentappusage';
import type { students, studentsId } from './students';

export interface schoolusersAttributes {
  schooluserid: string;
  schoolusername: string;
  schooluserpasswordhash: string;
  schooluserrole: number;
  schooluserstatus: number;
  schoolname?: string;
  isdisabled: boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;

  student?: students;
  rpiuseraccesses?: rpiuseraccess[];
  studentappusages?: studentappusages[];
}

export type schoolusersPk = "schooluserid";
export type schoolusersId = schoolusers[schoolusersPk];
export type schoolusersOptionalAttributes = "schooluserid" | "schooluserstatus" | "schoolname" | "isdisabled";
export type schoolusersCreationAttributes = Optional<schoolusersAttributes, schoolusersOptionalAttributes>;

export class schoolusers extends Model<schoolusersAttributes, schoolusersCreationAttributes> implements schoolusersAttributes {
  schooluserid!: string;
  schoolusername!: string;
  schooluserpasswordhash!: string;
  schooluserrole!: number;
  schooluserstatus!: number;
  schoolname?: string;
  isdisabled!: boolean;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // schoolusers hasMany students via schooluserid
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

  student?: students;

  school?: schools;

  static initModel(sequelize: Sequelize.Sequelize): typeof schoolusers {
    schoolusers.init({
    schooluserid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      primaryKey: true
    },
    schoolusername: {
      type: DataTypes.STRING(45),
      allowNull: false,
      unique: "schoolusername"
    },
    schooluserpasswordhash: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    schooluserrole: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    schooluserstatus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    schoolname: {
      type: DataTypes.STRING(250),
      allowNull: true
    },
    isdisabled: {
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
    tableName: 'schoolusers',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "schooluserid" },
        ]
      },
      {
        name: "schoolusername",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "schoolusername" },
        ]
      },
    ]
  });
  return schoolusers;
  }
}
