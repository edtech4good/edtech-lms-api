import { QueryInterface, Transaction } from "sequelize";
import { v4 as uuidv4 } from "uuid";

/**
 * Certificates, slice 1: the permissions `list_certificate` (see a learner's certificates and the candidates for one, and
 * read one), `create_certificate` (issue) and `revoke_certificate`, in the pattern of 20261027120100.
 *
 * They are granted in the SAME migration to:
 *
 *  - Super Admin. The `superadmin` wildcard is earned by holding as many distinct permissions as there are rows in
 *    `permissions` (src/db/no-role-holds-every-permission.spec.ts), so a new row that Super
 *    Admin is not given strips the wildcard from every Super Admin. After granting, if Super Admin held every permission
 *    BEFORE this ran, the migration checks it still does and throws (rolling back) if not.
 *  - Organisation Admin (`unb3Fy8p`) and Admin (`zr5ER4QD`): the staff who run an organisation's learners.
 *
 * Teacher is not given them. Neither of the two other roles may reach the wildcard: after granting, each must hold fewer
 * distinct permissions than the table has, or the migration throws and rolls back. Nothing else is granted: never
 * `SELECT * FROM permissions`.
 *
 * The permissions are listed under a "Certificate" title in the role editor (created if a database has none).
 * Reference data: runs in every environment and is idempotent (an existing row or grant is left alone), because it
 * will meet databases where an operator has already configured roles.
 */
const SUPER_ADMIN_ROLE_ID = "Mapyr2Pw"; // Role.superadmin
const ORGANISATION_ADMIN_ROLE_ID = "unb3Fy8p"; // Role.organisationadmin
const ADMIN_ROLE_ID = "zr5ER4QD"; // Role.admin
const TITLE = "Certificate";
const PERMISSIONS = [
  { name: "list_certificate", description: "List Certificate" },
  { name: "create_certificate", description: "Create Certificate" },
  { name: "revoke_certificate", description: "Revoke Certificate" },
];
const NAMES = PERMISSIONS.map((p) => p.name);
const GRANTED_TO = [SUPER_ADMIN_ROLE_ID, ORGANISATION_ADMIN_ROLE_ID, ADMIN_ROLE_ID];

type Counts = { permissions: number; held: number };

/** Total permission rows, and how many DISTINCT of them the role holds. */
async function wildcardCounts(queryInterface: QueryInterface, transaction: Transaction, roleid: string): Promise<Counts> {
  const sequelize = queryInterface.sequelize;
  const [[total]] = (await sequelize.query("SELECT COUNT(*) AS n FROM `permissions`", { transaction })) as [Array<{ n: number | string }>, unknown];
  const [[held]] = (await sequelize.query(
    "SELECT COUNT(DISTINCT rp.`permissionid`) AS n FROM `roles_permissions` rp " +
      "JOIN `permissions` p ON p.`permissionid` = rp.`permissionid` " +
      "WHERE rp.`roleid` = :roleid",
    { replacements: { roleid }, transaction },
  )) as [Array<{ n: number | string }>, unknown];
  return { permissions: Number(total.n), held: Number(held.n) };
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const sequelize = queryInterface.sequelize;
      const now = new Date();

      const before = await wildcardCounts(queryInterface, transaction, SUPER_ADMIN_ROLE_ID);

      const [titleRows] = (await sequelize.query(
        "SELECT `permissiontitleid` FROM `permissionstitle` WHERE `permissiontitle` = :title",
        { replacements: { title: TITLE }, transaction },
      )) as [Array<{ permissiontitleid: string }>, unknown];
      let titleId = titleRows[0]?.permissiontitleid;
      if (!titleId) {
        titleId = uuidv4();
        await queryInterface.bulkInsert(
          "permissionstitle",
          [
            {
              permissiontitleid: titleId,
              permissiontitle: TITLE,
              permissiondesc: TITLE,
              permissiontitleorder: 0,
              type: 1,
              parentid: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { transaction },
        );
      }

      for (const { name, description } of PERMISSIONS) {
        const [existingRows] = (await sequelize.query(
          "SELECT `permissionname` FROM `permissions` WHERE `permissionname` = :name",
          { replacements: { name }, transaction },
        )) as [Array<{ permissionname: string }>, unknown];
        if (existingRows.length === 0) {
          await queryInterface.bulkInsert(
            "permissions",
            [
              {
                permissionid: uuidv4(),
                permissionname: name,
                permissiondesc: description,
                permissiontitleid: titleId,
                type: 0,
                createdAt: now,
                updatedAt: now,
              },
            ],
            { transaction },
          );
        }
      }

      // `roles_permissions` has no unique key, so a plain INSERT would add a duplicate row on a re-run.
      for (const roleid of GRANTED_TO) {
        for (const name of NAMES) {
          await sequelize.query(
            `INSERT INTO \`roles_permissions\` (\`roleid\`, \`permissionid\`, \`createdAt\`, \`updatedAt\`)
             SELECT :roleid, p.\`permissionid\`, :ts, :ts
             FROM \`permissions\` p
             WHERE p.\`permissionname\` = :name
               AND NOT EXISTS (
                 SELECT 1 FROM \`roles_permissions\` rp
                 WHERE rp.\`roleid\` = :roleid AND rp.\`permissionid\` = p.\`permissionid\`
               )`,
            { replacements: { roleid, name, ts: now }, transaction },
          );
        }
      }

      // The wildcard must survive for Super Admin (only checked when it was held to begin with: an operator may have
      // deliberately trimmed Super Admin, and this migration has no business deciding otherwise)...
      if (before.held === before.permissions) {
        const after = await wildcardCounts(queryInterface, transaction, SUPER_ADMIN_ROLE_ID);
        if (after.held !== after.permissions) {
          throw new Error(
            `Super Admin would lose the superadmin wildcard: it holds ${after.held} of ${after.permissions} permissions after this migration. Rolled back.`,
          );
        }
      }
      // ...and must not become reachable from the two roles that were given the permissions alongside it.
      for (const roleid of [ORGANISATION_ADMIN_ROLE_ID, ADMIN_ROLE_ID]) {
        const after = await wildcardCounts(queryInterface, transaction, roleid);
        if (after.held >= after.permissions) {
          throw new Error(
            `The role ${roleid} would hold ${after.held} of ${after.permissions} permissions, which is the superadmin wildcard. Rolled back.`,
          );
        }
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const sequelize = queryInterface.sequelize;

      // Grants first (from EVERY role: an operator may have granted them to others since), then the rows, then the
      // title if nothing else uses it.
      await sequelize.query(
        `DELETE rp FROM \`roles_permissions\` rp
         JOIN \`permissions\` p ON p.\`permissionid\` = rp.\`permissionid\`
         WHERE p.\`permissionname\` IN (:names)`,
        { replacements: { names: NAMES }, transaction },
      );
      await sequelize.query("DELETE FROM `permissions` WHERE `permissionname` IN (:names)", { replacements: { names: NAMES }, transaction });
      await sequelize.query(
        `DELETE t FROM \`permissionstitle\` t
         WHERE t.\`permissiontitle\` = :title
           AND NOT EXISTS (
             SELECT 1 FROM \`permissions\` p WHERE p.\`permissiontitleid\` = t.\`permissiontitleid\`
           )`,
        { replacements: { title: TITLE }, transaction },
      );
    }),
};
