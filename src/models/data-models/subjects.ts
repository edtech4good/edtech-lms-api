/* eslint-disable camelcase */
import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface subjectsAttributes {
  subjectid: string;
  subjectname: string;
  subjectstatus?: boolean;
  subjectdescription?: string;
  isdeleted?: boolean;
  countryid?: Array<string>;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type subjectsPk = "subjectid";
export type subjectsId = subjects[subjectsPk];
export type subjectsCreationAttributes = Optional<
  subjectsAttributes,
  subjectsPk
>;

export class subjects
  extends Model<subjectsAttributes, subjectsCreationAttributes>
  implements subjectsAttributes
{
  subjectid!: string;
  subjectname!: string;
  subjectstatus!: boolean;
  subjectdescription?: string;
  isdeleted!: boolean;
  created_at!: Date;
  created_by!: string;
  updated_at!: Date;
  updated_by!: string;
  deleted_at!: Date;
  deleted_by!: string;

  static initModel(sequelize: Sequelize.Sequelize): typeof subjects {
    subjects.init(
      {
        subjectid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        subjectname: {
          type: DataTypes.STRING(250),
          allowNull: false,
        },
        subjectstatus: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: 1,
        },
        subjectdescription: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        isdeleted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: 0,
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
      },
      {
        sequelize,
        tableName: "subjects",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "subjectid" }],
          },
        ],
      }
    );
    return subjects;
  }
}
