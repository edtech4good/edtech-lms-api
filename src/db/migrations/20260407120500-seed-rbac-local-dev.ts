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
 * Mirrors RolePermissionBusiness.createPerm / createAllPerms and seeds fixed Role enum IDs.
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

      await sequelize.query(
        `INSERT IGNORE INTO \`lmsusers_roles\` (\`roleid\`, \`lmsuserid\`, \`createdAt\`, \`updatedAt\`) VALUES ('Mapyr2Pw', :uid, :ts, :ts)`,
        {
          replacements: { uid: SUPERADMIN_USER_ID, ts: nowRoles },
          transaction,
        }
      );

      await sequelize.query(
        "DELETE FROM `roles_permissions` WHERE `roleid` = 'Mapyr2Pw'",
        { transaction }
      );
      await sequelize.query(
        `INSERT INTO \`roles_permissions\` (\`roleid\`, \`permissionid\`, \`createdAt\`, \`updatedAt\`)
         SELECT 'Mapyr2Pw', \`permissionid\`, :ts, :ts FROM \`permissions\``,
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
