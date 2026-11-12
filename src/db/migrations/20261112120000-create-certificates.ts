import { DataTypes, QueryInterface, Transaction } from "sequelize";

/**
 * `certificates`: what staff issued to a learner for a level, a grade or a whole curriculum. It ships empty.
 *
 *  - `certificateid` primary key; `shortcode` CHAR(9) ("XXXX-XXXX"), unique: what the public check page takes.
 *  - `organisationid`, `studentid`, `curriculumid`, `scope` (level, grade or curriculum), `scopeid` NOT NULL;
 *    `standardid` (the learner's class when it was issued) NULL.
 *  - `issuedat`, `issuedby` NOT NULL; `revokedat`, `revokedby`, `revokereason` NULL (a certificate is revoked, never deleted).
 *  - `snapshot` JSON NOT NULL: the words on the certificate as they were when it was issued.
 *  - Indexes: unique (`shortcode`), (`studentid`), (`organisationid`, `curriculumid`, `scope`, `scopeid`).
 *
 * No foreign keys: a certificate outlives the content, the class and the staff account it names. The table names its
 * character set and collation (utf8mb4 / utf8mb4_unicode_ci) rather than taking the database default.
 *
 * Idempotent: the table is created only when missing, each index only when missing. Every read goes through the
 * migration's own transaction connection (a read outside it can wait for a lock the transaction holds, on a pool of one).
 * `down` throws when the table holds rows (an issued certificate is a record that dropping the table would lose), and
 * otherwise drops it.
 */
const TABLE = "certificates";
const INDEXES: Array<{ name: string; fields: string[]; unique?: boolean }> = [
  { name: "certificates_shortcode_unique", fields: ["shortcode"], unique: true },
  { name: "certificates_studentid", fields: ["studentid"] },
  { name: "certificates_org_curriculum_scope", fields: ["organisationid", "curriculumid", "scope", "scopeid"] },
];

const tableExists = async (queryInterface: QueryInterface, transaction: Transaction): Promise<boolean> => {
  const [rows] = await queryInterface.sequelize.query(
    "SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    { replacements: [TABLE], transaction },
  );
  return Array.isArray(rows) && rows.length > 0;
};

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      if (!(await tableExists(queryInterface, transaction))) {
        await queryInterface.createTable(
          TABLE,
          {
            certificateid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
            shortcode: { type: DataTypes.CHAR(9), allowNull: false },
            organisationid: { type: DataTypes.STRING(36), allowNull: false },
            studentid: { type: DataTypes.STRING(36), allowNull: false },
            curriculumid: { type: DataTypes.STRING(36), allowNull: false },
            scope: { type: DataTypes.STRING(16), allowNull: false },
            scopeid: { type: DataTypes.STRING(36), allowNull: false },
            standardid: { type: DataTypes.STRING(36), allowNull: true },
            issuedat: { type: DataTypes.DATE(3), allowNull: false },
            issuedby: { type: DataTypes.STRING(36), allowNull: false },
            revokedat: { type: DataTypes.DATE(3), allowNull: true },
            revokedby: { type: DataTypes.STRING(36), allowNull: true },
            revokereason: { type: DataTypes.TEXT, allowNull: true },
            snapshot: { type: DataTypes.JSON, allowNull: false },
            created_at: { type: DataTypes.DATE, allowNull: false },
            updated_at: { type: DataTypes.DATE, allowNull: false },
          },
          { transaction, charset: "utf8mb4", collate: "utf8mb4_unicode_ci" },
        );
      }
      const have = new Set(
        ((await queryInterface.showIndex(TABLE, { transaction })) as Array<{ name?: string }>).map((i) => String(i.name)),
      );
      for (const index of INDEXES) {
        if (!have.has(index.name)) {
          await queryInterface.addIndex(TABLE, index.fields, { name: index.name, unique: index.unique === true, transaction });
        }
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      if (!(await tableExists(queryInterface, transaction))) {
        return;
      }
      const [rows] = await queryInterface.sequelize.query(`SELECT COUNT(*) AS n FROM \`${TABLE}\``, { transaction });
      if (Number((rows as Array<{ n: number | string }>)[0]?.n ?? 0) > 0) {
        throw new Error("certificates holds issued certificates, so the table was not dropped.");
      }
      await queryInterface.dropTable(TABLE, { transaction });
    }),
};
