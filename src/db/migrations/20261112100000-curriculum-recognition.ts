import { QueryInterface, QueryTypes, Transaction } from "sequelize";

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
 * Idempotent: a column that already exists is left alone. MySQL commits each ALTER TABLE on its own, so a run that
 * stops after the ALTERs and before the UPDATE leaves the columns in place; the company step therefore runs every
 * time, and touches only a company curriculum still holding all three school defaults, so a re-run finishes an
 * interrupted one and changes nothing once it is done. (A company curriculum that staff set back to exactly the
 * school defaults would be moved again by a re-run; the migration runs once.) Every read goes through the
 * migration's own transaction connection. The columns take the charset and collation of the table's own text
 * columns. Only counts are logged.
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
      const described = await queryInterface.describeTable(TABLE, { transaction } as never);
      const [collationRows] = await queryInterface.sequelize.query(
        `SELECT CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'curriculumname' LIMIT 1`,
        { replacements: [TABLE], transaction },
      );
      const found = (collationRows as { cs?: string; coll?: string }[])[0];
      const charset = found?.cs ?? "utf8mb4";
      const collate = found?.coll ?? "utf8mb4_unicode_ci";
      let added = 0;
      for (const { name, defaultValue } of COLUMNS) {
        if (described[name]) continue;
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${TABLE}\` ADD COLUMN \`${name}\` VARCHAR(16) CHARACTER SET ${charset} COLLATE ${collate} NOT NULL DEFAULT '${defaultValue}'`,
          { transaction },
        );
        added += 1;
      }
      const [, updated] = await queryInterface.sequelize.query(
        `UPDATE \`${TABLE}\` c
         JOIN organisations o ON o.organisationid = c.organisationid
         SET c.levelrecognition = 'award', c.graderecognition = 'none', c.curriculumrecognition = 'certificate'
         WHERE o.organisationpreset = 'company'
           AND c.levelrecognition = 'award' AND c.graderecognition = 'certificate' AND c.curriculumrecognition = 'none'`,
        { type: QueryTypes.UPDATE, transaction },
      );
      console.log(`curriculum-recognition: ${added} column(s) added; ${updated} curriculum(s) of company organisations set to the company defaults`);
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const described = await queryInterface.describeTable(TABLE, { transaction } as never);
      for (const { name } of COLUMNS) {
        if (described[name]) await queryInterface.removeColumn(TABLE, name, { transaction });
      }
    }),
};
