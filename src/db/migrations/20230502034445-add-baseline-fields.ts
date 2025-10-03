import { QueryInterface, DataTypes } from 'sequelize';
import * as Sequelize from "sequelize";

module.exports = {
    up: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration changes
          await queryInterface.addColumn(
            "curriculumbaseline",
            "baselinename",
            {
              type: DataTypes.STRING(36),
              allowNull: true,
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "baselinetype",
            {
              type: DataTypes.TINYINT,
              allowNull: true,
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "baselinestatus",
            {
              type: DataTypes.BOOLEAN,
              allowNull: true,
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "startdate",
            {
              type: DataTypes.DATE,
              allowNull: true,
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "enddate",
            {
              type: DataTypes.DATE,
              allowNull: true,
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "schoolid",
            {
              type: DataTypes.JSON,
              allowNull: true,
            }, 
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "isdeleted",
            {
              type: DataTypes.BOOLEAN,
              allowNull: false,
              defaultValue: 0,
            }
          )
          await queryInterface.addColumn(
            "curriculumbaseline",
            "created_at",
            {
              type: 'TIMESTAMP',
              defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP'),
              allowNull: true
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "created_by",
            {
              type: DataTypes.STRING(36),
              allowNull: true
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "updated_at",
            {
              type: 'TIMESTAMP',
              defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP'),
              allowNull: true
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "updated_by",
            {
              type: DataTypes.STRING(36),
              allowNull: true
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "deleted_at",
            {
              type: 'TIMESTAMP',
              allowNull: true
            },
            {
              transaction: transaction,
            }
          );
          await queryInterface.addColumn(
            "curriculumbaseline",
            "deleted_by",
            {
              type: DataTypes.STRING(36),
              allowNull: true
            },
            {
              transaction: transaction,
            }
          );
        }
    ),

    down: (queryInterface: QueryInterface): Promise<void> => queryInterface.sequelize.transaction(
        async (transaction) => {
          // here go all migration undo changes
          await queryInterface.removeColumn("curriculumbaseline", "baselinename", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "baselinetype", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "baselinestatus", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "startdate", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "enddate", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "schoolid", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "isdeleted", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "created_at", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "created_by", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "updated_at", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "updated_by", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "deleted_at", {
            transaction,
          });
          await queryInterface.removeColumn("curriculumbaseline", "deleted_by", {
            transaction,
          });
        }
    )
};