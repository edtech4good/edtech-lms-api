import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { curriculums } from "./curriculums";

export interface curriculumbaselineAttributes {
  curriculumbaselineid: string;
  curriculumid: string;
  baselineid: string;
  baselinename: string;
  baselinetype: number;
  baselinestatus: boolean;
  startdate: Date;
  enddate: Date;
  schoolid: Array<string>;
  isdeleted?: boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;
}

export type curriculumbaselinePk = "curriculumbaselineid";
export type curriculumbaselineId = curriculumbaseline[curriculumbaselinePk];
export type curriculumbaselineCreationAttributes = Optional<
  curriculumbaselineAttributes,
  curriculumbaselinePk
>;

export class curriculumbaseline
  extends Model<
    curriculumbaselineAttributes,
    curriculumbaselineCreationAttributes
  >
  implements curriculumbaselineAttributes
{
  curriculumbaselineid!: string;
  curriculumid!: string;
  baselineid!: string;
  baselinename!: string;
  baselinetype!: number;
  baselinestatus!: boolean;
  startdate!: Date;
  enddate!: Date;
  schoolid!: Array<string>;
  isdeleted?: boolean;
  created_at?: Date;
  created_by?: string;
  updated_at?: Date;
  updated_by?: string;
  deleted_at?: Date;
  deleted_by?: string;

  // curriculumbaseline belongsTo curriculums via curriculumid
  curriculum!: curriculums;
  // curriculumbaseline belongsTo curriculums via baselineid
  baseline!: curriculums;
  curriculumbaseline: any;

  static initModel(sequelize: Sequelize.Sequelize): typeof curriculumbaseline {
    curriculumbaseline.init(
      {
        curriculumbaselineid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        curriculumid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          // references: {
          //   model: "curriculums",
          //   key: "curriculumid",
          // },
        },
        baselineid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          // references: {
          //   model: "curriculums",
          //   key: "curriculumid",
          // },
        },
        baselinename: {
          type: DataTypes.STRING(36),
          allowNull: true,
          // references: {
          //   model: "curriculums",
          //   key: "curriculumid",
          // },
        },
        baselinetype: {
          type: DataTypes.TINYINT,
          allowNull: true,
        },
        baselinestatus: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
        },
        startdate: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        enddate: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        schoolid: {
          type: DataTypes.JSON,
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
        tableName: "curriculumbaseline",
        timestamps: false,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "curriculumbaselineid" }],
          },
        ],
      }
    );
    return curriculumbaseline;
  }
}
