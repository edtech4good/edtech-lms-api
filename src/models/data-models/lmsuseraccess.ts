import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface lmsuseraccessAttributes {
  userid: string;
  logintime: Date;
  ipaddress: string;
  useraccessid: string;
}

export type lmsuseraccessPk = "useraccessid";
export type lmsuseraccessId = lmsuseraccess[lmsuseraccessPk];
export type lmsuseraccessOptionalAttributes = "logintime" | "useraccessid";
export type lmsuseraccessCreationAttributes = Optional<lmsuseraccessAttributes, lmsuseraccessOptionalAttributes>;

export class lmsuseraccess extends Model<lmsuseraccessAttributes, lmsuseraccessCreationAttributes> implements lmsuseraccessAttributes {
  userid!: string;
  logintime!: Date;
  ipaddress!: string;
  useraccessid!: string;


  static initModel(sequelize: Sequelize.Sequelize): typeof lmsuseraccess {
    lmsuseraccess.init({
    userid: {
      type: DataTypes.STRING(45),
      allowNull: false
    },
    logintime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
    },
    ipaddress: {
      type: DataTypes.STRING(45),
      allowNull: false
    },
    useraccessid: {
      type: DataTypes.STRING(45),
      allowNull: false,
      primaryKey: true
    }
  }, {
    sequelize,
    tableName: 'lmsuseraccess',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "useraccessid" },
        ]
      },
    ]
  });
  return lmsuseraccess;
  }
}
