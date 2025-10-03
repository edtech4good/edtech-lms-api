import { QueryInterface, DataTypes } from "sequelize";
module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "feedbacks",
        {
          feedbackid: {
            type: DataTypes.STRING(36),
            allowNull: false,
            primaryKey: true,
          },
          feedback: {
            type: DataTypes.JSON,
            allowNull: false,
          },
          image: {
            type: DataTypes.JSON,
            allowNull: false,
          },
          feedback3meta: {
            type: DataTypes.JSON,
            allowNull: true,
          },
          teachername: {
            type: DataTypes.STRING(255),
            allowNull: false,
          },
          isdeleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
          },
          curriculumid: {
            type: DataTypes.STRING(36),
            allowNull: false
          },
          created_at: {
            type: "TIMESTAMP",
            defaultValue:
              queryInterface.sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            allowNull: true,
          },
          created_by: {
            type: DataTypes.STRING(36),
            allowNull: true,
          },
          updated_at: {
            type: "TIMESTAMP",
            defaultValue:
              queryInterface.sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            allowNull: true,
          },
          updated_by: {
            type: DataTypes.STRING(36),
            allowNull: true,
          },
          deleted_at: {
            type: "TIMESTAMP",
            allowNull: true,
          },
          deleted_by: {
            type: DataTypes.STRING(36),
            allowNull: true,
          },
        },
        {
          transaction: transaction,
        }
      );
      return await queryInterface.addIndex("feedbacks", ["feedbackid"], {
        transaction,
      });
    }),
  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      // here go all migration undo changes
      await queryInterface.dropTable("feedbacks", { transaction });
    }),
};
