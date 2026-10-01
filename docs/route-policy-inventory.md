# Route policy inventory

<!-- GENERATED FILE. Do not edit by hand. -->

**Generated file.** It lists every route the application registers and the
organisation policy each one declares with `@OrgPolicy`
(`src/decorators/orgPolicy.decorator.ts`). Regenerate it with:

```
npm run routes:policy -- --write
```

`src/route-policy/route-inventory.spec.ts` fails when this file is out of
date, and when a route has no policy. A policy states what a route REQUIRES;
enforcement of each policy arrives in later packages, tracked by
`src/route-policy/pending-enforcement.snapshot.txt`.

Policies:

- `public`: reachable without authentication.
- `self`: requires authentication; acts only on the caller's own account or session.
- `owned`: operates on organisation-owned data; limited to the caller's organisation.
- `platform`: platform staff only.
- `server`: server-to-server (application API key or sync key), no user; needs an explicit organisation scope or platform-only use.

Total: **281** routes. public 11, self 4, owned 248, platform 17, server 1.

| Method | Path | Handler | Policy | Guards | Note |
|---|---|---|---|---|---|
| GET | `/` | AppController.getbase | public | none |  |
| GET | `/assets/teacher-upload.csv` | AppController.getteacheruploadFile | public | none | Static CSV template; no data. |
| GET | `/assets/user-upload.csv` | AppController.getstudentuploadFile | public | none | Static CSV template; no data. |
| GET | `/version` | AppController.getversion | public | none |  |
| PUT | `/auth/changepassword` | AuthController.changepassword | self | AccessGuard(CHANGEPASSWORD) | Acts on the account named by the change-password token. |
| POST | `/auth/forgotpassword` | AuthController.forgotpassword | public | ThrottlerGuard |  |
| POST | `/auth/login` | AuthController.login | public | ThrottlerGuard | Staff sign-in. |
| POST | `/auth/logout` | AuthController.logout | self | none | Authenticates the bearer token inside the handler, not with a guard. |
| POST | `/auth/refreshtoken` | AuthController.createrefreshtoken | self | AccessGuard(REFRESH) |  |
| POST | `/auth/school/login` | AuthController.teacherlogin | public | ThrottlerGuard | School-user (teacher and classroom device) sign-in. |
| PUT | `/auth/sendverificationemail` | AuthController.verifyemail | public | none |  |
| POST | `/auth/token/validate/changepassword` | AuthController.changepasswordvalidate | public | none | The reset token in the query proves the request. |
| POST | `/auth/verify` | AuthController.verifyuserbyemailtoken | self | AccessGuard(VERIFYEMAIL) | Acts on the account named by the email-verification token. |
| DELETE | `/baselinequestion/:baselinequestionid` | BaselinequestionController.deletequizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_baseline-endline] |  |
| PUT | `/baselinequestion/activate/:baselinequestionid` | BaselinequestionController.activate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| POST | `/baselinequestion/clone` | BaselinequestionController.clone | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_baseline-endline] |  |
| POST | `/baselinequestion/create` | BaselinequestionController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_baseline-endline] |  |
| PUT | `/baselinequestion/deactivate/:baselinequestionid` | BaselinequestionController.deactivate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| GET | `/baselinequestion/getall/:curriculumbaselineid` | BaselinequestionController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| PUT | `/baselinequestion/order/:baselinequestionid/:baselinequestionorder` | BaselinequestionController.orderquizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| GET | `/dropdown/templatetype` | CommonController.getTemplateType | public | none | Static list of template types; no data. |
| GET | `/country` | CountryController.getAll | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) | Global reference data; an organisation sees only its linked countries. Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| POST | `/country` | CountryController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_country] | Global reference data; an organisation sees only its linked countries. |
| DELETE | `/country/:countryid` | CountryController.delete | platform | AccessGuard(ACCESS), CheckPermissionsGuard[delete_country] | Countries are global reference data. |
| GET | `/country/:countryid` | CountryController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_country] | Global reference data; an organisation sees only its linked countries. |
| PUT | `/country/:countryid` | CountryController.update | platform | AccessGuard(ACCESS), CheckPermissionsGuard[update_country] | Countries are global reference data. |
| GET | `/country/all` | CountryController.getAllCountries | owned | AccessGuard(ACCESS) | Global reference data; an organisation sees only its linked countries. |
| POST | `/country/create` | CountryController.create | platform | AccessGuard(ACCESS), CheckPermissionsGuard[create_country] | Countries are global reference data. |
| DELETE | `/curriculumbaseline/:curriculumbaselineid` | CurriculumBaseLineController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_baseline-endline] |  |
| GET | `/curriculumbaseline/:curriculumbaselineid/download` | CurriculumBaseLineController.getStudentBaselineEndlineResults | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_download_student] |  |
| PUT | `/curriculumbaseline/activate/:curriculumbaselineid/:curriculumid` | CurriculumBaseLineController.activate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| GET | `/curriculumbaseline/all` | CurriculumBaseLineController.getAll | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| POST | `/curriculumbaseline/create` | CurriculumBaseLineController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_baseline-endline] |  |
| PUT | `/curriculumbaseline/deactivate/:curriculumbaselineid` | CurriculumBaseLineController.deactivate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| GET | `/curriculumbaseline/getcurriculumbaseline/:curriculumbaselineid` | CurriculumBaseLineController.getBaselineId | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| GET | `/curriculumbaseline/query` | CurriculumBaseLineController.getQuery | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| GET | `/curriculumbaseline/school/:curriculumbaselineid` | CurriculumBaseLineController.getBaselineSchool | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| PUT | `/curriculumbaseline/update/:curriculumbaselineid` | CurriculumBaseLineController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| POST | `/curriculum` | CurriculumController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum] |  |
| DELETE | `/curriculum/:curriculumid` | CurriculumController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_curriculum] |  |
| GET | `/curriculum/:curriculumid` | CurriculumController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum] |  |
| PUT | `/curriculum/:curriculumid` | CurriculumController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_curriculum] |  |
| PUT | `/curriculum/activate/:curriculumid` | CurriculumController.activate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_curriculum] |  |
| GET | `/curriculum/all` | CurriculumController.getAllCurriculums | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| GET | `/curriculum/country/:countryid` | CurriculumController.getCurriculumByCountry | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| POST | `/curriculum/create` | CurriculumController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_curriculum] |  |
| PUT | `/curriculum/deactivate/:curriculumid` | CurriculumController.deactivate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_curriculum] |  |
| GET | `/curriculum/map` | CurriculumController.map | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum, view_lesson] |  |
| GET | `/curriculum/tree` | CurriculumController.tree | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum] |  |
| GET | `/curriculum/tree/:curriculumid` | CurriculumController.getcurriculumtree | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum] |  |
| POST | `/document` | DocumentController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_document] |  |
| DELETE | `/document/:documentid` | DocumentController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_document] |  |
| GET | `/document/presign/:filename` | DocumentController.presignedupload | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_document] |  |
| DELETE | `/document/tag/:documentid/:tag` | DocumentController.deleteTag | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_document_tag] |  |
| GET | `/document/tag/:documentid/:tag` | DocumentController.addTag | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_document] |  |
| POST | `/document/upload` | DocumentController.uploadFile | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_document] |  |
| POST | `/documenttag` | DocumentTagController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_documenttag] |  |
| DELETE | `/documenttag/:documenttagid` | DocumentTagController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_documenttag] |  |
| GET | `/documenttag/:documenttagid` | DocumentTagController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_documenttag] |  |
| PUT | `/documenttag/:documenttagid` | DocumentTagController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_documenttag] |  |
| POST | `/documenttag/create` | DocumentTagController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_documenttag] |  |
| GET | `/export/:schoolname/students` | ExportController.getstudents | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_download_student] |  |
| GET | `/export/:schoolname/teachers` | ExportController.getteachers | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_teacher] |  |
| GET | `/export/documents/:curriculumid` | ExportController.getQuestions | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_document] |  |
| POST | `/feedback` | FeedbackController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_feedback] |  |
| GET | `/feedback/:feedbackid` | FeedbackController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_feedback] |  |
| POST | `/feedback/create` | FeedbackController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_feedback] |  |
| POST | `/grade` | GradeController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_grade] |  |
| DELETE | `/grade/:gradeid` | GradeController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_grade] |  |
| GET | `/grade/:gradeid` | GradeController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_grade] |  |
| PUT | `/grade/:gradeid` | GradeController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_grade] |  |
| PUT | `/grade/activate/:gradeid` | GradeController.activate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_grade] |  |
| GET | `/grade/all` | GradeController.getAllGrades | owned | AccessGuard(ACCESS) |  |
| POST | `/grade/create` | GradeController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_grade] |  |
| GET | `/grade/curriculum/:curriculumid` | GradeController.getGradeByCurriculum | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| PUT | `/grade/deactivate/:gradeid` | GradeController.deactivate | owned | AccessGuard(ACCESS), AccessGuard(ACCESS), CheckPermissionsGuard[update_grade] |  |
| PUT | `/import/:schoolname/teachers` | ImportController.putteachers | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_import, update_import] |  |
| POST | `/lesson` | LessonController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lesson] |  |
| DELETE | `/lesson/:lessonid` | LessonController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lesson] |  |
| GET | `/lesson/:lessonid` | LessonController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lesson] |  |
| PUT | `/lesson/:lessonid` | LessonController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lesson] |  |
| PUT | `/lesson/activate/:lessonid` | LessonController.activate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lesson] |  |
| GET | `/lesson/all` | LessonController.getAllLessons | owned | AccessGuard(ACCESS) |  |
| POST | `/lesson/create` | LessonController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_lesson] |  |
| PUT | `/lesson/deactivate/:lessonid` | LessonController.deactivate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lesson] |  |
| POST | `/lesson/update_reward_points` | LessonController.autoupdatelessonprogresspoints | platform | AccessGuard(ACCESS), CheckPermissionsGuard[update_lesson] | Rewrites the points of every lesson of every organisation. |
| GET | `/lesson/learning/:lessonid` | LessonLearningController.getlearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonlearning] |  |
| POST | `/lesson/learning/:lessonid` | LessonLearningController.addlearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_lessonlearning] |  |
| GET | `/lesson/learning/:lessonid/:lessonlearningid` | LessonLearningController.getlearningbyid | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonlearning] |  |
| DELETE | `/lesson/learning/:lessonlearningid` | LessonLearningController.deletelearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lessonlearning] |  |
| PUT | `/lesson/learning/:lessonlearningid` | LessonLearningController.updatelearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/learning/activate/:lessonlearningid` | LessonLearningController.activatelearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/learning/deactivate/:lessonlearningid` | LessonLearningController.deactivatelearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/learning/order/:lessonlearningid/:lessonlearningorder` | LessonLearningController.orderlearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| GET | `/lesson/plan/:lessonid` | LessonPlanController.getlearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonlearning] |  |
| POST | `/lesson/plan/:lessonid` | LessonPlanController.addplan | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_lessonlearning] |  |
| GET | `/lesson/plan/:lessonid/:lessonplanid` | LessonPlanController.getplanbyid | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonlearning] |  |
| DELETE | `/lesson/plan/:lessonplanid` | LessonPlanController.deleteplan | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lessonlearning] |  |
| PUT | `/lesson/plan/:lessonplanid` | LessonPlanController.updatelearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/plan/activate/:lessonlearningid` | LessonPlanController.activatelearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/plan/deactivate/:lessonlearningid` | LessonPlanController.deactivatelearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/plan/order/:lessonlearningid/:lessonlearningorder` | LessonPlanController.orderlearning | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| GET | `/lesson/practice/:lessonid` | LessonPracticeController.getpractice | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonpractice] |  |
| POST | `/lesson/practice/:lessonid` | LessonPracticeController.addpractice | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_lessonpractice] |  |
| GET | `/lesson/practice/:lessonid/:lessonpracticeid` | LessonPracticeController.getpracticebyid | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonpractice] |  |
| DELETE | `/lesson/practice/:lessonpracticeid` | LessonPracticeController.deletepractice | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lessonpractice] |  |
| PUT | `/lesson/practice/:lessonpracticeid` | LessonPracticeController.updatepractice | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonpractice] |  |
| PUT | `/lesson/practice/activate/:lessonpracticeid` | LessonPracticeController.activatepractice | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonpractice] |  |
| PUT | `/lesson/practice/deactivate/:lessonpracticeid` | LessonPracticeController.deactivatepractice | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonpractice] |  |
| PUT | `/lesson/practice/order/:lessonpracticeid/:lessonpracticeorder` | LessonPracticeController.orderpractice | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonpractice] |  |
| GET | `/lesson/practice/question/:lessonpracticeid` | LessonPracticeQuestionController.getpracticequestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| POST | `/lesson/practice/question/:lessonpracticeid/:questionid/:lessonpracticequestionorder` | LessonPracticeQuestionController.addpracticequestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| DELETE | `/lesson/practice/question/:lessonpracticequestionid` | LessonPracticeQuestionController.deletepracticequestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| PUT | `/lesson/practice/question/activate/:lessonpracticequestionid` | LessonPracticeQuestionController.activatepracticequestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| PUT | `/lesson/practice/question/deactivate/:lessonpracticequestionid` | LessonPracticeQuestionController.deactivatepracticequestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| PUT | `/lesson/practice/question/order/:lessonpracticequestionid/:lessonpracticequestionorder` | LessonPracticeQuestionController.orderpracticequestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| GET | `/lesson/quiz/:lessonid` | LessonQuizController.getquiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonquiz] |  |
| POST | `/lesson/quiz/:lessonid` | LessonQuizController.addquiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_lessonquiz] |  |
| GET | `/lesson/quiz/:lessonid/:lessonquizid` | LessonQuizController.getquizbyid | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonquiz] |  |
| DELETE | `/lesson/quiz/:lessonquizid` | LessonQuizController.deletequiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lessonquiz] |  |
| PUT | `/lesson/quiz/:lessonquizid` | LessonQuizController.updatequiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonquiz] |  |
| PUT | `/lesson/quiz/activate/:lessonquizid` | LessonQuizController.activatequiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonquiz] |  |
| PUT | `/lesson/quiz/deactivate/:lessonquizid` | LessonQuizController.deactivatequiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonquiz] |  |
| PUT | `/lesson/quiz/order/:lessonquizid/:lessonquizorder` | LessonQuizController.orderquiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonquiz] |  |
| GET | `/lesson/quiz/question/:lessonquizid` | LessonQuizQuestionController.getquizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| POST | `/lesson/quiz/question/:lessonquizid/:questionid/:lessonquizquestionorder` | LessonQuizQuestionController.addquizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| DELETE | `/lesson/quiz/question/:lessonquizquestionid` | LessonQuizQuestionController.deletequizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| PUT | `/lesson/quiz/question/activate/:lessonquizquestionid` | LessonQuizQuestionController.activatequizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| PUT | `/lesson/quiz/question/deactivate/:lessonquizquestionid` | LessonQuizQuestionController.deactivatequizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| PUT | `/lesson/quiz/question/order/:lessonquizquestionid/:lessonquizquestionorder` | LessonQuizQuestionController.orderquizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| POST | `/level` | LevelController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_level] |  |
| DELETE | `/level/:levelid` | LevelController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_level] |  |
| GET | `/level/:levelid` | LevelController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_level] |  |
| PUT | `/level/:levelid` | LevelController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_level] |  |
| PUT | `/level/activate/:levelid` | LevelController.activate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_level] |  |
| GET | `/level/all` | LevelController.getAllLevels | owned | AccessGuard(ACCESS) |  |
| POST | `/level/create` | LevelController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_level] |  |
| PUT | `/level/deactivate/:levelid` | LevelController.deactivate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_level] |  |
| POST | `/level/update_quiz_points` | LevelController.autoupdatelessonprogresspoints | platform | AccessGuard(ACCESS), CheckPermissionsGuard[update_level] | Rewrites the quiz points of every level of every organisation. |
| GET | `/level/quiz/question/:levelid` | LevelQuizQuestionController.getquizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_level_quiz] |  |
| POST | `/level/quiz/question/:levelid/:questionid/:levelquizquestionorder` | LevelQuizQuestionController.addquizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_level_quiz_question] |  |
| DELETE | `/level/quiz/question/:levelquizquestionid` | LevelQuizQuestionController.deletequizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_level_quiz_question] |  |
| PUT | `/level/quiz/question/activate/:levelquizquestionid` | LevelQuizQuestionController.activatequizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[deactivate_level_quiz_question] |  |
| PUT | `/level/quiz/question/deactivate/:levelquizquestionid` | LevelQuizQuestionController.deactivatequizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[deactivate_level_quiz_question] |  |
| PUT | `/level/quiz/question/order/:levelquizquestionid/:levelquizquestionorder` | LevelQuizQuestionController.orderquizquestion | owned | AccessGuard(ACCESS), CheckPermissionsGuard[reorder_level_quiz_question] |  |
| PUT | `/level/quiz/question/setlesson/:levelquizquestionid` | LevelQuizQuestionController.setlesson | owned | AccessGuard(ACCESS), CheckPermissionsGuard[reorder_level_quiz_question] |  |
| PUT | `/log/import` | LogController.create | owned | LogImportGuard, AccessGuard(ACCESS), CheckPermissionsGuard | Uploads from a classroom device; progress rows must belong to learners of the uploader's organisation. |
| GET | `/organisation` | OrganisationController.getall | platform | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[view_organisation] |  |
| POST | `/organisation` | OrganisationController.create | platform | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[create_organisation] |  |
| DELETE | `/organisation/:organisationid` | OrganisationController.delete | platform | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[delete_organisation] |  |
| GET | `/organisation/:organisationid` | OrganisationController.get | platform | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[view_organisation] |  |
| PUT | `/organisation/:organisationid` | OrganisationController.update | platform | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[update_organisation] |  |
| POST | `/question` | QuestionController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_question] |  |
| DELETE | `/question/:questionid` | QuestionController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_question] |  |
| GET | `/question/:questionid` | QuestionController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_question] |  |
| PUT | `/question/:questionid` | QuestionController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| PUT | `/question/:questionid/questionidentifier/:questionidentifier` | QuestionController.updateQuestionIdentifier | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| PUT | `/question/activate/:questionid` | QuestionController.activate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| POST | `/question/create` | QuestionController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_question] |  |
| PUT | `/question/deactivate/:questionid` | QuestionController.deactivate | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| POST | `/question/search` | QuestionController.getallOR | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_question] |  |
| DELETE | `/question/tag/:questionid/:tag` | QuestionController.deleteTag | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| GET | `/question/tag/:questionid/:tag` | QuestionController.addTag | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| POST | `/questiontag` | QuestionTagController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_questiontag] |  |
| DELETE | `/questiontag/:questiontagid` | QuestionTagController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_questiontag] |  |
| GET | `/questiontag/:questiontagid` | QuestionTagController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_questiontag] |  |
| PUT | `/questiontag/:questiontagid` | QuestionTagController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_questiontag] |  |
| POST | `/questiontag/create` | QuestionTagController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_questiontag] |  |
| GET | `/report/dashboard` | ReportController.getSchoolsReport | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach] |  |
| GET | `/report/dashboard/country/:countryid` | ReportController.getCountryData | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach] |  |
| GET | `/report/dashboard/school/:schoolname` | ReportController.getSchoolData | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_reach_school] |  |
| GET | `/report/disability` | ReportController.getStudentDisability | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach, view_reach_school] |  |
| GET | `/report/gender` | ReportController.getStudentGender | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach, view_reach_school] |  |
| GET | `/report/offlineonline` | ReportController.getStudentsOfflineOnline | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach, view_reach_school] |  |
| POST | `/report/online/student-grade-progress` | ReportController.getOnlineStudentGradeProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_report] |  |
| POST | `/report/online/student-lesson-progress` | ReportController.getOnlineStudentLessonProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_report] |  |
| POST | `/report/online/student-level-progress` | ReportController.getOnlineStudentLevelProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_report] |  |
| POST | `/report/online/studentlastcompletedquiz` | ReportController.getOnlineStudentsLastProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_current_level] |  |
| POST | `/report/online/studentlastcompletedquiz/download` | ReportController.downloadOnlineCurrentLevel | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_current_level] |  |
| POST | `/report/online/studentlevelquiz/class` | ReportController.getClassLevelQuizOnline | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_student_level_quiz] |  |
| POST | `/report/online/studentlevelquiz/class/download` | ReportController.downloadOnlineClassLevelQuiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_student_level_quiz] |  |
| POST | `/report/online/studentlevelquiz/download` | ReportController.downloadOnlineStudentsLevelQuiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_student_level_quiz] |  |
| POST | `/report/online/studentprogress` | ReportController.getOnlineStudentsProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_quiz_score] |  |
| POST | `/report/online/studentprogress/class` | ReportController.getOnlineClassProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_quiz_score] |  |
| POST | `/report/online/studentprogress/class/download` | ReportController.downloadOnlineClassProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_quiz_score] |  |
| POST | `/report/online/studentprogress/download` | ReportController.downloadOnlineStudentsProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_quiz_score] |  |
| POST | `/report/online/studentstatus` | ReportController.getOnlineStudentStatus | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_active_status] |  |
| POST | `/report/online/studentstatus/download` | ReportController.downloadOnlineStudentsActivity | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_active_status] |  |
| POST | `/report/student-grade-progress` | ReportController.getStudentGradeProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_report] |  |
| POST | `/report/student-lesson-progress` | ReportController.getStudentLessonProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_report] |  |
| POST | `/report/student-level-progress` | ReportController.getStudentLevelProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_report] |  |
| POST | `/report/studentlastcompletedquiz` | ReportController.getStudentsLastProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_current_level] |  |
| POST | `/report/studentlastcompletedquiz/download` | ReportController.downloadOfflineCurrentLevel | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_current_level] |  |
| POST | `/report/studentlevelquiz` | ReportController.getLevelQuiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_student_level_quiz] |  |
| POST | `/report/studentlevelquiz/class` | ReportController.getClassLevelQuiz | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_student_level_quiz] |  |
| POST | `/report/studentlevelquiz/class/download` | ReportController.downloadOfflineClassLevelQuizzes | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_student_level_quiz] |  |
| POST | `/report/studentlevelquiz/download` | ReportController.downloadOfflineStudentsLevelQuizzes | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_student_level_quiz] |  |
| POST | `/report/studentlevelquiz/online` | ReportController.getLevelQuizOnline | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_student_level_quiz] |  |
| POST | `/report/studentprogress` | ReportController.getStudentsProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_quiz_score] |  |
| POST | `/report/studentprogress/class` | ReportController.getClassProgress | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_quiz_score] |  |
| POST | `/report/studentprogress/class/download` | ReportController.downloadOfflineClassQuizzes | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_quiz_score] |  |
| POST | `/report/studentprogress/download` | ReportController.downloadOfflineStudentsQuizzes | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_quiz_score] |  |
| POST | `/report/studentstatus` | ReportController.getStudentStatus | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_active_status] |  |
| POST | `/report/studentstatus/download` | ReportController.downloadStudentActivity | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_active_status] |  |
| GET | `/report/studentusage` | ReportController.getStudentUsage | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_impact] |  |
| POST | `/report/syncrecords` | ReportController.getSyncRecords | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_sync_record] |  |
| POST | `/report/techdowntime` | ReportController.getFeedbackTechDowntime | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_tech_downtime] |  |
| GET | `/roles` | RolePermissionController.getAllRoles | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] | Global reference data read by staff forms; what an organisation may see or assign differs per organisation. |
| POST | `/roles` | RolePermissionController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] | Global reference data read by staff forms; what an organisation may see or assign differs per organisation. |
| DELETE | `/roles/:roleid` | RolePermissionController.delete | platform | AccessGuard(ACCESS), CheckPermissionsGuard[delete_role] | Roles and permissions are global; administration is platform-only. |
| GET | `/roles/:roleid` | RolePermissionController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] | Global reference data read by staff forms; what an organisation may see or assign differs per organisation. |
| PUT | `/roles/:roleid` | RolePermissionController.update | platform | AccessGuard(ACCESS), CheckPermissionsGuard[update_role] | Roles and permissions are global; administration is platform-only. |
| POST | `/roles/create` | RolePermissionController.create | platform | AccessGuard(ACCESS), CheckPermissionsGuard[create_role] | Roles and permissions are global; administration is platform-only. |
| GET | `/roles/node/permissions` | RolePermissionController.getPermsNode | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] | Global reference data read by staff forms; what an organisation may see or assign differs per organisation. |
| GET | `/roles/permissions` | RolePermissionController.getPerms | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] | Global reference data read by staff forms; what an organisation may see or assign differs per organisation. |
| POST | `/roles/user-bind-role` | RolePermissionController.binduserrole | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_user] | Staff-account administration: binds roles to a user of the caller's organisation. |
| GET | `/school-contribute/all` | SchoolContributeController.getSchool | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| POST | `/school-contribute/create` | SchoolContributeController.createSchoolContribute | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_fees_collection] |  |
| DELETE | `/school-contribute/deleteschoolcontribute/:schoolid` | SchoolContributeController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_fees_collection] |  |
| DELETE | `/school-contribute/deleteschoolcontributeid/:schoolcontributeid` | SchoolContributeController.deleteschoolcontribute | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_fees_collection] |  |
| GET | `/school-contribute/getallschoolcontribute` | SchoolContributeController.getSchoolContribute | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| POST | `/school-contribute/getallschoolcontribute/:schoolid` | SchoolContributeController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| GET | `/school-contribute/getallschooldashboard` | SchoolContributeController.getAllSchoolsReport | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| GET | `/school-contribute/getschoolcontribute/:schoolid` | SchoolContributeController.getSchoolsName | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| GET | `/school-contribute/getschooldashboard/schoolcontributeid/:schoolcontributeid` | SchoolContributeController.getSchoolsContributeId | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| GET | `/school-contribute/getschooldashboardid/:schoolid` | SchoolContributeController.getSchoolsReport | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| POST | `/school-contribute/report/download` | SchoolContributeController.downloadOfflineClassLevelQuizzes | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| PUT | `/school-contribute/updateschooldashboard/:schoolcontributeid` | SchoolContributeController.updateschoolcontribute | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_fees_collection] |  |
| PUT | `/school-contribute/updateschoolname/:schoolid` | SchoolContributeController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_fees_collection] |  |
| GET | `/school` | SchoolController.getAllSchools | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| POST | `/school` | SchoolController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| DELETE | `/school/:schoolid` | SchoolController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_school] |  |
| GET | `/school/:schoolid` | SchoolController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| GET | `/school/:schoolid/curriculums` | SchoolController.getCurriculums | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| GET | `/school/all` | SchoolController.getAllSchoolsWithFilter | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| GET | `/school/branding` | SchoolController.getBranding | public | none | Pre-sign-in branding for the login screen; returns only theme and branding of the named school. |
| GET | `/school/country/:countryid` | SchoolController.getSchool | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| GET | `/school/country/:countryid/curriculum/:curriculumid` | SchoolController.getSchoolCurriculum | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| POST | `/school/create` | SchoolController.createschool | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_school] |  |
| GET | `/school/curriculumid` | SchoolController.getSchoolsCurriculum | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| PUT | `/school/update/:schoolid` | SchoolController.update | owned | AccessGuard(ACCESS), AccessGuard(ACCESS), CheckPermissionsGuard[update_school] |  |
| POST | `/standard` | StandardController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_standard] |  |
| DELETE | `/standard/:standardid` | StandardController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_standard] |  |
| GET | `/standard/:standardid` | StandardController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_standard] |  |
| PUT | `/standard/:standardid` | StandardController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_standard] |  |
| GET | `/standard/all` | StandardController.getAllSchoolsWithFilter | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| POST | `/standard/create` | StandardController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_standard] |  |
| POST | `/standard/migrate-standardid` | StandardController.migrateStandards | platform | AccessGuard(ACCESS, Role.superadmin) | One-off migration over every organisation's data. |
| POST | `/standard/remove-standardid` | StandardController.removeStandards | platform | AccessGuard(ACCESS, Role.superadmin) | One-off migration over every organisation's data. |
| GET | `/standard/school/:schoolid` | StandardController.getSchoolid | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_standard] |  |
| POST | `/student` | StudentController.getall | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| DELETE | `/student/:schooluserid` | StudentController.deleteuser | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[delete_student] |  |
| GET | `/student/:studentid` | StudentController.getuser | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| GET | `/student/all` | StudentController.getAllStudents | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| POST | `/student/create` | StudentController.createall | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. The optional cloud push sends the new learners to the student API. |
| GET | `/student/download-students` | StudentController.sync | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| POST | `/student/migrate-standardid` | StudentController.migrateStandards | platform | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS, Role.superadmin) | One-off migration over every organisation's data. |
| POST | `/student/migrate-subject-curriculum` | StudentController.migrateSubjectCurriculum | platform | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS, Role.superadmin) | One-off migration over every organisation's data. |
| GET | `/student/stats/:studentid` | StudentController.getstudentstats | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| GET | `/student/stats/:studentid/level` | StudentController.getstudentlevelstats | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| GET | `/student/stats/:studentid/practice` | StudentController.getstudentpracticestats | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| GET | `/student/stats/:studentid/quiz` | StudentController.getstudentquizstats | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| PUT | `/student/update` | StudentController.updateStudents | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. |
| POST | `/subject` | SubjectController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_subject] |  |
| DELETE | `/subject/:subjectid` | SubjectController.delete | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_subject] |  |
| GET | `/subject/:subjectid` | SubjectController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_subject] |  |
| PUT | `/subject/:subjectid` | SubjectController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_subject] |  |
| POST | `/subject/create` | SubjectController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_subject] |  |
| GET | `/sync` | SyncController.sync | owned | AccessGuard(ACCESS) | Exports content; limited to one organisation's content. A platform caller must name the organisation. |
| POST | `/sync/cloud` | SyncController.synconline | owned | AccessGuard(ACCESS, Role.admin, Role.superadmin) | Pushes the caller's organisation's content to the student API with the sync key. |
| POST | `/sync/cloud/:schoolname/students` | SyncController.synconlineschool | owned | AccessGuard(ACCESS, Role.admin, Role.superadmin) | Pushes one school's learners to the student API with the sync key; the school must belong to the caller's organisation. |
| GET | `/sync/content` | SyncController.syncContent | owned | AccessGuard(ACCESS) | Exports content; limited to one organisation's content. A platform caller must name the organisation. |
| GET | `/sync/report-data` | SyncController.getReportData | server | AccessGuard(ACCESS, Role.apikey) | Authenticated by the application API key only; carries no user. |
| POST | `/teacher` | TeacherController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_teacher] |  |
| DELETE | `/teacher/:schooluserid` | TeacherController.deleteuser | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_teacher] |  |
| POST | `/teacher/create` | TeacherController.createall | owned | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) | Also admits the application API key: that caller needs an explicit organisation scope or platform-only use. The optional cloud push sends the new teachers to the student API. |
| POST | `/user` | UserController.getall | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_user] |  |
| DELETE | `/user/:lmsuserid` | UserController.deleteuser | owned | AccessGuard(ACCESS), CheckPermissionsGuard[delete_user] |  |
| GET | `/user/:lmsuserid` | UserController.get | owned | AccessGuard(ACCESS), CheckPermissionsGuard[view_user] |  |
| PUT | `/user/:lmsuserid` | UserController.update | owned | AccessGuard(ACCESS), CheckPermissionsGuard[update_user] |  |
| POST | `/user/create` | UserController.create | owned | AccessGuard(ACCESS), CheckPermissionsGuard[create_user] | Staff accounts belong to an organisation. |
