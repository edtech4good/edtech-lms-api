# Route policy inventory

<!-- GENERATED FILE. Do not edit by hand. -->

**Generated file.** It lists every route the application registers and the
organisation policy each one declares with `@OrgPolicy`
(`src/decorators/orgPolicy.decorator.ts`). Regenerate it with:

```
npm run routes:policy -- --write
```

`src/route-policy/route-inventory.spec.ts` fails when this file is out of
date, and when a route has no policy.

## Enforced and pending

A policy is a requirement on the routes that declare it. Declaring one does
not enforce it: enforcement arrives in later packages. The **Enforced**
column says which routes are already backed (`yes`) and which are not yet
(`pending`); `public` routes show `n/a`, because nothing backs them. A guard
backs a route; an `owned` route counts as enforced only when it names, with
`@OrgPolicy("owned", { enforcedBy })`, a spec file that exists and has the
route's `METHOD /path` in a test title (the **Proved by** column). The
pending routes are pinned in
`src/route-policy/pending-enforcement.snapshot.txt`.

Pending refers only to the organisation boundary; every route keeps the authentication and permission guards shown in the Guards column.

Of **282** routes, **33** are enforced (by a guard: self, global, and platform routes with `PlatformGuard`; or, for an owned route, by the spec it names), **11** are not applicable (public) and **238** are pending.

| Policy | Routes | Enforced | Not applicable | Pending |
|---|---|---|---|---|
| public | 11 | 0 | 11 | 0 |
| self | 4 | 4 | 0 | 0 |
| owned | 243 | 6 | 0 | 237 |
| platform | 18 | 18 | 0 | 0 |
| server | 1 | 0 | 0 | 1 |
| global | 5 | 5 | 0 | 0 |
| **all** | **282** | **33** | **11** | **238** |

## Policies

Each policy states what a route that declares it must satisfy.

- `public`: Has no AccessGuard; reachable without authentication (rate limiting is not authentication). Returns nothing organisation-owned except what the request itself proves (for example a reset token) or what is deliberately published before sign-in (school branding).
- `self`: Acts only on the account or session named by the token that authenticates the request: an access token, or a refresh, change-password or email-verification token. The token may be checked by a guard or, for named exceptions, in the handler. It never reads or writes another account's data.
- `owned`: Operates on rows that belong to an organisation, directly or through a parent, or on global rows an organisation sees through a link (countries through `organisationcountry`). For an organisation's staff, and for a platform user acting as an organisation, every read, list, write and attach must be limited to that organisation; another organisation's row is not found. For a school-user (teacher) token, the organisation is the one that owns the token's school, and the route may narrow further to that school. A platform user who is not acting as an organisation may read and list across organisations; a create, or an export or push that targets one organisation, must name the organisation explicitly, never from a filter or body field. A route that also admits the application API key is marked as such; that caller is treated as platform.
- `platform`: Must be restricted to platform users as `PlatformGuard` defines them: organisation management, writes to global reference data (countries, roles, permissions), and operations that act on every organisation at once with no scope (bulk recomputes, one-off migrations).
- `server`: Authenticated only by the application API key. Carries no user and no organisation; must be served as platform until the key is retired or scoped.
- `global`: Requires a staff access token. Reads global reference data that no organisation owns and that is the same for every organisation (roles, the permission catalogue). There is no organisation filter. Any rule about what a kind of caller may be offered is enforced where the data is used, not here. Writes to global data are `platform`.

A route used by both a user token and the API key is classified by its user path; the key path is recorded separately.

## Columns

- **Enforced**: `yes` when a guard already backs the policy, or an `owned` route has a spec that proves it; `n/a` for `public` routes (nothing backs them); `pending` otherwise.
- **Proved by**: for an `owned` route that is enforced, the spec file named by `enforcedBy`.
- **API key**: `yes` when every `AccessGuard` on the route lists the application API key, so a caller with no user gets through.
- **School-user token**: `yes` when a school-user (teacher or classroom device) access token gets through every guard on the route, derived from the guard metadata: every `AccessGuard` is the access token type with no role list, there is no `PlatformGuard`, and no permission is required. Feature switches such as `LogImportGuard` aside.

Routes admitting the API key: 13. Routes admitting a school-user token: 7.

## Routes

