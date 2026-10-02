import { QueryInterface, Transaction } from "sequelize";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "../frozen/organisation-admin-20261002";

/**
 * The "Organisation Admin" role: the staff account that runs one organisation's
 * own staff (list, read, create, update, disable, give roles to its accounts).
 * Staff administration is limited to the caller's organisation in the API, so
 * the role is safe to hand to an organisation; it is NOT safe to widen (see the
 * frozen list's header for what it must never hold).
 *
 * Reference data: runs in every environment, so every statement is additive and
 * idempotent and it will meet databases an operator has already configured.
 *
 *  - The role id is the literal below (`Role.organisationadmin`; enum values are
 *    roleids). If a role already uses that id with a different name, or that
 *    name with a different id, the migration refuses (and changes nothing):
 *    those rows are somebody else's.
 *  - The grants come from the frozen literal list, never from the live enum or
 *    the permissions table, and only for names that exist. A permission the
 *    role already holds is left alone (`roles_permissions` has no unique key).
 *    No permission rows are created: the table does not change size, which is
 *    what keeps the count-based `superadmin` wildcard in step.
 *  - The wildcard must not be reachable from here: after granting, the role
 *    must hold fewer distinct permissions than the table has, or the
 *    migration throws and rolls back.
 *
 * `down` removes exactly the named grants and then the role row. It refuses,
 * changing nothing, while any account still holds the role or the role still
 * holds a grant this migration did not add: deleting around those would strand
 * rows (and the foreign keys would stop it half way).
 */
const ORGANISATION_ADMIN_ROLE_ID = "unb3Fy8p"; // Role.organisationadmin
const ORGANISATION_ADMIN_ROLE_NAME = "Organisation Admin";
const NAMES: string[] = [...ORGANISATION_ADMIN_PERMISSIONS_20261002];

type Rows<T> = [Array<T>, unknown];

const count = async (
  queryInterface: QueryInterface,
  sql: string,
  replacements: Record<string, unknown>,
  transaction: Transaction,
): Promise<number> => {
  const [[row]] = (await queryInterface.sequelize.query(sql, {
    replacements,
    transaction,
  })) as Rows<{ n: number | string }>;
  return Number(row.n);
};

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const sequelize = queryInterface.sequelize;
      const now = new Date();

      const [existing] = (await sequelize.query(
        "SELECT `roleid`, `rolename` FROM `roles` WHERE `roleid` = :roleid OR `rolename` = :rolename",
        {
          replacements: { roleid: ORGANISATION_ADMIN_ROLE_ID, rolename: ORGANISATION_ADMIN_ROLE_NAME },
          transaction,
        },
      )) as Rows<{ roleid: string; rolename: string }>;
      // MySQL compares these columns case-insensitively; compare exactly here.
      const exact = existing.filter(
        (r) => r.roleid === ORGANISATION_ADMIN_ROLE_ID && r.rolename === ORGANISATION_ADMIN_ROLE_NAME,
      );
      const foreign = existing.length - exact.length;
      if (foreign > 0) {
        throw new Error(
          `Cannot add the "${ORGANISATION_ADMIN_ROLE_NAME}" role: ${foreign} existing role(s) already use its id or its name. ` +
            "Rename or delete them, then run this migration again. Nothing was changed.",
        );
      }

      if (exact.length === 0) {
        await sequelize.query(
          "INSERT INTO `roles` (`roleid`, `rolename`, `created_at`, `updated_at`) VALUES (:roleid, :rolename, :ts, :ts)",
          {
            replacements: { roleid: ORGANISATION_ADMIN_ROLE_ID, rolename: ORGANISATION_ADMIN_ROLE_NAME, ts: now },
            transaction,
          },
        );
      }

      // Named permissions only; never `SELECT * FROM permissions`.
      await sequelize.query(
        `INSERT INTO \`roles_permissions\` (\`roleid\`, \`permissionid\`, \`createdAt\`, \`updatedAt\`)
         SELECT :roleid, p.\`permissionid\`, :ts, :ts
         FROM \`permissions\` p
         WHERE p.\`permissionname\` IN (:names)
           AND NOT EXISTS (
             SELECT 1 FROM \`roles_permissions\` rp
             WHERE rp.\`roleid\` = :roleid AND rp.\`permissionid\` = p.\`permissionid\`
           )`,
        { replacements: { roleid: ORGANISATION_ADMIN_ROLE_ID, names: NAMES, ts: now }, transaction },
      );

      const total = await count(queryInterface, "SELECT COUNT(*) AS n FROM `permissions`", {}, transaction);
      const held = await count(
        queryInterface,
        "SELECT COUNT(DISTINCT rp.`permissionid`) AS n FROM `roles_permissions` rp WHERE rp.`roleid` = :roleid",
        { roleid: ORGANISATION_ADMIN_ROLE_ID },
        transaction,
      );
      if (held >= total) {
        throw new Error(
          `The "${ORGANISATION_ADMIN_ROLE_NAME}" role would hold ${held} of ${total} permissions, which is the superadmin wildcard. Rolled back.`,
        );
      }
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const sequelize = queryInterface.sequelize;

      const holders = await count(
        queryInterface,
        "SELECT COUNT(*) AS n FROM `lmsusers_roles` WHERE `roleid` = :roleid",
        { roleid: ORGANISATION_ADMIN_ROLE_ID },
        transaction,
      );
      if (holders > 0) {
        throw new Error(
          `Cannot remove the "${ORGANISATION_ADMIN_ROLE_NAME}" role: ${holders} account(s) still hold it. ` +
            "Give those accounts another role first. Nothing was changed.",
        );
      }
      const others = await count(
        queryInterface,
        `SELECT COUNT(*) AS n FROM \`roles_permissions\` rp
         JOIN \`permissions\` p ON p.\`permissionid\` = rp.\`permissionid\`
         WHERE rp.\`roleid\` = :roleid AND p.\`permissionname\` NOT IN (:names)`,
        { roleid: ORGANISATION_ADMIN_ROLE_ID, names: NAMES },
        transaction,
      );
      if (others > 0) {
        throw new Error(
          `Cannot remove the "${ORGANISATION_ADMIN_ROLE_NAME}" role: it holds ${others} permission(s) this migration did not grant. ` +
            "Remove those first. Nothing was changed.",
        );
      }

      await sequelize.query(
        `DELETE rp FROM \`roles_permissions\` rp
         JOIN \`permissions\` p ON p.\`permissionid\` = rp.\`permissionid\`
         WHERE rp.\`roleid\` = :roleid AND p.\`permissionname\` IN (:names)`,
        { replacements: { roleid: ORGANISATION_ADMIN_ROLE_ID, names: NAMES }, transaction },
      );
      await sequelize.query(
        "DELETE FROM `roles` WHERE `roleid` = :roleid AND `rolename` = :rolename",
        {
          replacements: { roleid: ORGANISATION_ADMIN_ROLE_ID, rolename: ORGANISATION_ADMIN_ROLE_NAME },
          transaction,
        },
      );
    }),
};
