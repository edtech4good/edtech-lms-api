import { QueryInterface } from "sequelize";

/**
 * Decision of 31 Oct 2026 (edtech4good/edtech-lms-ui#148, option A): the Organisation Admin role (`unb3Fy8p`) may run
 * Sync Students and Sync Content, each for its own organisation only.
 *
 * It withheld both on 2 Oct 2026 (src/db/frozen/organisation-admin-20261002.ts, which stays as it was: it is the list
 * that migration granted). The reason then was that a sync pushes with the server key and, at the time, for every
 * organisation at once. Since then a sync is one organisation's: `planContentSync` (src/business/sync-target.ts) takes
 * the organisation from the caller's token, and `POST sync/cloud/:schoolname/students` finds the school among the
 * caller's own, so neither can send another organisation's data. The two routes now ask for these two permissions
 * (CheckPermissionsGuard) instead of naming the Admin and Super Admin roles.
 *
 * Grants exactly `sync_content` and `sync_students` to Organisation Admin and nothing else: no permission row is
 * created (both exist since 20260716140000), Admin already holds both (20260716160000), the superadmin wildcard needs
 * no grant, and the Teacher role holds neither. Idempotent: `roles_permissions` has no unique key, so a grant that is
 * already there is left alone. After granting, the role must still hold fewer distinct permissions than the table has
 * (else it would be awarded the superadmin wildcard, docs/authorization-model.md), or the migration throws and rolls
 * back. There is one Organisation Admin role row, shared by every organisation: its staff are told apart by the
 * organisation on their account, not by the role.
 *
 * Down removes the two grants from Organisation Admin and nothing from any other role. (A token issued before this
 * ran keeps its old permission list until the bearer logs in again.)
 */
const ORGANISATION_ADMIN_ROLE_ID = "unb3Fy8p"; // Role.organisationadmin
const NAMES = ["sync_content", "sync_students"];

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      const sequelize = queryInterface.sequelize;
      await sequelize.query(
        `INSERT INTO \`roles_permissions\` (\`roleid\`, \`permissionid\`, \`createdAt\`, \`updatedAt\`)
         SELECT :roleid, p.\`permissionid\`, :ts, :ts
         FROM \`permissions\` p
         WHERE p.\`permissionname\` IN (:names)
           AND NOT EXISTS (
             SELECT 1 FROM \`roles_permissions\` rp
             WHERE rp.\`roleid\` = :roleid AND rp.\`permissionid\` = p.\`permissionid\`
           )`,
        { replacements: { roleid: ORGANISATION_ADMIN_ROLE_ID, names: NAMES, ts: new Date() }, transaction },
      );

      const [[total]] = (await sequelize.query("SELECT COUNT(*) AS n FROM `permissions`", { transaction })) as [Array<{ n: number | string }>, unknown];
      const [[held]] = (await sequelize.query(
        "SELECT COUNT(DISTINCT rp.`permissionid`) AS n FROM `roles_permissions` rp " +
          "JOIN `permissions` p ON p.`permissionid` = rp.`permissionid` " +
          "WHERE rp.`roleid` = :roleid",
        { replacements: { roleid: ORGANISATION_ADMIN_ROLE_ID }, transaction },
      )) as [Array<{ n: number | string }>, unknown];
      if (Number(held.n) >= Number(total.n)) {
        throw new Error(
          `The role ${ORGANISATION_ADMIN_ROLE_ID} would hold ${held.n} of ${total.n} permissions, which is the superadmin wildcard. Rolled back.`,
        );
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DELETE rp FROM \`roles_permissions\` rp
         JOIN \`permissions\` p ON p.\`permissionid\` = rp.\`permissionid\`
         WHERE rp.\`roleid\` = :roleid AND p.\`permissionname\` IN (:names)`,
        { replacements: { roleid: ORGANISATION_ADMIN_ROLE_ID, names: NAMES }, transaction },
      );
    }),
};