| Method | Path | Handler | Policy | Enforced | Proved by | API key | School-user token | Guards | Note |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/` | AppController.getbase | public | n/a |  |  |  | none |  |
| GET | `/assets/teacher-upload.csv` | AppController.getteacheruploadFile | public | n/a |  |  |  | none | Serves a static CSV template. |
| GET | `/assets/user-upload.csv` | AppController.getstudentuploadFile | public | n/a |  |  |  | none | Serves a static CSV template. |
| GET | `/version` | AppController.getversion | public | n/a |  |  |  | none |  |
| PUT | `/auth/changepassword` | AuthController.changepassword | self | yes |  |  |  | AccessGuard(CHANGEPASSWORD) | Must act only on the account named by the change-password token. |
| POST | `/auth/forgotpassword` | AuthController.forgotpassword | public | n/a |  |  |  | ThrottlerGuard |  |
| POST | `/auth/login` | AuthController.login | public | n/a |  |  |  | ThrottlerGuard | Staff sign-in. |
| POST | `/auth/logout` | AuthController.logout | self | yes |  |  |  | none | Named exception: the bearer token is checked in the handler, not by a guard. |
| POST | `/auth/organisation` | AuthController.switchorganisation | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, ThrottlerGuard | Platform users only: chooses the organisation the new token acts in. |
| POST | `/auth/refreshtoken` | AuthController.createrefreshtoken | self | yes |  |  |  | AccessGuard(REFRESH) | Must act only on the session named by the refresh token. |
| POST | `/auth/school/login` | AuthController.teacherlogin | public | n/a |  |  |  | ThrottlerGuard | School-user (teacher and classroom device) sign-in. |
| PUT | `/auth/sendverificationemail` | AuthController.verifyemail | public | n/a |  |  |  | none |  |
| POST | `/auth/token/validate/changepassword` | AuthController.changepasswordvalidate | public | n/a |  |  |  | none | The reset token in the query proves the request. |
| POST | `/auth/verify` | AuthController.verifyuserbyemailtoken | self | yes |  |  |  | AccessGuard(VERIFYEMAIL) | Must act only on the account named by the email-verification token. |
| DELETE | `/baselinequestion/:baselinequestionid` | BaselinequestionController.deletequizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_baseline-endline] |  |
| PUT | `/baselinequestion/activate/:baselinequestionid` | BaselinequestionController.activate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| POST | `/baselinequestion/clone` | BaselinequestionController.clone | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_baseline-endline] |  |
| POST | `/baselinequestion/create` | BaselinequestionController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_baseline-endline] |  |
| PUT | `/baselinequestion/deactivate/:baselinequestionid` | BaselinequestionController.deactivate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| GET | `/baselinequestion/getall/:curriculumbaselineid` | BaselinequestionController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| PUT | `/baselinequestion/order/:baselinequestionid/:baselinequestionorder` | BaselinequestionController.orderquizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| GET | `/dropdown/templatetype` | CommonController.getTemplateType | public | n/a |  |  |  | none | Returns a static list of template types. |
| GET | `/country` | CountryController.getAll | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) | Must list only countries linked to the caller's organisation. |
| POST | `/country` | CountryController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_country] | Must list only countries linked to the caller's organisation. |
| DELETE | `/country/:countryid` | CountryController.delete | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[delete_country] | Writes to global reference data (countries) must be restricted to platform users. |
| GET | `/country/:countryid` | CountryController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_country] | Must find only a country linked to the caller's organisation. |
| PUT | `/country/:countryid` | CountryController.update | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[update_country] | Writes to global reference data (countries) must be restricted to platform users. |
| GET | `/country/all` | CountryController.getAllCountries | owned | pending |  |  | yes | AccessGuard(ACCESS) | Must list only countries linked to the caller's organisation. |
| POST | `/country/create` | CountryController.create | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[create_country] | Writes to global reference data (countries) must be restricted to platform users. |
| DELETE | `/curriculumbaseline/:curriculumbaselineid` | CurriculumBaseLineController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_baseline-endline] |  |
| GET | `/curriculumbaseline/:curriculumbaselineid/download` | CurriculumBaseLineController.getStudentBaselineEndlineResults | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_download_student] |  |
| PUT | `/curriculumbaseline/activate/:curriculumbaselineid/:curriculumid` | CurriculumBaseLineController.activate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| GET | `/curriculumbaseline/all` | CurriculumBaseLineController.getAll | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| POST | `/curriculumbaseline/create` | CurriculumBaseLineController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_baseline-endline] |  |
| PUT | `/curriculumbaseline/deactivate/:curriculumbaselineid` | CurriculumBaseLineController.deactivate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| GET | `/curriculumbaseline/getcurriculumbaseline/:curriculumbaselineid` | CurriculumBaseLineController.getBaselineId | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| GET | `/curriculumbaseline/query` | CurriculumBaseLineController.getQuery | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| GET | `/curriculumbaseline/school/:curriculumbaselineid` | CurriculumBaseLineController.getBaselineSchool | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_baseline-endline] |  |
| PUT | `/curriculumbaseline/update/:curriculumbaselineid` | CurriculumBaseLineController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_baseline-endline] |  |
| POST | `/curriculum` | CurriculumController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum] |  |
| DELETE | `/curriculum/:curriculumid` | CurriculumController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_curriculum] |  |
| GET | `/curriculum/:curriculumid` | CurriculumController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum] |  |
| PUT | `/curriculum/:curriculumid` | CurriculumController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_curriculum] |  |
| PUT | `/curriculum/activate/:curriculumid` | CurriculumController.activate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_curriculum] |  |
| GET | `/curriculum/all` | CurriculumController.getAllCurriculums | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) |  |
| GET | `/curriculum/country/:countryid` | CurriculumController.getCurriculumByCountry | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) |  |
| POST | `/curriculum/create` | CurriculumController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_curriculum] |  |
| PUT | `/curriculum/deactivate/:curriculumid` | CurriculumController.deactivate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_curriculum] |  |
| GET | `/curriculum/map` | CurriculumController.map | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum, view_lesson] |  |
| GET | `/curriculum/tree` | CurriculumController.tree | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum] |  |
| GET | `/curriculum/tree/:curriculumid` | CurriculumController.getcurriculumtree | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_curriculum] |  |
| POST | `/document` | DocumentController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_document] |  |
| DELETE | `/document/:documentid` | DocumentController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_document] |  |
| GET | `/document/presign/:filename` | DocumentController.presignedupload | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_document] | The signed key must be scoped to the caller's organisation. |
| DELETE | `/document/tag/:documentid/:tag` | DocumentController.deleteTag | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_document_tag] |  |
| GET | `/document/tag/:documentid/:tag` | DocumentController.addTag | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_document] |  |
| POST | `/document/upload` | DocumentController.uploadFile | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_document] |  |
| POST | `/documenttag` | DocumentTagController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_documenttag] |  |
| DELETE | `/documenttag/:documenttagid` | DocumentTagController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_documenttag] |  |
| GET | `/documenttag/:documenttagid` | DocumentTagController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_documenttag] |  |
| PUT | `/documenttag/:documenttagid` | DocumentTagController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_documenttag] |  |
| POST | `/documenttag/create` | DocumentTagController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_documenttag] |  |
| GET | `/export/:schoolname/students` | ExportController.getstudents | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_download_student] |  |
| GET | `/export/:schoolname/teachers` | ExportController.getteachers | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_teacher] |  |
| GET | `/export/documents/:curriculumid` | ExportController.getQuestions | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_document] |  |
| POST | `/feedback` | FeedbackController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_feedback] |  |
| GET | `/feedback/:feedbackid` | FeedbackController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_feedback] |  |
| POST | `/feedback/create` | FeedbackController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_feedback] |  |
| POST | `/grade` | GradeController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_grade] |  |
| DELETE | `/grade/:gradeid` | GradeController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_grade] |  |
| GET | `/grade/:gradeid` | GradeController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_grade] |  |
| PUT | `/grade/:gradeid` | GradeController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_grade] |  |
| PUT | `/grade/activate/:gradeid` | GradeController.activate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_grade] |  |
| GET | `/grade/all` | GradeController.getAllGrades | owned | pending |  |  | yes | AccessGuard(ACCESS) |  |
| POST | `/grade/create` | GradeController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_grade] |  |
| GET | `/grade/curriculum/:curriculumid` | GradeController.getGradeByCurriculum | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) |  |
| PUT | `/grade/deactivate/:gradeid` | GradeController.deactivate | owned | pending |  |  |  | AccessGuard(ACCESS), AccessGuard(ACCESS), CheckPermissionsGuard[update_grade] |  |
| PUT | `/import/:schoolname/teachers` | ImportController.putteachers | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_import, update_import] |  |
| POST | `/lesson` | LessonController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lesson] |  |
| DELETE | `/lesson/:lessonid` | LessonController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lesson] |  |
| GET | `/lesson/:lessonid` | LessonController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lesson] |  |
| PUT | `/lesson/:lessonid` | LessonController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lesson] |  |
| PUT | `/lesson/activate/:lessonid` | LessonController.activate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lesson] |  |
| GET | `/lesson/all` | LessonController.getAllLessons | owned | pending |  |  | yes | AccessGuard(ACCESS) |  |
| POST | `/lesson/create` | LessonController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_lesson] |  |
| PUT | `/lesson/deactivate/:lessonid` | LessonController.deactivate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lesson] |  |
| POST | `/lesson/update_reward_points` | LessonController.autoupdatelessonprogresspoints | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[update_lesson] | Bulk recompute across all organisations; platform only. |
| GET | `/lesson/learning/:lessonid` | LessonLearningController.getlearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonlearning] |  |
| POST | `/lesson/learning/:lessonid` | LessonLearningController.addlearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_lessonlearning] |  |
| GET | `/lesson/learning/:lessonid/:lessonlearningid` | LessonLearningController.getlearningbyid | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonlearning] |  |
| DELETE | `/lesson/learning/:lessonlearningid` | LessonLearningController.deletelearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lessonlearning] |  |
| PUT | `/lesson/learning/:lessonlearningid` | LessonLearningController.updatelearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/learning/activate/:lessonlearningid` | LessonLearningController.activatelearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/learning/deactivate/:lessonlearningid` | LessonLearningController.deactivatelearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/learning/order/:lessonlearningid/:lessonlearningorder` | LessonLearningController.orderlearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| GET | `/lesson/plan/:lessonid` | LessonPlanController.getlearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonlearning] |  |
| POST | `/lesson/plan/:lessonid` | LessonPlanController.addplan | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_lessonlearning] |  |
| GET | `/lesson/plan/:lessonid/:lessonplanid` | LessonPlanController.getplanbyid | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonlearning] |  |
| DELETE | `/lesson/plan/:lessonplanid` | LessonPlanController.deleteplan | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lessonlearning] |  |
| PUT | `/lesson/plan/:lessonplanid` | LessonPlanController.updatelearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/plan/activate/:lessonlearningid` | LessonPlanController.activatelearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/plan/deactivate/:lessonlearningid` | LessonPlanController.deactivatelearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| PUT | `/lesson/plan/order/:lessonlearningid/:lessonlearningorder` | LessonPlanController.orderlearning | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonlearning] |  |
| GET | `/lesson/practice/:lessonid` | LessonPracticeController.getpractice | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonpractice] |  |
| POST | `/lesson/practice/:lessonid` | LessonPracticeController.addpractice | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_lessonpractice] |  |
| GET | `/lesson/practice/:lessonid/:lessonpracticeid` | LessonPracticeController.getpracticebyid | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonpractice] |  |
| DELETE | `/lesson/practice/:lessonpracticeid` | LessonPracticeController.deletepractice | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lessonpractice] |  |
| PUT | `/lesson/practice/:lessonpracticeid` | LessonPracticeController.updatepractice | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonpractice] |  |
| PUT | `/lesson/practice/activate/:lessonpracticeid` | LessonPracticeController.activatepractice | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonpractice] |  |
| PUT | `/lesson/practice/deactivate/:lessonpracticeid` | LessonPracticeController.deactivatepractice | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonpractice] |  |
| PUT | `/lesson/practice/order/:lessonpracticeid/:lessonpracticeorder` | LessonPracticeController.orderpractice | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonpractice] |  |
| GET | `/lesson/practice/question/:lessonpracticeid` | LessonPracticeQuestionController.getpracticequestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| POST | `/lesson/practice/question/:lessonpracticeid/:questionid/:lessonpracticequestionorder` | LessonPracticeQuestionController.addpracticequestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| DELETE | `/lesson/practice/question/:lessonpracticequestionid` | LessonPracticeQuestionController.deletepracticequestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| PUT | `/lesson/practice/question/activate/:lessonpracticequestionid` | LessonPracticeQuestionController.activatepracticequestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| PUT | `/lesson/practice/question/deactivate/:lessonpracticequestionid` | LessonPracticeQuestionController.deactivatepracticequestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| PUT | `/lesson/practice/question/order/:lessonpracticequestionid/:lessonpracticequestionorder` | LessonPracticeQuestionController.orderpracticequestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_practice_question] |  |
| GET | `/lesson/quiz/:lessonid` | LessonQuizController.getquiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonquiz] |  |
| POST | `/lesson/quiz/:lessonid` | LessonQuizController.addquiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_lessonquiz] |  |
| GET | `/lesson/quiz/:lessonid/:lessonquizid` | LessonQuizController.getquizbyid | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_lessonquiz] |  |
| DELETE | `/lesson/quiz/:lessonquizid` | LessonQuizController.deletequiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_lessonquiz] |  |
| PUT | `/lesson/quiz/:lessonquizid` | LessonQuizController.updatequiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonquiz] |  |
| PUT | `/lesson/quiz/activate/:lessonquizid` | LessonQuizController.activatequiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonquiz] |  |
| PUT | `/lesson/quiz/deactivate/:lessonquizid` | LessonQuizController.deactivatequiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonquiz] |  |
| PUT | `/lesson/quiz/order/:lessonquizid/:lessonquizorder` | LessonQuizController.orderquiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_lessonquiz] |  |
| GET | `/lesson/quiz/question/:lessonquizid` | LessonQuizQuestionController.getquizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| POST | `/lesson/quiz/question/:lessonquizid/:questionid/:lessonquizquestionorder` | LessonQuizQuestionController.addquizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| DELETE | `/lesson/quiz/question/:lessonquizquestionid` | LessonQuizQuestionController.deletequizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| PUT | `/lesson/quiz/question/activate/:lessonquizquestionid` | LessonQuizQuestionController.activatequizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| PUT | `/lesson/quiz/question/deactivate/:lessonquizquestionid` | LessonQuizQuestionController.deactivatequizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| PUT | `/lesson/quiz/question/order/:lessonquizquestionid/:lessonquizquestionorder` | LessonQuizQuestionController.orderquizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[edit_quiz_question] |  |
| POST | `/level` | LevelController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_level] |  |
| DELETE | `/level/:levelid` | LevelController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_level] |  |
| GET | `/level/:levelid` | LevelController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_level] |  |
| PUT | `/level/:levelid` | LevelController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_level] |  |
| PUT | `/level/activate/:levelid` | LevelController.activate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_level] |  |
| GET | `/level/all` | LevelController.getAllLevels | owned | pending |  |  | yes | AccessGuard(ACCESS) |  |
| POST | `/level/create` | LevelController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_level] |  |
| PUT | `/level/deactivate/:levelid` | LevelController.deactivate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_level] |  |
| POST | `/level/update_quiz_points` | LevelController.autoupdatelessonprogresspoints | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[update_level] | Bulk recompute across all organisations; platform only. |
| GET | `/level/quiz/question/:levelid` | LevelQuizQuestionController.getquizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_level_quiz] |  |
| POST | `/level/quiz/question/:levelid/:questionid/:levelquizquestionorder` | LevelQuizQuestionController.addquizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_level_quiz_question] |  |
| DELETE | `/level/quiz/question/:levelquizquestionid` | LevelQuizQuestionController.deletequizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_level_quiz_question] |  |
| PUT | `/level/quiz/question/activate/:levelquizquestionid` | LevelQuizQuestionController.activatequizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[deactivate_level_quiz_question] |  |
| PUT | `/level/quiz/question/deactivate/:levelquizquestionid` | LevelQuizQuestionController.deactivatequizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[deactivate_level_quiz_question] |  |
| PUT | `/level/quiz/question/order/:levelquizquestionid/:levelquizquestionorder` | LevelQuizQuestionController.orderquizquestion | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[reorder_level_quiz_question] |  |
| PUT | `/level/quiz/question/setlesson/:levelquizquestionid` | LevelQuizQuestionController.setlesson | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[reorder_level_quiz_question] |  |
| PUT | `/log/import` | LogController.create | owned | pending |  |  | yes | LogImportGuard, AccessGuard(ACCESS), CheckPermissionsGuard | Rows must belong to learners of the uploading teacher's school. |
| GET | `/organisation` | OrganisationController.getall | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[view_organisation] |  |
| POST | `/organisation` | OrganisationController.create | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[create_organisation] |  |
| DELETE | `/organisation/:organisationid` | OrganisationController.delete | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[delete_organisation] |  |
| GET | `/organisation/:organisationid` | OrganisationController.get | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[view_organisation] |  |
| PUT | `/organisation/:organisationid` | OrganisationController.update | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[update_organisation] |  |
| POST | `/question` | QuestionController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_question] |  |
| DELETE | `/question/:questionid` | QuestionController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_question] |  |
| GET | `/question/:questionid` | QuestionController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_question] |  |
| PUT | `/question/:questionid` | QuestionController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| PUT | `/question/:questionid/questionidentifier/:questionidentifier` | QuestionController.updateQuestionIdentifier | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| PUT | `/question/activate/:questionid` | QuestionController.activate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| POST | `/question/create` | QuestionController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_question] |  |
| PUT | `/question/deactivate/:questionid` | QuestionController.deactivate | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| POST | `/question/search` | QuestionController.getallOR | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_question] |  |
| DELETE | `/question/tag/:questionid/:tag` | QuestionController.deleteTag | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| GET | `/question/tag/:questionid/:tag` | QuestionController.addTag | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_question] |  |
| POST | `/questiontag` | QuestionTagController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_questiontag] |  |
| DELETE | `/questiontag/:questiontagid` | QuestionTagController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_questiontag] |  |
| GET | `/questiontag/:questiontagid` | QuestionTagController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_questiontag] |  |
| PUT | `/questiontag/:questiontagid` | QuestionTagController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_questiontag] |  |
| POST | `/questiontag/create` | QuestionTagController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_questiontag] |  |
| GET | `/report/dashboard` | ReportController.getSchoolsReport | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach] |  |
| GET | `/report/dashboard/country/:countryid` | ReportController.getCountryData | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach] |  |
| GET | `/report/dashboard/school/:schoolname` | ReportController.getSchoolData | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_reach_school] |  |
| GET | `/report/disability` | ReportController.getStudentDisability | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach, view_reach_school] |  |
| GET | `/report/gender` | ReportController.getStudentGender | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach, view_reach_school] |  |
| GET | `/report/offlineonline` | ReportController.getStudentsOfflineOnline | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_plus_reach, view_reach_school] |  |
| POST | `/report/online/student-grade-progress` | ReportController.getOnlineStudentGradeProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_report] |  |
| POST | `/report/online/student-lesson-progress` | ReportController.getOnlineStudentLessonProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_report] |  |
| POST | `/report/online/student-level-progress` | ReportController.getOnlineStudentLevelProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_report] |  |
| POST | `/report/online/studentlastcompletedquiz` | ReportController.getOnlineStudentsLastProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_current_level] |  |
| POST | `/report/online/studentlastcompletedquiz/download` | ReportController.downloadOnlineCurrentLevel | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_current_level] |  |
| POST | `/report/online/studentlevelquiz/class` | ReportController.getClassLevelQuizOnline | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_student_level_quiz] |  |
| POST | `/report/online/studentlevelquiz/class/download` | ReportController.downloadOnlineClassLevelQuiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_student_level_quiz] |  |
| POST | `/report/online/studentlevelquiz/download` | ReportController.downloadOnlineStudentsLevelQuiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_student_level_quiz] |  |
| POST | `/report/online/studentprogress` | ReportController.getOnlineStudentsProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_quiz_score] |  |
| POST | `/report/online/studentprogress/class` | ReportController.getOnlineClassProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_quiz_score] |  |
| POST | `/report/online/studentprogress/class/download` | ReportController.downloadOnlineClassProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_quiz_score] |  |
| POST | `/report/online/studentprogress/download` | ReportController.downloadOnlineStudentsProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_quiz_score] |  |
| POST | `/report/online/studentstatus` | ReportController.getOnlineStudentStatus | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_active_status] |  |
| POST | `/report/online/studentstatus/download` | ReportController.downloadOnlineStudentsActivity | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_active_status] |  |
| POST | `/report/student-grade-progress` | ReportController.getStudentGradeProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_report] |  |
| POST | `/report/student-lesson-progress` | ReportController.getStudentLessonProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_report] |  |
| POST | `/report/student-level-progress` | ReportController.getStudentLevelProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_report] |  |
| POST | `/report/studentlastcompletedquiz` | ReportController.getStudentsLastProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_current_level] |  |
| POST | `/report/studentlastcompletedquiz/download` | ReportController.downloadOfflineCurrentLevel | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_current_level] |  |
| POST | `/report/studentlevelquiz` | ReportController.getLevelQuiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_student_level_quiz] |  |
| POST | `/report/studentlevelquiz/class` | ReportController.getClassLevelQuiz | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_student_level_quiz] |  |
| POST | `/report/studentlevelquiz/class/download` | ReportController.downloadOfflineClassLevelQuizzes | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_student_level_quiz] |  |
| POST | `/report/studentlevelquiz/download` | ReportController.downloadOfflineStudentsLevelQuizzes | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_student_level_quiz] |  |
| POST | `/report/studentlevelquiz/online` | ReportController.getLevelQuizOnline | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_online_student_level_quiz] |  |
| POST | `/report/studentprogress` | ReportController.getStudentsProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_quiz_score] |  |
| POST | `/report/studentprogress/class` | ReportController.getClassProgress | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_quiz_score] |  |
| POST | `/report/studentprogress/class/download` | ReportController.downloadOfflineClassQuizzes | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_quiz_score] |  |
| POST | `/report/studentprogress/download` | ReportController.downloadOfflineStudentsQuizzes | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_offline_quiz_score] |  |
| POST | `/report/studentstatus` | ReportController.getStudentStatus | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_active_status] |  |
| POST | `/report/studentstatus/download` | ReportController.downloadStudentActivity | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_active_status] |  |
| GET | `/report/studentusage` | ReportController.getStudentUsage | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_impact] |  |
| POST | `/report/syncrecords` | ReportController.getSyncRecords | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_sync_record] |  |
| POST | `/report/techdowntime` | ReportController.getFeedbackTechDowntime | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_tech_downtime] |  |
| GET | `/roles` | RolePermissionController.getAllRoles | global | yes |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] |  |
| POST | `/roles` | RolePermissionController.getall | global | yes |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] |  |
| DELETE | `/roles/:roleid` | RolePermissionController.delete | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[delete_role] | Must be restricted to platform users: roles and permissions are global. |
| GET | `/roles/:roleid` | RolePermissionController.get | global | yes |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] |  |
| PUT | `/roles/:roleid` | RolePermissionController.update | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[update_role] | Must be restricted to platform users: roles and permissions are global. |
| POST | `/roles/create` | RolePermissionController.create | platform | yes |  |  |  | AccessGuard(ACCESS), PlatformGuard, CheckPermissionsGuard[create_role] | Must be restricted to platform users: roles and permissions are global. |
| GET | `/roles/node/permissions` | RolePermissionController.getPermsNode | global | yes |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] |  |
| GET | `/roles/permissions` | RolePermissionController.getPerms | global | yes |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_role] |  |
| POST | `/roles/user-bind-role` | RolePermissionController.binduserrole | owned | yes | `src/modules/user/user.organisation-scope.spec.ts` |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_user] | Staff-account administration within the caller's organisation. Super Admin may not be bound to a user who has an organisation. |
| GET | `/school-contribute/all` | SchoolContributeController.getSchool | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| POST | `/school-contribute/create` | SchoolContributeController.createSchoolContribute | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_fees_collection] |  |
| DELETE | `/school-contribute/deleteschoolcontribute/:schoolid` | SchoolContributeController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_fees_collection] |  |
| DELETE | `/school-contribute/deleteschoolcontributeid/:schoolcontributeid` | SchoolContributeController.deleteschoolcontribute | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_fees_collection] |  |
| GET | `/school-contribute/getallschoolcontribute` | SchoolContributeController.getSchoolContribute | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| POST | `/school-contribute/getallschoolcontribute/:schoolid` | SchoolContributeController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| GET | `/school-contribute/getallschooldashboard` | SchoolContributeController.getAllSchoolsReport | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| GET | `/school-contribute/getschoolcontribute/:schoolid` | SchoolContributeController.getSchoolsName | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| GET | `/school-contribute/getschooldashboard/schoolcontributeid/:schoolcontributeid` | SchoolContributeController.getSchoolsContributeId | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| GET | `/school-contribute/getschooldashboardid/:schoolid` | SchoolContributeController.getSchoolsReport | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| POST | `/school-contribute/report/download` | SchoolContributeController.downloadOfflineClassLevelQuizzes | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school_contribution] |  |
| PUT | `/school-contribute/updateschooldashboard/:schoolcontributeid` | SchoolContributeController.updateschoolcontribute | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_fees_collection] |  |
| PUT | `/school-contribute/updateschoolname/:schoolid` | SchoolContributeController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_fees_collection] |  |
| GET | `/school` | SchoolController.getAllSchools | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) |  |
| POST | `/school` | SchoolController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| DELETE | `/school/:schoolid` | SchoolController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_school] |  |
| GET | `/school/:schoolid` | SchoolController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| GET | `/school/:schoolid/curriculums` | SchoolController.getCurriculums | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| GET | `/school/all` | SchoolController.getAllSchoolsWithFilter | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| GET | `/school/branding` | SchoolController.getBranding | public | n/a |  |  |  | none | Deliberately published before sign-in: returns only the theme and branding of the named school. |
| GET | `/school/country/:countryid` | SchoolController.getSchool | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) |  |
| GET | `/school/country/:countryid/curriculum/:curriculumid` | SchoolController.getSchoolCurriculum | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) |  |
| POST | `/school/create` | SchoolController.createschool | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_school] |  |
| GET | `/school/curriculumid` | SchoolController.getSchoolsCurriculum | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_school] |  |
| PUT | `/school/update/:schoolid` | SchoolController.update | owned | pending |  |  |  | AccessGuard(ACCESS), AccessGuard(ACCESS), CheckPermissionsGuard[update_school] |  |
| POST | `/standard` | StandardController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_standard] |  |
| DELETE | `/standard/:standardid` | StandardController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_standard] |  |
| GET | `/standard/:standardid` | StandardController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_standard] |  |
| PUT | `/standard/:standardid` | StandardController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_standard] |  |
| GET | `/standard/all` | StandardController.getAllSchoolsWithFilter | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher) |  |
| POST | `/standard/create` | StandardController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_standard] |  |
| POST | `/standard/migrate-standardid` | StandardController.migrateStandards | platform | yes |  |  |  | AccessGuard(ACCESS, Role.superadmin), PlatformGuard | One-off migration across all organisations; platform only. |
| POST | `/standard/remove-standardid` | StandardController.removeStandards | platform | yes |  |  |  | AccessGuard(ACCESS, Role.superadmin), PlatformGuard | One-off migration across all organisations; platform only. |
| GET | `/standard/school/:schoolid` | StandardController.getSchoolid | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_standard] |  |
| POST | `/student` | StudentController.getall | owned | pending |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| DELETE | `/student/:schooluserid` | StudentController.deleteuser | owned | pending |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[delete_student] |  |
| GET | `/student/:studentid` | StudentController.getuser | owned | pending |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| GET | `/student/all` | StudentController.getAllStudents | owned | pending |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| POST | `/student/create` | StudentController.createall | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) | The optional cloud push must send only the learners created by this call. |
| GET | `/student/download-students` | StudentController.sync | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) |  |
| POST | `/student/migrate-standardid` | StudentController.migrateStandards | platform | yes |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS, Role.superadmin), PlatformGuard | One-off migration across all organisations; platform only. |
| POST | `/student/migrate-subject-curriculum` | StudentController.migrateSubjectCurriculum | platform | yes |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS, Role.superadmin), PlatformGuard | One-off migration across all organisations; platform only. |
| GET | `/student/stats/:studentid` | StudentController.getstudentstats | owned | pending |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| GET | `/student/stats/:studentid/level` | StudentController.getstudentlevelstats | owned | pending |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| GET | `/student/stats/:studentid/practice` | StudentController.getstudentpracticestats | owned | pending |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| GET | `/student/stats/:studentid/quiz` | StudentController.getstudentquizstats | owned | pending |  |  |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS), CheckPermissionsGuard[view_student] |  |
| PUT | `/student/update` | StudentController.updateStudents | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin), AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) |  |
| POST | `/subject` | SubjectController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_subject] |  |
| DELETE | `/subject/:subjectid` | SubjectController.delete | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_subject] |  |
| GET | `/subject/:subjectid` | SubjectController.get | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_subject] |  |
| PUT | `/subject/:subjectid` | SubjectController.update | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_subject] |  |
| POST | `/subject/create` | SubjectController.create | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_subject] |  |
| GET | `/sync` | SyncController.sync | owned | pending |  |  | yes | AccessGuard(ACCESS) | Must export only one organisation's content; a platform caller must name the organisation. |
| POST | `/sync/cloud` | SyncController.synconline | owned | pending |  |  |  | AccessGuard(ACCESS, Role.admin, Role.superadmin) | Must push only the caller's organisation's content; a platform caller must name the organisation. |
| POST | `/sync/cloud/:schoolname/students` | SyncController.synconlineschool | owned | pending |  |  |  | AccessGuard(ACCESS, Role.admin, Role.superadmin) | Must push only learners of a school of the caller's organisation; a platform caller must name the organisation. |
| GET | `/sync/content` | SyncController.syncContent | owned | pending |  |  | yes | AccessGuard(ACCESS) | Must export only one organisation's content; a platform caller must name the organisation. |
| GET | `/sync/report-data` | SyncController.getReportData | server | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey) | Authenticated only by the application API key; must be served as platform until the key is retired or scoped. |
| POST | `/teacher` | TeacherController.getall | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_teacher] |  |
| DELETE | `/teacher/:schooluserid` | TeacherController.deleteuser | owned | pending |  |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_teacher] |  |
| POST | `/teacher/create` | TeacherController.createall | owned | pending |  | yes |  | AccessGuard(ACCESS, Role.apikey, Role.superadmin, Role.admin) | The optional cloud push must send only the teachers created by this call. |
| POST | `/user` | UserController.getall | owned | yes | `src/modules/user/user.organisation-scope.spec.ts` |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_user] |  |
| DELETE | `/user/:lmsuserid` | UserController.deleteuser | owned | yes | `src/modules/user/user.organisation-scope.spec.ts` |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[delete_user] |  |
| GET | `/user/:lmsuserid` | UserController.get | owned | yes | `src/modules/user/user.organisation-scope.spec.ts` |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[view_user] |  |
| PUT | `/user/:lmsuserid` | UserController.update | owned | yes | `src/modules/user/user.organisation-scope.spec.ts` |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[update_user] |  |
| POST | `/user/create` | UserController.create | owned | yes | `src/modules/user/user.organisation-scope.spec.ts` |  |  | AccessGuard(ACCESS), CheckPermissionsGuard[create_user] | The account is created in the caller's organisation; only a platform caller chooses one. |
