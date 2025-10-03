/* eslint-disable camelcase */
import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface syncsAttributes {
  syncid: string;
  filename: string;
  type: number;
  offlineonline: boolean;
  created_at?: Date;
  created_by?: string;
}

export type syncsPk = "syncid";
export type syncsId = syncs[syncsPk];
export type syncsOptionalAttributes = "syncid";
export type syncsCreationAttributes = Optional<syncsAttributes, syncsOptionalAttributes>;

export class syncs extends Model<syncsAttributes, syncsCreationAttributes> implements syncsAttributes {
  syncid!: string;
  filename!: string;
  type!: number;
  offlineonline!: boolean;
  created_at!: Date;
  created_by!: string;

  // syncs hasMany syncmap via syncid

  countQuestiontagmaps!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof syncs {
    syncs.init({
      syncid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        primaryKey: true
      },
      filename: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      type: {
        type: DataTypes.TINYINT,
        allowNull: false,
      },
      offlineonline: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      created_at: {
        type: 'TIMESTAMP',
        defaultValue: Sequelize.Sequelize.fn("NOW"),
        allowNull: true
      },
      created_by: {
        type: DataTypes.STRING(36),
        allowNull: true
      },
    }, {
      sequelize,
      tableName: 'syncrecords',
      timestamps: false,
      indexes: [
        {
          name: "PRIMARY",
          unique: true,
          using: "BTREE",
          fields: [
            { name: "syncid" },
          ]
        },
      ]
    });
    return syncs;
  }
}
