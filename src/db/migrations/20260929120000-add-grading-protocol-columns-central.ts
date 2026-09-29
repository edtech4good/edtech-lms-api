import { QueryInterface, DataTypes, Transaction } from "sequelize";
import {
  addColumnIfMissing,
  removeColumnIfPresent,
  tableNameList,
  tableOptionsMatchingColumn,
} from "../migration-helpers";

/**
 * Central's slice of the server-grading protocol (student API #93/#94).
 *
 * Central does NOT get the `answer` column: raw typed learner answers are
 * not needed here (data minimisation), so `log/import` never copies that
 * field across even though the student API sends it.
 *
 * `studentprogressquestions` has a Sequelize model
 * (src/models/data-models/studentprogressquestions.ts) and `log/import`
 * writes to it, but - like the four tables fixed in
 * 20260720120000-create-drifted-tables.ts - no migration has ever created
 * it. A migration-only database (UAT, prod, or any fresh `db:migrate`) is
 * missing it entirely, which made both `log/import` (any payload carrying
 * question rows) and this migration's `addColumnIfMissing` 500 before this
 * fix - `describeTable` throws on a table that doesn't exist. Older dev
 * databases carry it from a pre-migration schema, same drift story as
 * those four tables, so this follows their `tableNameList` guard: create it
 * (with `clientiscorrect`/`servergrade` already on it) where it's missing,
 * otherwise just add the two columns.
 *
 * studentprogressquestions gets:
 *  - clientiscorrect: the client's own claimed verdict, imported as-is
 *    (kept for future reporting of client/server grading disagreement).
 *  - servergrade: 'correct' | 'incorrect' | 'ungradable', as graded by the
 *    student API that submitted the row.
 *
 * studentprogress gets `verified`, defaulting to false like the student
 * API's column - but central never trusts an imported `verified` value:
 * `LogBusiness.importprogresslog` forces it to false on every imported row
 * regardless of what the payload says (see log.business.ts). Existing rows
 * are NOT backfilled, same rationale as the student API's migration.
 */
const TABLE = "studentprogressquestions";

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const names = await tableNameList(queryInterface);

      if (!names.includes(TABLE)) {
        // FK-referencing column must share studentprogress.studentprogressid's
        // charset/collation, or MySQL refuses the constraint (mixed-migration
        // DBs can have either the Docker default or a legacy collation).
        const idOpts = await tableOptionsMatchingColumn(
          queryInterface,
          "studentprogress",
          "studentprogressid",
        );
        await queryInterface.createTable(
          TABLE,
          {
            studentprogressid: {
              type: DataTypes.STRING(36),
              allowNull: false,
              references: { model: "studentprogress", key: "studentprogressid" },
            },
            studentprogressquestionid: {
              type: DataTypes.STRING(36),
              allowNull: false,
              primaryKey: true,
            },
            tries: {
              type: DataTypes.INTEGER,
              allowNull: true,
              defaultValue: 0,
            },
            iscorrect: {
              type: DataTypes.BOOLEAN,
              allowNull: false,
              defaultValue: false,
            },
            referencequestionid: {
              type: DataTypes.STRING(36),
              allowNull: false,
            },
            clientiscorrect: {
              type: DataTypes.BOOLEAN,
              allowNull: true,
              defaultValue: null,
            },
            servergrade: {
              type: DataTypes.ENUM("correct", "incorrect", "ungradable"),
              allowNull: true,
              defaultValue: null,
            },
          },
          { transaction, charset: idOpts.charset, collate: idOpts.collate },
        );
        await queryInterface.addIndex(TABLE, ["studentprogressid"], {
          name: "studentprogressid",
          transaction,
        });
      } else {
        await addColumnIfMissing(
          queryInterface,
          TABLE,
          "clientiscorrect",
          {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: null,
          },
          transaction,
        );
        await addColumnIfMissing(
          queryInterface,
          TABLE,
          "servergrade",
          {
            type: DataTypes.ENUM("correct", "incorrect", "ungradable"),
            allowNull: true,
            defaultValue: null,
          },
          transaction,
        );
      }

      await addColumnIfMissing(
        queryInterface,
        "studentprogress",
        "verified",
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        transaction,
      );
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const names = await tableNameList(queryInterface);

      if (names.includes(TABLE)) {
        const [rows] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS c FROM \`${TABLE}\``,
          { transaction },
        );
        const count = Number((rows as { c?: number | string }[])[0]?.c ?? 0);

        if (count === 0) {
          // Empty: either this migration created it moments ago, or it's an
          // unused legacy table - either way there's no data to lose, so
          // drop it entirely rather than leaving a half-reverted table.
          await queryInterface.dropTable(TABLE, { transaction });
        } else {
          // Has rows: don't touch a table with real data in it (whether
          // this migration created it earlier in the same run, or it's an
          // older dev table with its own history) - just undo the two
          // columns this migration added.
          await removeColumnIfPresent(queryInterface, TABLE, "servergrade", transaction);
          await removeColumnIfPresent(queryInterface, TABLE, "clientiscorrect", transaction);
        }
      }

      await removeColumnIfPresent(queryInterface, "studentprogress", "verified", transaction);
      // MySQL leaves the servergrade ENUM type attached to nothing once the
      // column (or table) is dropped - nothing further to clean up here.
    }),
};
