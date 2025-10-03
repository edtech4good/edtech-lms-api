import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface databuildAttributes {
  databuildid: number;
  buildname: string;
  builddate: Date;
  builduser: string;
}

export type databuildPk = "databuildid";
export type databuildId = databuild[databuildPk];
export type databuildOptionalAttributes = "databuildid";
export type databuildCreationAttributes = Optional<databuildAttributes, databuildOptionalAttributes>;

export class databuild extends Model<databuildAttributes, databuildCreationAttributes> implements databuildAttributes {
  databuildid!: number;
  buildname!: string;
  builddate!: Date;
  builduser!: string;


  static initModel(sequelize: Sequelize.Sequelize): typeof databuild {
    databuild.init({
    databuildid: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    buildname: {
      type: DataTypes.STRING(45),
      allowNull: false
    },
    builddate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    builduser: {
      type: DataTypes.STRING(36),
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'databuild',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "databuildid" },
        ]
      },
    ]
  });
  return databuild;
  }
}
