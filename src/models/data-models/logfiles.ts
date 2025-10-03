/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface logfilesAttributes {
  logfileid: string;
  parentfileid?: string;
  logfilename: string;
  logfilemeta?: object;
  type: number;
  isdeleted: Boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type logfilesPk = "logfileid";
export type logfilesId = logfiles[logfilesPk];
export type logfilesOptionalAttributes = "logfileid" | "isdeleted";
export type logfilesCreationAttributes = Optional<logfilesAttributes, logfilesOptionalAttributes>;

export class logfiles extends Model<logfilesAttributes, logfilesCreationAttributes> implements logfilesAttributes {
  logfileid!: string;
  parentfileid!: string;
  logfilename!: string;
  logfilemeta!: object;
  type!: number;
  isdeleted!: Boolean;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  // logfiles hasMany logfilemap via logfileid

  countQuestiontagmaps!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof logfiles {
    logfiles.init({
      logfileid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        primaryKey: true
      },
      parentfileid: {
        type: DataTypes.STRING(36),
        allowNull: true,
      },
      logfilename: {
        type: DataTypes.STRING(45),
        allowNull: false
      },
      logfilemeta: {
        type: DataTypes.JSON,
        allowNull: true
      },
      type: {
        type: DataTypes.TINYINT,
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
      tableName: 'logfiles',
      timestamps: false,
      indexes: [
        {
          name: "PRIMARY",
          unique: true,
          using: "BTREE",
          fields: [
            { name: "logfileid" },
          ]
        },
      ]
    });
    return logfiles;
  }
}
