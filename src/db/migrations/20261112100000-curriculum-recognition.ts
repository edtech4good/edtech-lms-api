import { QueryInterface, QueryTypes, Transaction } from "sequelize";
import { removeColumnIfPresent, tableOptionsMatchingColumn } from "../migration-helpers";

/**
 * The per-tier recognition setting on `curriculums`: what a learner receives for completing a level, a grade and the
 * whole curriculum.
 *
 *   levelrecognition       none | award | certificate   default 'award'
 *   graderecognition       none | certificate           default 'certificate'
 *   curriculumrecognition  none | certificate           default 'none'
 *
 * The column defaults are the `school` preset's, so every existing curriculum takes them. Every curriculum whose
 * organisation has `organisationpreset = 'company'` is then set to the company defaults (level 'award', grade
 * 'none', curriculum 'certificate'). The learning server runs the same column change, without the preset step.
 *
 * Idempotent: a column that already exists is left alone, and the company defaults are written only when this run
 * added the columns, so a second run changes nothing and never overwrites what staff set since. The columns take
 * the charset and collation of the table's own text columns. Only counts are logged.
 *
 * `down` drops the three columns.
 */
const TABLE = "curriculums";

const COLUMNS: Array<{ name: string; defaultValue: string }> = [
  { name: "levelrecognition", defaultValue: "award" },
  { name: "graderecognition", defaultValue: "certificate" },
  { name: "curriculumrecognition", defaultValue: "none" },
];

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const described = await queryInterface.describeTable(TABLE);
      const { charset, collate } = await tableOptionsMatchingColumn(queryInterface, TABLE, "curriculumname");
      let added = 0;
      for (const { name, defaultValue } of COLUMNS) {
        if (described[name]) continue;
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${TABLE}\` ADD COLUMN \`${name}\` VARCHAR(16) CHARACTER SET ${charset} COLLATE ${collate} NOT NULL DEFAULT '${defaultValue}'`,
          { transaction },
        );
        added += 1;
      }
      if (added === 0) {
        console.log("curriculum-recognition: columns already present, nothing changed");
        return;
      }
      const [, updated] = await queryInterface.sequelize.query(
        `UPDATE \`${TABLE}\` c
         JOIN organisations o ON o.organisationid = c.organisationid
         SET c.levelrecognition = 'award', c.graderecognition = 'none', c.curriculumrecognition = 'certificate'
         WHERE o.organisationpreset = 'company'`,
        { type: QueryTypes.UPDATE, transaction },
      );
      console.log(`curriculum-recognition: ${added} column(s) added; ${updated} curriculum(s) of company organisations set to the company defaults`);
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      for (const { name } of COLUMNS) {
        await removeColumnIfPresent(queryInterface, TABLE, name, transaction);
      }
    }),
};
