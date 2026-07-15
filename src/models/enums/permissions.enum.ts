export enum Permission {

    CREATE_CURRICULUM = "create_curriculum",
    VIEW_CURRICULUM = "view_curriculum",
    UPDATE_CURRICULUM = "update_curriculum",
    DELETE_CURRICULUM = "delete_curriculum",
    SYNC_CONTENT = "sync_content",

    CREATE_BASELINEENDLINE = "create_baseline-endline",
    VIEW_BASELINEENDLINE = "view_baseline-endline",
    UPDATE_BASELINEENDLINE = "update_baseline-endline",
    DELETE_BASELINEENDLINE = "delete_baseline-endline",

    CREATE_DOCUMENTTAG = "create_documenttag",
    VIEW_DOCUMENTTAG = "view_documenttag",
    UPDATE_DOCUMENTTAG = "update_documenttag",
    DELETE_DOCUMENTTAG = "delete_documenttag",

    CREATE_QUESTIONTAG = "create_questiontag",
    VIEW_QUESTIONTAG = "view_questiontag",
    UPDATE_QUESTIONTAG = "update_questiontag",
    DELETE_QUESTIONTAG = "delete_questiontag",

    CREATE_DOCUMENT = "create_document",
    VIEW_DOCUMENT = "view_document",
    UPDATE_DOCUMENT_TAG = "edit_document_tag",
    ADD_DOCUMENT_TAG = "add_document_tag",
    DELETE_DOCUMENT = "delete_document",

    CREATE_QUESTION = "create_question",
    VIEW_QUESTION = "view_question",
    UPDATE_QUESTION = "update_question",
    DELETE_QUESTION = "delete_question",
    ADD_QUESTION_TAG = "add_question_tag",
    REMOVE_QUESTION_TAG = "remove_question_tags",

    CREATE_GRADE = "create_grade",
    VIEW_GRADE = "view_grade",
    UPDATE_GRADE = "update_grade",
    DELETE_GRADE = "delete_grade",

    CREATE_LEVEL = "create_level",
    VIEW_LEVEL = "view_level",
    UPDATE_LEVEL = "update_level",
    DELETE_LEVEL = "delete_level",
    VIEW_QUIZ = "view_level_quiz",
    CREATE_LEVEL_QUIZ_QUESTION = "create_level_quiz_question",
    DELETE_LEVEL_QUIZ_QUESTION = "delete_level_quiz_question",
    DEACTIVATE_LEVEL_QUIZ_QUESTION = "deactivate_level_quiz_question",
    REORDER_LEVEL_QUIZ_QUESTION = "reorder_level_quiz_question",

    CREATE_LESSON = "create_lesson",
    VIEW_LESSON = "view_lesson",
    UPDATE_LESSON = "update_lesson",
    DELETE_LESSON = "delete_lesson",

    CREATE_LEVELQUIZQUESTION = "create_levelquizquestion",
    VIEW_LEVELQUIZQUESTION = "view_levelquizquestion",
    UPDATE_LEVELQUIZQUESTION = "update_levelquizquestion",
    DELETE_LEVELQUIZQUESTION = "delete_levelquizquestion",

    CREATE_LESSONLEARNING = "create_lessonlearning",
    VIEW_LESSONLEARNING = "view_lessonlearning",
    UPDATE_LESSONLEARNING = "update_lessonlearning",
    DELETE_LESSONLEARNING = "delete_lessonlearning",
    DEACTIVATE_LESSONLEARNING = "deactivate_lessonlearning",

    CREATE_LESSONPRACTICE = "create_lessonpractice",
    VIEW_LESSONPRACTICE = "view_lessonpractice",
    UPDATE_LESSONPRACTICE = "update_lessonpractice",
    DELETE_LESSONPRACTICE = "delete_lessonpractice",
    DEACTIVATE_LESSONPRACTICE = "deactivate_lessonpractice",
    EDIT_LESSONPRACTICE_QUESTION = "edit_practice_question",

    CREATE_LESSONQUIZ = "create_lessonquiz",
    VIEW_LESSONQUIZ = "view_lessonquiz",
    UPDATE_LESSONQUIZ = "update_lessonquiz",
    DELETE_LESSONQUIZ = "delete_lessonquiz",
    DEACTIVATE_LESSONQUIZ = "deactivate_lessonquiz",
    EDIT_LESSONQUIZ_QUESTION = "edit_quiz_question",

    LIST_LESSONPRACTICEQUESTION = "list_lessonpracticequestion",
    CREATE_LESSONPRACTICEQUESTION = "create_lessonpracticequestion",
    VIEW_LESSONPRACTICEQUESTION = "view_lessonpracticequestion",
    UPDATE_LESSONPRACTICEQUESTION = "update_lessonpracticequestion",
    DELETE_LESSONPRACTICEQUESTION = "delete_lessonpracticequestion",

    LIST_LESSONQUIZQUESTION = "list_lessonquizquestion",
    CREATE_LESSONQUIZQUESTION = "create_lessonquizquestion",
    VIEW_LESSONQUIZQUESTION = "view_lessonquizquestion",
    UPDATE_LESSONQUIZQUESTION = "update_lessonquizquestion",
    DELETE_LESSONQUIZQUESTION = "delete_lessonquizquestion",

    LIST_IMPORT = "list_import",
    CREATE_IMPORT = "create_import",
    VIEW_IMPORT = "view_import",
    UPDATE_IMPORT = "update_import",
    DELETE_IMPORT = "delete_import",

    CREATE_SCHOOL = "create_school",
    VIEW_SCHOOL = "view_school",
    UPDATE_SCHOOL = "update_school",
    DELETE_SCHOOL = "delete_school",
    DOWNLOAD_STUDENTS = 'view_download_student',
    SYNC_STUDENTS = 'sync_students',
    VIEW_FEES_COLLECTION = 'view_school_contribution',
    CREATE_FEES_COLLECTION = 'create_fees_collection',
    UPDATE_FEES_COLLECTION = 'update_fees_collection',
    DELETE_FEES_COLLECTION = 'delete_fees_collection',

    LIST_SYNC = "list_sync",
    CREATE_SYNC = "create_sync",
    VIEW_SYNC = "view_sync",
    UPDATE_SYNC = "update_sync",
    DELETE_SYNC = "delete_sync",

    LIST_EXPORT = "list_export",
    CREATE_EXPORT = "create_export",
    VIEW_EXPORT = "view_export",
    UPDATE_EXPORT = "update_export",
    DELETE_EXPORT = "delete_export",

    CREATE_STUDENT = "create_student",
    VIEW_STUDENT = "view_student",
    UPDATE_STUDENT = "update_student",
    DELETE_STUDENT = "delete_student",

    CREATE_STANDARD = "create_standard",
    VIEW_STANDARD = "view_standard",
    UPDATE_STANDARD = "update_standard",
    DELETE_STANDARD = "delete_standard",

    CREATE_TEACHER = "create_teacher",
    VIEW_TEACHER = "view_teacher",
    UPDATE_TEACHER = "update_teacher",
    DELETE_TEACHER = "delete_teacher",

    CREATE_COUNTRY = "create_country",
    VIEW_COUNTRY = "view_country",
    UPDATE_COUNTRY = "update_country",
    DELETE_COUNTRY = "delete_country",

    CREATE_USER = "create_user",
    VIEW_USER = "view_user",
    UPDATE_USER = "update_user",
    DELETE_USER = "delete_user",

    CREATE_ROLE = "create_role",
    VIEW_ROLE = "view_role",
    UPDATE_ROLE = "update_role",
    DELETE_ROLE = "delete_role",

    CREATE_FEEDBACK = "create_feedback",
    VIEW_FEEDBACK = "view_feedback",
    UPDATE_FEEDBACK = "update_feedback",
    DELETE_FEEDBACK = "delete_feedback",
    VIEW_FEEDBACK_DETAIL = "view_feedback_detail",

    VIEW_PLUS_REACH = "view_plus_reach",
    VIEW_SCHOOL_REACH = "view_reach_school",
    VIEW_IMPACT = "view_impact",
    VIEW_SCHOOL_CONTRIBUTION = "view_fees_collection",
    VIEW_TECH_DOWNTIME = "view_tech_downtime",

    VIEW_OFFLINE_REPORT = "view_offline_report",
    VIEW_ONLINE_REPORT = "view_online_report",

    OFFLINE_VIEW_QUIZ_SCORE = "view_offline_quiz_score",
    OFFLINE_DOWNLOAD_QUIZ_SCORE = "view_download_student_quiz_score",
    OFFLINE_VIEW_CLASS_QUIZ_SCORE = "view_class_quiz_score",
    OFFLINE_DOWNLOAD_CLASS_QUIZ_SCORE = "view_download_class_quiz_score",

    OFFLINE_CURRENT_LEVEL = "view_current_level",
    OFFLINE_DOWNLOAD_CURRENT_LEVEL = "download_current_level",

    OFFLINE_ACTIVE_STATUS = "view_active_status",
    OFFLINE_DOWNLOAD_ACTIVE_STATUS = "download_active_status",

    OFFLINE_LEVEL_QUIZ = "view_student_level_quiz",
    OFFLINE_DOWNLOAD_LEVEL_QUIZ = "download_student_level_quiz",
    OFFLINE_CLASS_LEVEL_QUIZ = "view_class_level_quiz",
    OFFLINE_DOWNLOAD_CLASS_LEVEL_QUIZ = "download_class_level_quiz",

    ONLINE_VIEW_QUIZ_SCORE = "view_online_quiz_score",
    ONLINE_DOWNLOAD_QUIZ_SCORE = "view_download_online_student_quiz_score",
    ONLINE_VIEW_CLASS_QUIZ_SCORE = "view_online_class_quiz_score",
    ONLINE_DOWNLOAD_CLASS_QUIZ_SCORE = "view_download_online_class_quiz_score",

    ONLINE_CURRENT_LEVEL = "view_online_current_level",
    ONLINE_DOWNLOAD_CURRENT_LEVEL = "download_online_current_level",

    ONLINE_ACTIVE_STATUS = "view_online_active_status",
    ONLINE_DOWNLOAD_ACTIVE_STATUS = "download_online_active_status",

    ONLINE_LEVEL_QUIZ = "view_online_student_level_quiz",
    ONLINE_DOWNLOAD_LEVEL_QUIZ = "download_online_student_level_quiz",
    ONLINE_CLASS_LEVEL_QUIZ = "view_online_class_level_quiz",
    ONLINE_DOWNLOAD_CLASS_LEVEL_QUIZ = "download_online_class_level_quiz",

    VIEW_SYNC_RECORD = "view_sync_record",

    VIEW_CURRICULUM_MAP = "view_map",

    CREATE_SUBJECT = "create_subject",
    VIEW_SUBJECT = "view_subject",
    UPDATE_SUBJECT = "update_subject",
    DELETE_SUBJECT = "delete_subject",

}

