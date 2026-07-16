import { QueryInterface } from "sequelize";
import { Permission } from "../../models/enums/permissions.enum";

/** Role enum values are roleids; these compare directly. */
const ADMIN_ROLE_ID = "zr5ER4QD";
const TEACHER_ROLE_ID = "Q3Qs7PuD";

/**
 * The RBAC seed grants every permission to Super Admin and none to anything
 * else, so Admin and Teacher accounts could do nothing at all. That was masked
 * until 16 July 2026: `AccessGuard` authorized off `lmsusers.lmsuserrole`, which
 * is stamped `superadmin` on every account, so an Admin reached every
 * roles-guarded endpoint regardless. With the guard now reading the roles the
 * bearer actually holds, an Admin is correctly refused — and, holding zero
 * permissions, is refused everywhere else too. See docs/authorization-model.md.
 *
 * This grants the two roles real permissions.
 *
 * ## Admin: everything except user and role administration
 *
 * Not a stylistic choice — the excluded eight are escalation to Super Admin:
 *
 *   - `POST /roles/user-bind-role` requires only `update_user`, and binds any
 *     role to any user. A holder grants themselves Super Admin.
 *   - `POST /user/create` requires only `create_user`, and takes `lmsuserroles`
 *     from the request body straight into `setRoles`. A holder mints a Super
 *     Admin and logs in as it.
 *
 * So a role holding `create_user` or `update_user` IS Super Admin, whatever the
 * role is called. `view_*`/`delete_*` are excluded alongside them to keep staff
 * administration whole and in one place rather than half-delegated.
 *
 * ## Teacher: read-only
 *
 * `view_` and `download_`. Reports, learners, schools and curriculum are
 * visible; nothing is writable.
 *
 * Note this role cannot reach the 13 endpoints that carry a role list — every
 * one names `[admin, apikey, superadmin]`, and `Role.teacher` appears nowhere in
 * the source. Among them are `POST /student/create`, `PUT /student/update` and
 * `GET /student`, so a Teacher cannot enrol or list learners no matter what is
 * granted here. Read-only is what this role can actually be today; widening it
 * is a guard change, not a grant.
 *
 * For the same reason `create_student`, `update_student`, `create_teacher` and
 * `update_teacher` are inert everywhere — those endpoints are role-gated and
 * carry no `@RequirePermissions`. They are granted to Admin below for
 * consistency with the enum, and authorize nothing.
 *
 * ## Grants come from the Permission enum, not the permissions table
 *
 * The table holds 190 rows; the enum defines 167. The extra 23 are `list_*` rows
 * from the seed's {list,create,update,view,delete} grid that no `Permission`
 * member, no endpoint and no UI template ever names. Granting dead rows would be
 * noise, and it would move the counts the wildcard test below depends on.
 *
 * ## Why the counts matter
 *
 * `convertRolesPermsToArrayOfString` awards the synthetic `superadmin` wildcard
 * to any bearer whose grant count equals `COUNT(*)` of permissions. It compares
 * a raw array length and does not deduplicate across roles, so two roles whose
 * counts SUM to 190 earn the wildcard even when their permissions overlap
 * entirely. Admin lands at 159 and Teacher at 62: no pair of roles sums to 190,
 * so no combination silently becomes superadmin. The same commit deduplicates
 * that check so this stops being load-bearing arithmetic — but do not assume it
 * is safe to grow a role to exactly 190 minus another role's count.
 *
 * Reference data, not development data: it runs in every environment, and every
 * statement is additive and idempotent because it will meet databases where an
 * operator has already configured grants.
 */

/** Staff and role administration. Escalation to Super Admin — see above. */
const USER_ROLE_ADMINISTRATION = /^(create|view|update|delete)_(user|role)$/;

/** Read-only: sees everything it is given, writes nothing. */
const READ_ONLY = /^(view|download)_/;

const ALL_PERMISSIONS: string[] = Object.values(Permission);

const ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) => !USER_ROLE_ADMINISTRATION.test(p)
);

const TEACHER_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) => READ_ONLY.test(p) && !USER_ROLE_ADMINISTRATION.test(p)
);

const GRANTS: Array<{ roleid: string; permissions: string[] }> = [
  { roleid: ADMIN_ROLE_ID, permissions: ADMIN_PERMISSIONS },
  { roleid: TEACHER_ROLE_ID, permissions: TEACHER_PERMISSIONS },
];

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async (transaction) => {
      const now = new Date();

      for (const grant of GRANTS) {
        // Additive: grant only what the role does not already hold, so an
        // operator's existing configuration survives. Named permissions only —
        // never `SELECT * FROM permissions`, which would hand the role every
        // row and, at 190, the superadmin wildcard with it.
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
            replacements: {
              roleid: grant.roleid,
              names: grant.permissions,
              ts: now,
            },
            transaction,
          }
        );
      }
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async (transaction) => {
      // Only the rows this migration names. Both roles held zero grants before
      // it, but an operator may have added their own since.
      for (const grant of GRANTS) {
        await sequelize.query(
          `DELETE rp FROM \`roles_permissions\` rp
           JOIN \`permissions\` p ON p.\`permissionid\` = rp.\`permissionid\`
           WHERE rp.\`roleid\` = :roleid AND p.\`permissionname\` IN (:names)`,
          {
            replacements: { roleid: grant.roleid, names: grant.permissions },
            transaction,
          }
        );
      }
    });
  },
};
