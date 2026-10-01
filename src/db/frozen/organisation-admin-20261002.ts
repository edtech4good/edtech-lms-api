/**
 * The permissions the "Organisation Admin" role is granted by migration
 * 20261002120000-seed-organisation-admin-role: 161 names, written out in full.
 *
 * It is a literal list and NOT derived from the live `Permission` enum, from
 * the Admin role, or from the permissions table, so that no later addition of a
 * permission can change what a fresh database grants this role. Reading the
 * enum here is exactly how the organisation permissions nearly reached Admin
 * (see permissions-20260716.ts).
 *
 * What it is made of:
 *
 *  - Everything Admin holds on the database today (159), cross-checked against
 *    the 16 July grant (PERMISSIONS_AS_SHIPPED_20260716 minus
 *    create/view/update/delete of user and role), with three removed:
 *    `create_country`, `update_country` and `delete_country`. Their only routes
 *    carry PlatformGuard, so an organisation's staff could never use them; the
 *    role does not hold what it cannot use.
 *  - `view_user`, `create_user`, `update_user`, `delete_user`: the staff
 *    administration routes, which are limited to the caller's own organisation.
 *  - `view_role`: the read the staff forms need to list the roles an account
 *    can hold (GET /roles; it is also what the other role reads ask for).
 *
 * What it must NEVER contain, pinned by organisation-admin-role.spec.ts:
 *
 *  - the organisation permissions (view/create/update/delete_organisation):
 *    organisations are platform-only;
 *  - `create_role`, `update_role`, `delete_role`: roles and permissions are
 *    global, so changing them is platform-only (and a role that can edit its
 *    own grants can give itself anything);
 *  - any permission that only a PlatformGuard route asks for.
 *
 * It is also far short of "every permission": a role holding every row of the
 * permissions table is awarded the synthetic `superadmin` wildcard by
 * `convertRolesPermsToArrayOfString`, a full bypass of the permission guard.
 * no-role-holds-every-permission.spec.ts fails if this list ever gets there.
 *
 * DO NOT EDIT. A change to what the role holds is a new migration with its own
 * frozen list. This file lives outside src/db/migrations because sequelize-cli
 * would try to run it.
 */
export const ORGANISATION_ADMIN_PERMISSIONS_20261002: ReadonlyArray<string> = [
  "create_curriculum",
  "view_curriculum",
  "update_curriculum",
  "delete_curriculum",
  "sync_content",
  "create_baseline-endline",
  "view_baseline-endline",
  "update_baseline-endline",
  "delete_baseline-endline",
  "create_documenttag",
  "view_documenttag",
  "update_documenttag",
  "delete_documenttag",
  "create_questiontag",
  "view_questiontag",
  "update_questiontag",
  "delete_questiontag",
  "create_document",
  "view_document",
  "edit_document_tag",
  "add_document_tag",
  "delete_document",
  "create_question",
  "view_question",
  "update_question",
  "delete_question",
  "add_question_tag",
  "remove_question_tags",
  "create_grade",
  "view_grade",
  "update_grade",
  "delete_grade",
  "create_level",
  "view_level",
  "update_level",
  "delete_level",
  "view_level_quiz",
  "create_level_quiz_question",
  "delete_level_quiz_question",
  "deactivate_level_quiz_question",
  "reorder_level_quiz_question",
  "create_lesson",
  "view_lesson",
  "update_lesson",
  "delete_lesson",
  "create_levelquizquestion",
  "view_levelquizquestion",
  "update_levelquizquestion",
  "delete_levelquizquestion",
  "create_lessonlearning",
  "view_lessonlearning",
  "update_lessonlearning",
  "delete_lessonlearning",
  "deactivate_lessonlearning",
  "create_lessonpractice",
  "view_lessonpractice",
  "update_lessonpractice",
  "delete_lessonpractice",
  "deactivate_lessonpractice",
  "edit_practice_question",
  "create_lessonquiz",
  "view_lessonquiz",
  "update_lessonquiz",
  "delete_lessonquiz",
  "deactivate_lessonquiz",
  "edit_quiz_question",
  "list_lessonpracticequestion",
  "create_lessonpracticequestion",
  "view_lessonpracticequestion",
  "update_lessonpracticequestion",
  "delete_lessonpracticequestion",
  "list_lessonquizquestion",
  "create_lessonquizquestion",
  "view_lessonquizquestion",
  "update_lessonquizquestion",
  "delete_lessonquizquestion",
  "list_import",
  "create_import",
  "view_import",
  "update_import",
  "delete_import",
  "create_school",
  "view_school",
  "update_school",
  "delete_school",
  "view_download_student",
  "sync_students",
  "view_school_contribution",
  "create_fees_collection",
  "update_fees_collection",
  "delete_fees_collection",
  "list_sync",
  "create_sync",
  "view_sync",
  "update_sync",
  "delete_sync",
  "list_export",
  "create_export",
  "view_export",
  "update_export",
  "delete_export",
  "create_student",
  "view_student",
  "update_student",
  "delete_student",
  "create_standard",
  "view_standard",
  "update_standard",
  "delete_standard",
  "create_teacher",
  "view_teacher",
  "update_teacher",
  "delete_teacher",
  "view_country",
  "create_feedback",
  "view_feedback",
  "update_feedback",
  "delete_feedback",
  "view_feedback_detail",
  "view_plus_reach",
  "view_reach_school",
  "view_impact",
  "view_fees_collection",
  "view_tech_downtime",
  "view_offline_report",
  "view_online_report",
  "view_offline_quiz_score",
  "view_download_student_quiz_score",
  "view_class_quiz_score",
  "view_download_class_quiz_score",
  "view_current_level",
  "download_current_level",
  "view_active_status",
  "download_active_status",
  "view_student_level_quiz",
  "download_student_level_quiz",
  "view_class_level_quiz",
  "download_class_level_quiz",
  "view_online_quiz_score",
  "view_download_online_student_quiz_score",
  "view_online_class_quiz_score",
  "view_download_online_class_quiz_score",
  "view_online_current_level",
  "download_online_current_level",
  "view_online_active_status",
  "download_online_active_status",
  "view_online_student_level_quiz",
  "download_online_student_level_quiz",
  "view_online_class_level_quiz",
  "download_online_class_level_quiz",
  "view_sync_record",
  "view_map",
  "create_subject",
  "view_subject",
  "update_subject",
  "delete_subject",
  "view_user",
  "create_user",
  "update_user",
  "delete_user",
  "view_role",
];
