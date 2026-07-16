import { QueryInterface } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Permission } from "../../models/enums/permissions.enum";

/**
 * The RBAC seed generates permissions from a {list,create,update,view,delete}
 * grid over PERMISSIONS_KEY_WORD — 27 entities x 5 = 135 rows. The Permission
 * enum defines 161. The 49 that do not fit the grid were therefore never
 * created, in any environment: RolePermissionBusiness.createAllPerms — the
 * production bootstrap behind GET /roles/create-perm/<key> — uses the same
 * generator. The only way to create one was createOnePerm, by hand, one at a
 * time, and nothing ever called it.
 *
 * They gate real code, so the effects were not subtle:
 *
 *   - `view_plus_reach` does not exist, so the login redirect
 *     (`getPermission('view_plus_reach')` in login.component.ts) can never be
 *     truthy and EVERY user — superadmin included — lands on the blank
 *     dashboard/default welcome page instead of the Reach dashboard.
 *   - The Reach and Reach-School sidebar entries are gated on
 *     `view_plus_reach` / `view_reach_school` via *ngxPermissionsOnly, so both
 *     dashboards are unreachable from the menu.
 *   - Impact, Map, Tech Downtime, Fees Collection and every report download
 *     permission are in the same position.
 *
 * Superadmin still reached the report *APIs*, because CheckPermissionsGuard
 * honours the synthetic `superadmin` wildcard. The client has no such concept:
 * ngx-permissions matches literal names, so the menu stayed hidden regardless.
 * That divergence is why this went unnoticed — the API worked, the UI did not.
 *
 * Reference data, not development data: it runs in every environment, and every
 * statement is additive and idempotent because it will meet databases where an
 * operator has already configured roles and grants.
 */

/**
 * Permissions whose home is an existing title. Everything else is a report or
 * dashboard view and goes under a new "Report" title — there was none, which is
 * precisely why these rows had nowhere to live.
 */
const TITLE_FOR_PERMISSION: Record<string, string> = {
  sync_content: "Sync",
  add_document_tag: "Documenttag",
  edit_document_tag: "Documenttag",
  add_question_tag: "Questiontag",
  remove_question_tags: "Questiontag",
  deactivate_lessonlearning: "Lessonlearning",
  deactivate_lessonpractice: "Lessonpractice",
  deactivate_lessonquiz: "Lessonquiz",
  create_level_quiz_question: "Levelquizquestion",
  delete_level_quiz_question: "Levelquizquestion",
  deactivate_level_quiz_question: "Levelquizquestion",
  reorder_level_quiz_question: "Levelquizquestion",
  edit_practice_question: "Question",
  edit_quiz_question: "Question",
  view_feedback_detail: "Feedback",
};

const REPORT_TITLE = "Report";

/** `view_plus_reach` -> "View plus reach". */
const describe = (permissionname: string): string => {
  const words = permissionname.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async (transaction) => {
      const now = new Date();

      // Titles that already exist, by name.
      const [titleRows] = (await sequelize.query(
        "SELECT `permissiontitleid`, `permissiontitle` FROM `permissionstitle`",
        { transaction }
      )) as [Array<{ permissiontitleid: string; permissiontitle: string }>, unknown];
      const titleIdByName = new Map(
        titleRows.map((t) => [t.permissiontitle, t.permissiontitleid])
      );

      // The report/dashboard permissions have no home; give them one.
      let reportTitleId = titleIdByName.get(REPORT_TITLE);
      if (!reportTitleId) {
        reportTitleId = uuidv4();
        await queryInterface.bulkInsert(
          "permissionstitle",
          [
            {
              permissiontitleid: reportTitleId,
              permissiontitle: REPORT_TITLE,
              permissiondesc: "Reports and dashboards",
              permissiontitleorder: 0,
              type: 1,
              parentid: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { transaction }
        );
        titleIdByName.set(REPORT_TITLE, reportTitleId);
      }

      const [existingRows] = (await sequelize.query(
        "SELECT `permissionname` FROM `permissions`",
        { transaction }
      )) as [Array<{ permissionname: string }>, unknown];
      const existing = new Set(existingRows.map((p) => p.permissionname));

      // NOTE: the `superadmin` wildcard is deliberately absent here. It is not a
      // Permission enum member and must never become a row:
      // convertRolesPermsToArrayOfString derives it by comparing a role's grant
      // count against COUNT(*) of permissions, so inserting it would raise the
      // total it is measured against and no role could ever earn it again.
      const missing = Object.values(Permission).filter((p) => !existing.has(p));

      if (missing.length > 0) {
        await queryInterface.bulkInsert(
          "permissions",
          missing.map((permissionname) => ({
            permissionid: uuidv4(),
            permissionname,
            permissiondesc: describe(permissionname),
            permissiontitleid:
              titleIdByName.get(TITLE_FOR_PERMISSION[permissionname]) ?? reportTitleId,
            type: 0,
            createdAt: now,
            updatedAt: now,
          })),
          { transaction }
        );
      }

      // Grant Super Admin only what it does not already hold — same additive
      // shape as 20260407120500, so an operator's existing grants survive.
      // Super Admin must end up holding every permission or it loses the
      // `superadmin` wildcard, which is what actually authorises it server-side.
      await sequelize.query(
        `INSERT INTO \`roles_permissions\` (\`roleid\`, \`permissionid\`, \`createdAt\`, \`updatedAt\`)
         SELECT 'Mapyr2Pw', p.\`permissionid\`, :ts, :ts
         FROM \`permissions\` p
         WHERE NOT EXISTS (
           SELECT 1 FROM \`roles_permissions\` rp
           WHERE rp.\`roleid\` = 'Mapyr2Pw' AND rp.\`permissionid\` = p.\`permissionid\`
         )`,
        { replacements: { ts: now }, transaction }
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    await sequelize.transaction(async (transaction) => {
      // Only the rows this migration could have added. Permissions from the
      // {list,create,update,view,delete} grid are 20260407120500's to remove.
      const names = Object.values(Permission);
      await sequelize.query(
        `DELETE rp FROM \`roles_permissions\` rp
         JOIN \`permissions\` p ON p.\`permissionid\` = rp.\`permissionid\`
         JOIN \`permissionstitle\` t ON t.\`permissiontitleid\` = p.\`permissiontitleid\`
         WHERE t.\`permissiontitle\` = :title AND p.\`permissionname\` IN (:names)`,
        { replacements: { title: REPORT_TITLE, names }, transaction }
      );
      await sequelize.query(
        `DELETE p FROM \`permissions\` p
         JOIN \`permissionstitle\` t ON t.\`permissiontitleid\` = p.\`permissiontitleid\`
         WHERE t.\`permissiontitle\` = :title AND p.\`permissionname\` IN (:names)`,
        { replacements: { title: REPORT_TITLE, names }, transaction }
      );
      await sequelize.query(
        "DELETE FROM `permissionstitle` WHERE `permissiontitle` = :title",
        { replacements: { title: REPORT_TITLE }, transaction }
      );
    });
  },
};
