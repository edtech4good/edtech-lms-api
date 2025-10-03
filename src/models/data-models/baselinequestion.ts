import {DataTypes, Model, Optional} from "sequelize";
import * as Sequelize from "sequelize";

export interface baselinequestionAttributes {
    baselinequestionid?: string;
    curriculumbaselineid?: string;
    questionid?: string;
    baselinequestionstatus?: boolean;
    baselinequestionorder?: number;
    isdeleted?: Boolean;
    created_at?: Date;
    created_by?: string;
    updated_at?: Date;
    updated_by?: string;
    deleted_at?: Date;
    deleted_by?: string;
}

export type baselinequestionPk = "baselinequestionid";
export type baselinequestionId = baselinequestion[baselinequestionPk];
export type baselinequestionOptionalAttributes = "baselinequestionid" | "isdeleted";
export type baselinequestionCreationAttributes = Optional<baselinequestionAttributes, baselinequestionOptionalAttributes>;
export class baselinequestion extends Model<baselinequestionAttributes, baselinequestionCreationAttributes> implements baselinequestionAttributes {
  baselinequestionid?: string;
  curriculumbaselineid?: string;
  questionid?: string;
  baselinequestionstatus?: boolean;
  baselinequestionorder?: number;
  isdeleted?: Boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
  question: any;
  curriculumbaseline: any;

  static initModel(sequelize: Sequelize.Sequelize): typeof baselinequestion {
    baselinequestion.init({
      baselinequestionid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true
      },
      curriculumbaselineid: {
        type: DataTypes.STRING(36),
        allowNull: true,
        defaultValue: null
      },
      questionid: {
        type: DataTypes.STRING(36),
        allowNull: true,
        defaultValue: null,
      },
      baselinequestionstatus: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: 0,
      },
      baselinequestionorder:{
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
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
      tableName: 'baselinequestion',
      timestamps: false,
      indexes: [
          {
              name: "PRIMARY",
              unique: true,
              using: "BTREE",
              fields: [
                  { name: "baselinequestionid" },
              ]
          },
      ]
  });
  return baselinequestion;
  }
}