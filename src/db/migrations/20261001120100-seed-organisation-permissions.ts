import { QueryInterface, Transaction } from "sequelize";
import { v4 as uuidv4 } from "uuid";

/**
 * C2 of the multi-organisation model (docs/admin-organisations-schema.md §9):
 * the four organisation permissions, GRANTED TO SUPER ADMIN IN THE SAME
 * MIGRATION.
 *
 * That last part is the whole point. `convertRolesPermsToArrayOfString` awards
 * the synthetic `superadmin` wildcard - a full server-side bypass in
 * `CheckPermissionsGuard` - to a bearer whose number of DISTINCT permissions
 * equals `COUNT(*)` of the permissions table (docs/authorization-model.md).
 * Insert four rows without granting them and the count is four short: every
 * Super Admin silently loses the wildcard, and the only thing that keeps
 * `superadmin@superadmin.com` working locally is the username shortcut that
 * skips the count. So:
 *
 *  - the rows and the grants are written in one transaction, and
 *  - after writing, if Super Admin held every permission BEFORE this ran, the
 *    migration checks it still does and throws (rolling back) if not.
 *
 * Only the four named permissions are granted. It never does
 * `SELECT * FROM permissions`, and it grants nothing to Admin or Teacher: the
 * organisation permissions are platform-only. The older Admin/Teacher grant
 * migration filters them out of the enum for the same reason.
 *
 * Reference data: runs in every environment and is idempotent (existing rows
 * and grants are left alone), because it will meet databases where an
 * operator has already configured roles.
 *
 * The title ("Organisation") groups them under one heading in the role editor,
 * as every other permission group has one. Names and descriptions follow the
 * `{create,update,view,delete}_<entity>` / "Create Organisation" pattern.
 */

/** `Role.superadmin`; Role enum values are roleids, so this compares directly. */
const SUPER_ADMIN_ROLE_ID = "Mapyr2Pw";

const TITLE = "Organisation";

const PERMISSIONS: Array<{ permissionname: string; permissiondesc: string }> = [
  { permissionname: "view_organisation", permissiondesc: "View Organisation" },
  { permissionname: "create_organisation", permissiondesc: "Create Organisation" },
  { permissionname: "update_organisation", permissiondesc: "Update Organisation" },
  { permissionname: "delete_organisation", permissiondesc: "Delete Organisation" },
];
const NAMES = PERMISSIONS.map((p) => p.permissionname);

type Counts = { permissions: number; held: number };

/** Total permission rows, and how many DISTINCT of them Super Admin holds. */
async function wildcardCounts(
  queryInterface: QueryInterface,
  transaction: Transaction,
): Promise<Counts> {
  const sequelize = queryInterface.sequelize;
  const [[total]] = (await sequelize.query(
    "SELECT COUNT(*) AS n FROM `permissions`",
    { transaction },
  )) as [Array<{ n: number | string }>, unknown];
  const [[held]] = (await sequelize.query(
    "SELECT COUNT(DISTINCT rp.`permissionid`) AS n FROM `roles_permissions` rp " +
      "JOIN `permissions` p ON p.`permissionid` = rp.`permissionid` " +
      "WHERE rp.`roleid` = :roleid",
    { replacements: { roleid: SUPER_ADMIN_ROLE_ID }, transaction },
  )) as [Array<{ n: number | string }>, unknown];
  return { permissions: Number(total.n), held: Number(held.n) };
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const sequelize = queryInterface.sequelize;
      const now = new Date();

      const before = await wildcardCounts(queryInterface, transaction);

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

      const [existingRows] = (await sequelize.query(
        "SELECT `permissionname` FROM `permissions` WHERE `permissionname` IN (:names)",
        { replacements: { names: NAMES }, transaction },
      )) as [Array<{ permissionname: string }>, unknown];
      const existing = new Set(existingRows.map((p) => p.permissionname));

      const missing = PERMISSIONS.filter((p) => !existing.has(p.permissionname));
      if (missing.length > 0) {
        await queryInterface.bulkInsert(
          "permissions",
          missing.map((p) => ({
            permissionid: uuidv4(),
            permissionname: p.permissionname,
            permissiondesc: p.permissiondesc,
            permissiontitleid: titleId,
            type: 0,
            createdAt: now,
            updatedAt: now,
          })),
          { transaction },
        );
      }

      // Grant exactly the four named permissions to Super Admin, skipping any
      // it already holds (`roles_permissions` has no unique key, so a plain
      // INSERT would add a duplicate row on a re-run).
      await sequelize.query(
        `INSERT INTO \`roles_permissions\` (\`roleid\`, \`permissionid\`, \`createdAt\`, \`updatedAt\`)
         SELECT :roleid, p.\`permissionid\`, :ts, :ts
         FROM \`permissions\` p
         WHERE p.\`permissionname\` IN (:names)
           AND NOT EXISTS (
             SELECT 1 FROM \`roles_permissions\` rp
             WHERE rp.\`roleid\` = :roleid AND rp.\`permissionid\` = p.\`permissionid\`
           )`,
        {
          replacements: { roleid: SUPER_ADMIN_ROLE_ID, names: NAMES, ts: now },
          transaction,
        },
      );

      // The wildcard must survive. Only checked when it was held to begin with:
      // an operator may have deliberately trimmed Super Admin, and this
      // migration has no business deciding otherwise.
      if (before.held === before.permissions) {
        const after = await wildcardCounts(queryInterface, transaction);
        if (after.held !== after.permissions) {
          throw new Error(
            `Super Admin would lose the superadmin wildcard: it holds ${after.held} of ` +
              `${after.permissions} permissions after this migration. Rolled back.`,
          );
        }
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const sequelize = queryInterface.sequelize;

      // Grants first (from EVERY role - an operator may have granted these to
      // others since), then the rows, then the title if nothing else uses it.
      await sequelize.query(
        `DELETE rp FROM \`roles_permissions\` rp
         JOIN \`permissions\` p ON p.\`permissionid\` = rp.\`permissionid\`
         WHERE p.\`permissionname\` IN (:names)`,
        { replacements: { names: NAMES }, transaction },
      );
      await sequelize.query(
        "DELETE FROM `permissions` WHERE `permissionname` IN (:names)",
        { replacements: { names: NAMES }, transaction },
      );
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
