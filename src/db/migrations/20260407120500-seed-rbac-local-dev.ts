import { QueryInterface } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { PERMISSIONS_KEY_WORD } from "../../models/enums/permissions.enum";

/** Same user as 20230306155558-superadmin / 20260407120000-superadmin-local-dev-password */
const SUPERADMIN_USER_ID = "5ec8814c-4390-40e3-8d93-828adca9aa08";

const CORE_ROLES: Array<{ roleid: string; rolename: string }> = [
  { roleid: "Mapyr2Pw", rolename: "Super Admin" },
  { roleid: "zr5ER4QD", rolename: "Admin" },
  { roleid: "wSRgm8KP", rolename: "User" },
  { roleid: "Q3Qs7PuD", rolename: "Teacher" },
  { roleid: "dErM4cvb", rolename: "API Key" },
];

/**
 * Fresh installs had empty permissionstitle/permissions and roles, so the JWT for
 * superadmin only contained "superadmin" and ngx-permissions hid most UI actions.
 * Generates the same permission grid the former RolePermissionBusiness.createPerm /
 * createAllPerms produced (removed 16 Jul 2026 with the create-perm endpoints) and
 * seeds fixed Role enum IDs.
 *
 * This is reference data, not development data, so it runs in every environment.
 * Every statement below must therefore be additive and idempotent — it will meet
 * databases that already have roles and grants configured by an operator.
 *
 * The filename still says "local-dev" only because renaming it would change its
 * SequelizeMeta key and re-run it on databases where it has already been applied.
 *
 * The superadmin's development password used to be set here too. It now lives in
 * scripts/seed-local-dev.js behind `npm run seed:local`.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async (transaction) => {
      const [[{ cnt }]] = (await sequelize.query(
        "SELECT COUNT(*) AS cnt FROM `permissionstitle` WHERE `permissiontitle` = 'Curriculum' LIMIT 1",
        { transaction }
      )) as [[{ cnt: number }], unknown];

      if (Number(cnt) === 0) {
        const now = new Date();
        for (const permkey of PERMISSIONS_KEY_WORD) {
          const titleId = uuidv4();
          await queryInterface.bulkInsert(
            "permissionstitle",
            [
              {
                permissiontitleid: titleId,
                permissiontitle: permkey.name,
                permissiondesc: permkey.desc,
                permissiontitleorder: 0,
                type: 1,
                parentid: null,
                createdAt: now,
                updatedAt: now,
              },
            ],
            { transaction }
          );

          const title = permkey.name.toLowerCase();
          const permRows = [
            {
              permissionid: uuidv4(),
              permissionname: `list_${title}`,
              permissiondesc: `List ${permkey.name}`,
              permissiontitleid: titleId,
              type: 0,
              createdAt: now,
              updatedAt: now,
            },
            {
              permissionid: uuidv4(),
              permissionname: `create_${title}`,
              permissiondesc: `Create ${permkey.name}`,
              permissiontitleid: titleId,
              type: 0,
              createdAt: now,
              updatedAt: now,
            },
            {
              permissionid: uuidv4(),
              permissionname: `update_${title}`,
              permissiondesc: `Update ${permkey.name}`,
              permissiontitleid: titleId,
              type: 0,
              createdAt: now,
              updatedAt: now,
            },
            {
              permissionid: uuidv4(),
              permissionname: `view_${title}`,
              permissiondesc: `View ${permkey.name}`,
              permissiontitleid: titleId,
              type: 0,
              createdAt: now,
              updatedAt: now,
            },
            {
              permissionid: uuidv4(),
              permissionname: `delete_${title}`,
              permissiondesc: `Delete ${permkey.name}`,
              permissiontitleid: titleId,
              type: 0,
              createdAt: now,
              updatedAt: now,
            },
          ];
          await queryInterface.bulkInsert("permissions", permRows, { transaction });
        }
      }

      const nowRoles = new Date();
      for (const r of CORE_ROLES) {
        await sequelize.query(
          `INSERT IGNORE INTO \`roles\` (\`roleid\`, \`rolename\`, \`created_at\`, \`updated_at\`) VALUES (:roleid, :rolename, :ts, :ts)`,
          {
            replacements: { roleid: r.roleid, rolename: r.rolename, ts: nowRoles },
            transaction,
          }
        );
      }

      // lmsusers_roles has no primary key or unique index, so INSERT IGNORE
      // would not deduplicate — it would just add a second identical binding.
      await sequelize.query(
        `INSERT INTO \`lmsusers_roles\` (\`roleid\`, \`lmsuserid\`, \`createdAt\`, \`updatedAt\`)
         SELECT 'Mapyr2Pw', :uid, :ts, :ts FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM \`lmsusers_roles\`
           WHERE \`roleid\` = 'Mapyr2Pw' AND \`lmsuserid\` = :uid
         )`,
        {
          replacements: { uid: SUPERADMIN_USER_ID, ts: nowRoles },
          transaction,
        }
      );

      // Grant Super Admin only the permissions it does not already hold.
      // This previously deleted every Mapyr2Pw row and re-inserted the full
      // permissions table, which discarded any grants an operator had changed.
      await sequelize.query(
        `INSERT INTO \`roles_permissions\` (\`roleid\`, \`permissionid\`, \`createdAt\`, \`updatedAt\`)
         SELECT 'Mapyr2Pw', p.\`permissionid\`, :ts, :ts
         FROM \`permissions\` p
         WHERE NOT EXISTS (
           SELECT 1 FROM \`roles_permissions\` rp
           WHERE rp.\`roleid\` = 'Mapyr2Pw' AND rp.\`permissionid\` = p.\`permissionid\`
         )`,
        { replacements: { ts: nowRoles }, transaction }
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        "DELETE FROM `roles_permissions` WHERE `roleid` = 'Mapyr2Pw'",
        { transaction }
      );
      await sequelize.query(
        `DELETE FROM \`lmsusers_roles\` WHERE \`lmsuserid\` = :uid AND \`roleid\` = 'Mapyr2Pw'`,
        { replacements: { uid: SUPERADMIN_USER_ID }, transaction }
      );
      const ids = CORE_ROLES.map((r) => `'${r.roleid}'`).join(",");
      await sequelize.query(`DELETE FROM \`roles\` WHERE \`roleid\` IN (${ids})`, {
        transaction,
      });
    });
  },
};
