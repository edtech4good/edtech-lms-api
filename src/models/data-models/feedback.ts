/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import { schoolusers } from './schoolusers';
export interface feedbackAttributes {
  feedbackid: string;
  feedback: object;
  image: object;
  feedback3meta?: object;
  teachername: string;
  isdeleted?: Boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
  schooluser?: schoolusers;
  schoolname?: string;
  curriculumid?: string;
  curriculumname?: string;
}
export type feedbackPk = "feedbackid";
export type feedbackId = feedbacks[feedbackPk];
export type countriesOptionalAttributes = "feedback" | "isdeleted";
export type feedbackCreationAttributes = Optional<feedbackAttributes, countriesOptionalAttributes>;
export class feedbacks extends Model<feedbackAttributes, feedbackCreationAttributes> implements feedbackAttributes {
  feedbackid!: string;
  feedback!: object;
  image!: object;
  feedback3meta!: object;
  teachername!: string;
  isdeleted!: Boolean;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;
  schooluser!: schoolusers;
  schoolname!: string;
  curriculumid!: string;
  curriculumname!: string;
  static initModel(sequelize: Sequelize.Sequelize): typeof feedbacks {
    feedbacks.init({
      feedbackid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        primaryKey: true
      },
      feedback: {
        type: DataTypes.JSON,
        allowNull: false
      },
      image: {
        type: DataTypes.JSON,
        allowNull: false
      },
      feedback3meta: {
        type: DataTypes.JSON,
        allowNull: true
      },
      teachername: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      curriculumid: {
        type: DataTypes.STRING(36),
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
      tableName: 'feedbacks',
      charset: '',
      collate: '',
      timestamps: false,
      indexes: [
        {
          name: "PRIMARY",
          unique: true,
          using: "BTREE",
          fields: [
            { name: "feedbackid" },
          ]
        },
      ]
    });
    return feedbacks;
  }
}