export const PERMISSIONS_KEY_WORD = [
    {name: 'Curriculum', desc: 'Curriculum'},
    {name: 'Documenttag', desc: 'Document Tag'},
    {name: 'Questiontag', desc: 'Question Tag'},
    {name: 'Document', desc: 'Document'},
    {name: 'Question', desc: 'Question'},
    {name: 'Grade', desc: 'Grade'},
    {name: 'Levelquizquestion', desc: 'Level Quiz Question'},
    {name: 'Level', desc: 'Level'},
    {name: 'Lesson', desc: 'Lesson'},
    {name: 'Lessonlearning', desc: 'Lesson Learning'},
    {name: 'Lessonpracticequestion', desc: 'Lesson Practice Question'},
    {name: 'Lessonpractice', desc: 'Lesson Practice'},
    {name: 'Lessonquizquestion', desc: 'Lesson Quiz Question'},
    {name: 'Lessonquiz', desc: 'Lesson Quiz'},
    {name: 'Import', desc: 'Import'},
    {name: 'School', desc: 'School'},
    {name: 'Sync', desc: 'Sync'},
    {name: 'Export', desc: 'Export'},
    {name: 'Student', desc: 'Student'},
    {name: 'Standard', desc: 'Standard'},
    {name: 'Subject', desc: 'Subject'},
    {name: 'Teacher', desc: 'Teacher'},
    {name: 'Baseline-endline', desc: 'Curriculum Baseline Endline'},
    {name: 'Country', desc: 'Country'},
    {name: 'User', desc: 'User'},
    {name: 'Role', desc: 'Role'},
    {name: 'Feedback', desc: 'Feedback'},
]

export const ADD_PERMISSIONS_KEY = "7f51a28c949c486f3abe6eb30f24437c"; // md5(40kplus)
export const SUPERADMIN = "superadmin";
export const SUPERADMIN_USERNAME = "superadmin@superadmin.com";

export const NUMBER_OF_PERMISSIONS = 5;
export const NUMBER_OF_REPORT_PERMISSIONS = 7;