/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface questiontagsAttributes {
  questiontagid: string;
  questiontagname: string;
  isdeleted: Boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type questiontagsPk = "questiontagid";
export type questiontagsId = questiontags[questiontagsPk];
export type questiontagsOptionalAttributes = "questiontagid" | "isdeleted";
export type questiontagsCreationAttributes = Optional<questiontagsAttributes, questiontagsOptionalAttributes>;

export class questiontags extends Model<questiontagsAttributes, questiontagsCreationAttributes> implements questiontagsAttributes {
  questiontagid!: string;
  questiontagname!: string;
  isdeleted!: Boolean;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // questiontags hasMany questiontagmap via questiontagid

  countQuestiontagmaps!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof questiontags {
    questiontags.init({
      questiontagid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        primaryKey: true
      },
      questiontagname: {
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
      tableName: 'questiontags',
      timestamps: false,
      indexes: [
        {
          name: "PRIMARY",
          unique: true,
          using: "BTREE",
          fields: [
            { name: "questiontagid" },
          ]
        },
      ]
    });
    return questiontags;
  }
}
