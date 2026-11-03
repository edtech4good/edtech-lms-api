import { INTERCEPTORS_METADATA } from "@nestjs/common/constants";
import { ExecutionContext, NestInterceptor } from "@nestjs/common";
import { of } from "rxjs";
import { Config } from "src/config";
import { BusinessValidationInterceptor } from "src/interceptors";
import { Role } from "src/models/enums";
import { SUPERADMIN_USERNAME } from "src/models/enums/permissions.enum";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { ContentFake } from "src/test-support/content-fake";
import { CurriculumBaseLineController } from "./curriculumbaseline/curriculumbaseline.controller";
import { BaselinequestionController } from "./baselinequestion/baselinequestion.controller";
import { LessonLearningController } from "./lesson/lesson.learning.controller";
import { LessonPlanController } from "./lesson/lesson.plan.controller";
import { LessonPracticeController } from "./lesson/lesson.practice.controller";
import { LessonPracticeQuestionController } from "./lesson/lesson.practice.questions.controller";
import { LessonQuizController } from "./lesson/lesson.quiz.controller";
import { LessonQuizQuestionController } from "./lesson/lesson.quiz.questions.controller";
import { LevelQuizQuestionController } from "./level/level.quiz.questions.controller";
import { SchoolController } from "./school/school.controller";
import { StandardController } from "./standard/standard.controller";
import { SubjectController } from "./subject/subject.controller";
import { UserController } from "./user/user.controller";

/**
 * Business rules are asked about the id in the path.
 *
 * The routes below declare a business rule that decides on the state of a row. Each case runs the route's own
 * interceptors (in their order) over a request, on the in-memory tables of `ContentFake`, and compares the whole answer:
 *  - ROWS: the answer for the request is the answer for the plain request, whatever other ids the request names;
 *  - CREATE_ROWS: a rule that refuses a duplicate on create refuses it, and an edit of a row leaves that row out of the
 *    comparison only when the row is the one named in the path.
 */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const db = new ContentFake();

const SCHOOL_WITH_LEARNERS = uuid(101);
const SCHOOL_EMPTY = uuid(102);
const SUBJECT_IN_USE = uuid(201);
const SUBJECT_FREE = uuid(202);
const ROOT_ACCOUNT = uuid(301);
const OTHER_ACCOUNT = uuid(302);
const BASELINE_EMPTY = uuid(401);
const BASELINE_WITH_QUESTION = uuid(402);
const CURRICULUM = uuid(403);
const STANDARD_A = uuid(501);
const STANDARD_B = uuid(502);
const PRACTICE = uuid(601);
const QUESTION_ADDED = uuid(602);
const QUESTION_NEW = uuid(603);
const LESSON = uuid(703);
const QUIZ = uuid(704);
const LEARNING = uuid(705);
const PLAN = uuid(706);
const DOCUMENT = uuid(707);
const DOCUMENT2 = uuid(708);

const seed = () => {
  db.add("organisations", { organisationid: ORG });
  db.add("schools", { schoolid: SCHOOL_WITH_LEARNERS, schoolname: "សាលាបឋមសិក្សា ក", organisationid: ORG });
  db.add("schools", { schoolid: SCHOOL_EMPTY, schoolname: "សាលាបឋមសិក្សា ខ", organisationid: ORG });
  db.add("students", { studentid: uuid(110), schoolid: SCHOOL_WITH_LEARNERS, isdeleted: false });
  db.add("subjects", { subjectid: SUBJECT_IN_USE, subjectname: "គណិតវិទ្យា", organisationid: ORG });
  db.add("subjects", { subjectid: SUBJECT_FREE, subjectname: "ភាសាខ្មែរ", organisationid: ORG });
  db.add("curriculums", { curriculumid: CURRICULUM, subjectid: SUBJECT_IN_USE, curriculumstatus: true, organisationid: ORG });
  db.add("lmsusers", { lmsuserid: ROOT_ACCOUNT, lmsusername: SUPERADMIN_USERNAME, organisationid: null, isdisabled: false });
  db.add("lmsusers", { lmsuserid: OTHER_ACCOUNT, lmsusername: "teacher.one@example.org", organisationid: null, isdisabled: false });
  db.add("curriculumbaseline", { curriculumbaselineid: BASELINE_EMPTY, curriculumid: CURRICULUM, baselinetype: 1, baselinename: "Baseline", organisationid: ORG });
  db.add("curriculumbaseline", { curriculumbaselineid: BASELINE_WITH_QUESTION, curriculumid: CURRICULUM, baselinetype: 1, baselinename: "Baseline two", organisationid: ORG });
  db.add("baselinequestion", { baselinequestionid: uuid(410), curriculumbaselineid: BASELINE_WITH_QUESTION, questionid: QUESTION_ADDED, organisationid: ORG });
  db.add("standards", { standardid: STANDARD_A, standardname: "ថ្នាក់ទី១", schoolid: SCHOOL_WITH_LEARNERS, organisationid: ORG });
  db.add("standards", { standardid: STANDARD_B, standardname: "ថ្នាក់ទី២", schoolid: SCHOOL_WITH_LEARNERS, organisationid: ORG });
  db.add("grades", { gradeid: uuid(701), gradename: "Grade", gradeorder: 1, gradestatus: true, curriculumid: CURRICULUM, passing_points: 8 });
  db.add("levels", { levelid: uuid(702), levelname: "Level", levelorder: 1, levelstatus: true, gradeid: uuid(701), quiz_points: 100, passing_points: 0 });
  db.add("lessons", { lessonid: uuid(703), lessonname: "Lesson", lessonorder: 1, lessonstatus: true, levelid: uuid(702), total_points: 100, passing_points: 0 });
  db.add("lessonpractices", { lessonpracticeid: PRACTICE, lessonid: LESSON, lessonpracticename: "Practice", lessonpracticeorder: 1, lessonpracticestatus: true, points: 10 });
  db.add("questions", { questionid: QUESTION_ADDED, organisationid: ORG });
  db.add("questions", { questionid: QUESTION_NEW, organisationid: ORG });
  db.add("lessonpracticequestions", { lessonpracticequestionid: uuid(610), lessonpracticeid: PRACTICE, questionid: QUESTION_ADDED, lessonpracticequestionorder: 1 });
  // what the create routes compare against
  db.add("lessonquizzes", { lessonquizid: QUIZ, lessonid: LESSON, lessonquizname: "Quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizquestions", { lessonquizquestionid: uuid(711), lessonquizid: QUIZ, questionid: QUESTION_ADDED, lessonquizquestionorder: 1 });
  db.add("levelquizquestions", { levelquizquestionid: uuid(712), levelid: uuid(702), questionid: QUESTION_ADDED, lessonid: LESSON, levelquizquestionorder: 1 });
  db.add("documents", { documentid: DOCUMENT, documentname: "doc.png", documenttypeid: 2, organisationid: ORG, documenttags: [] });
  db.add("documents", { documentid: DOCUMENT2, documentname: "doc2.png", documenttypeid: 2, organisationid: ORG, documenttags: [] });
  db.add("lessonlearnings", { lessonlearningid: LEARNING, lessonid: LESSON, documentid: DOCUMENT, lessonlearningname: "Learning", lessonlearningorder: 1, lessonlearningstatus: true });
  db.add("lessonplans", { lessonplanid: PLAN, lessonid: LESSON, documentid: DOCUMENT2, lessonplanname: "Plan", lessonplanorder: 1, lessonplanstatus: true });
};

type Handler = { prototype: object };
type Channel = "plain" | "query" | "body";
interface Row {
  route: string;
  controller: Handler;
  handler: string;
  caller: "organisation" | "platform";
  /** The path's parameters: the row the rule refuses. */
  params: Record<string, string>;
  /** The body the route takes (the plain request carries it too). */
  body?: Record<string, unknown>;
  /** False where the route's schema takes no further key in its body: variant B does not apply. */
  variantB?: false;
  /** What the request also carries: the same key, with another row's id. */
  other: Record<string, string>;
  refused: string;
}

const ROWS: Row[] = [
  {
    route: "DELETE /school/:schoolid",
    controller: SchoolController,
    handler: "delete",
    caller: "organisation",
    params: { schoolid: SCHOOL_WITH_LEARNERS },
    other: { schoolid: SCHOOL_EMPTY },
    refused: "That school has students and can't be deleted.",
  },
  {
    route: "DELETE /subject/:subjectid",
    controller: SubjectController,
    handler: "delete",
    caller: "organisation",
    params: { subjectid: SUBJECT_IN_USE },
    other: { subjectid: SUBJECT_FREE },
    refused: "That subject is used by a curriculum and can't be deleted.",
  },
  {
    route: "DELETE /user/:lmsuserid",
    controller: UserController,
    handler: "deleteuser",
    caller: "platform",
    params: { lmsuserid: ROOT_ACCOUNT },
    other: { lmsuserid: OTHER_ACCOUNT },
    refused: "The superadmin account can't be deleted.",
  },
  {
    route: "PUT /curriculumbaseline/activate/:curriculumbaselineid/:curriculumid",
    controller: CurriculumBaseLineController,
    handler: "activate",
    caller: "organisation",
    params: { curriculumbaselineid: BASELINE_EMPTY, curriculumid: CURRICULUM },
    other: { curriculumbaselineid: BASELINE_WITH_QUESTION },
    refused: "Add a question before doing that.",
  },
  {
    route: "PUT /standard/:standardid",
    controller: StandardController,
    handler: "update",
    caller: "organisation",
    params: { standardid: STANDARD_A },
    body: { standardname: "ថ្នាក់ទី២", schoolid: SCHOOL_WITH_LEARNERS },
    other: { standardid: STANDARD_B },
    variantB: false,
    refused: "That standard already exists.",
  },
  {
    route: "POST /lesson/practice/question/:lessonpracticeid/:questionid/:lessonpracticequestionorder",
    controller: LessonPracticeQuestionController,
    handler: "addpracticequestion",
    caller: "organisation",
    params: { lessonpracticeid: PRACTICE, questionid: QUESTION_ADDED, lessonpracticequestionorder: "2" },
    other: { questionid: QUESTION_NEW },
    refused: "That question has already been added to this practice.",
  },
];

const users = {
  organisation: {
    lmsuserid: "caller",
    lmsuserroles: [Role.organisationadmin],
    permissions: [...ORGANISATION_ADMIN_PERMISSIONS_20261002],
    organisationid: ORG,
    isplatform: false,
  },
  platform: {
    lmsuserid: "caller",
    lmsuserroles: [Role.superadmin],
    permissions: ["superadmin", ...ORGANISATION_ADMIN_PERMISSIONS_20261002],
    organisationid: null,
    isplatform: true,
  },
};

/** What the route's interceptors say about a request, as a value to compare: the thrown error whole, or `ok`. */
const verdict = async (row: Row, channel: Channel): Promise<unknown> => {
  const interceptors: NestInterceptor[] = Reflect.getMetadata(INTERCEPTORS_METADATA, (row.controller.prototype as Record<string, object>)[row.handler]);
  expect(interceptors.some((i) => i instanceof BusinessValidationInterceptor)).toBe(true);
  const request = {
    user: users[row.caller],
    params: { ...row.params },
    query: channel === "query" ? { ...row.other } : {},
    body: channel === "body" ? { ...(row.body ?? {}), ...row.other } : row.body ? { ...row.body } : {},
  };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  try {
    for (const interceptor of interceptors) {
      await (await interceptor.intercept(context, { handle: () => of("ok") })).toPromise();
    }
    return "ok";
  } catch (e) {
    const err = e as { name?: string; message?: string; fields?: unknown; getStatus?: () => number };
    return { name: err.name, status: err.getStatus?.(), message: err.message, fields: err.fields };
  }
};

describe("business rules are asked about the id in the path", () => {
  beforeEach(() => {
    Config.fortyk.api.applicationsecret = Config.fortyk.api.applicationsecret || "test-secret";
    db.install();
    seed();
  });

  it.each(ROWS.map((r) => [r.route, r] as const))("%s: refused for the plain request", async (_route, row) => {
    const plain = await verdict(row, "plain");
    expect(plain).not.toBe("ok");
    expect(JSON.stringify(plain)).toContain(row.refused);
  });

  it.each(ROWS.map((r) => [r.route, r] as const))("%s: the answer does not change when the request also names another row (variant A)", async (_route, row) => {
    expect(await verdict(row, "query")).toEqual(await verdict(row, "plain"));
  });

  it.each(ROWS.filter((r) => r.variantB !== false).map((r) => [r.route, r] as const))(
    "%s: the answer does not change when the request also names another row (variant B)",
    async (_route, row) => {
      expect(await verdict(row, "body")).toEqual(await verdict(row, "plain"));
    },
  );

  it.each(ROWS.map((r) => [r.route, r] as const))("%s: the rule accepts the other row when it is the one in the path", async (_route, row) => {
    const accepted: Row = { ...row, params: { ...row.params, ...row.other } };
    expect(await verdict(accepted, "plain")).toBe("ok");
  });
});

/** A rule that compares with the rows that exist leaves out one row only when an edit names it in the path. */
interface CreateRow {
  route: string;
  controller: Handler;
  handler: string;
  params: Record<string, string>;
  body: Record<string, unknown>;
  /** The id key an edit leaves out, and the id of the existing row that is the duplicate. */
  key: string;
  existing: string;
  refused: string;
  /** The same rule on the route that edits that row: the key is in the path. */
  edit?: { route: string; controller: Handler; handler: string; params: Record<string, string>; body: Record<string, unknown> };
}

const CREATE_ROWS: CreateRow[] = [
  {
    route: "POST /lesson/practice/question/:lessonpracticeid/:questionid/:lessonpracticequestionorder",
    controller: LessonPracticeQuestionController,
    handler: "addpracticequestion",
    params: { lessonpracticeid: PRACTICE, questionid: QUESTION_ADDED, lessonpracticequestionorder: "2" },
    body: {},
    key: "lessonpracticequestionid",
    existing: uuid(610),
    refused: "That question has already been added to this practice.",
  },
  {
    route: "POST /lesson/quiz/question/:lessonquizid/:questionid/:lessonquizquestionorder",
    controller: LessonQuizQuestionController,
    handler: "addquizquestion",
    params: { lessonquizid: QUIZ, questionid: QUESTION_ADDED, lessonquizquestionorder: "2" },
    body: {},
    key: "lessonquizquestionid",
    existing: uuid(711),
    refused: "That question has already been added to this quiz.",
  },
  {
    route: "POST /level/quiz/question/:levelid/:questionid/:levelquizquestionorder",
    controller: LevelQuizQuestionController,
    handler: "addquizquestion",
    params: { levelid: uuid(702), questionid: QUESTION_ADDED, levelquizquestionorder: "2" },
    body: {},
    key: "levelquizquestionid",
    existing: uuid(712),
    refused: "That question has already been added",
  },
  {
    route: "POST /baselinequestion/create",
    controller: BaselinequestionController,
    handler: "create",
    params: {},
    body: { curriculumbaselineid: BASELINE_WITH_QUESTION, questionid: QUESTION_ADDED, baselinequestionorder: 2 },
    key: "baselinequestionid",
    existing: uuid(410),
    refused: "That question has already been added.",
  },
  {
    route: "POST /lesson/learning/:lessonid",
    controller: LessonLearningController,
    handler: "addlearning",
    params: { lessonid: LESSON },
    body: { documentid: DOCUMENT, lessonlearningname: "Learning two", lessonlearningorder: 2 },
    key: "lessonlearningid",
    existing: LEARNING,
    refused: "That learning document has already been added to this lesson.",
    edit: {
      route: "PUT /lesson/learning/:lessonlearningid",
      controller: LessonLearningController,
      handler: "updatelearning",
      params: { lessonlearningid: LEARNING },
      body: { lessonid: LESSON, documentid: DOCUMENT, lessonlearningname: "Learning" },
    },
  },
  {
    route: "POST /lesson/practice/:lessonid",
    controller: LessonPracticeController,
    handler: "addpractice",
    params: { lessonid: LESSON },
    body: { lessonpracticename: "Practice" },
    key: "lessonpracticeid",
    existing: PRACTICE,
    refused: "already",
    edit: {
      route: "PUT /lesson/practice/:lessonpracticeid",
      controller: LessonPracticeController,
      handler: "updatepractice",
      params: { lessonpracticeid: PRACTICE },
      body: { lessonid: LESSON, lessonpracticename: "Practice" },
    },
  },
  {
    route: "POST /lesson/quiz/:lessonid",
    controller: LessonQuizController,
    handler: "addquiz",
    params: { lessonid: LESSON },
    body: { lessonquizname: "Quiz" },
    key: "lessonquizid",
    existing: QUIZ,
    refused: "already",
    edit: {
      route: "PUT /lesson/quiz/:lessonquizid",
      controller: LessonQuizController,
      handler: "updatequiz",
      params: { lessonquizid: QUIZ },
      body: { lessonid: LESSON, lessonquizname: "Quiz" },
    },
  },
  {
    route: "POST /lesson/plan/:lessonid",
    controller: LessonPlanController,
    handler: "addplan",
    params: { lessonid: LESSON },
    body: { documentid: DOCUMENT, lessonplanname: "Plan two", lessonplanorder: 2 },
    key: "lessonlearningid",
    existing: LEARNING,
    refused: "already been added",
    edit: {
      route: "PUT /lesson/plan/:lessonplanid",
      controller: LessonPlanController,
      handler: "updatelearning",
      params: { lessonplanid: PLAN },
      body: { lessonid: LESSON, documentid: DOCUMENT2, lessonplanname: "Plan" },
    },
  },
  {
    route: "POST /curriculumbaseline/create",
    controller: CurriculumBaseLineController,
    handler: "create",
    params: {},
    body: { curriculumid: CURRICULUM, baselineid: uuid(799), baselinename: "Baseline two", baselinetype: 1 },
    key: "curriculumbaselineid",
    existing: BASELINE_WITH_QUESTION,
    refused: "already exists",
    edit: {
      route: "PUT /curriculumbaseline/update/:curriculumbaselineid",
      controller: CurriculumBaseLineController,
      handler: "update",
      params: { curriculumbaselineid: BASELINE_WITH_QUESTION },
      body: { curriculumid: CURRICULUM, baselinename: "Baseline two", baselinetype: 1 },
    },
  },
];

/** The route's business rules alone, over a request. */
const businessVerdict = async (
  r: { controller: Handler; handler: string },
  request: { params: Record<string, string>; query?: Record<string, unknown>; body?: Record<string, unknown> },
): Promise<unknown> => {
  const interceptors: NestInterceptor[] = Reflect.getMetadata(INTERCEPTORS_METADATA, (r.controller.prototype as Record<string, object>)[r.handler]);
  const business = interceptors.filter((i) => i instanceof BusinessValidationInterceptor);
  expect(business.length).toBeGreaterThan(0);
  const req = { user: users.organisation, params: request.params, query: request.query ?? {}, body: request.body ?? {} };
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  try {
    for (const interceptor of business) {
      await (await interceptor.intercept(context, { handle: () => of("ok") })).toPromise();
    }
    return "ok";
  } catch (e) {
    const err = e as { name?: string; message?: string; fields?: unknown; getStatus?: () => number };
    return { name: err.name, status: err.getStatus?.(), message: err.message, fields: err.fields };
  }
};

describe("business rules compare with the rows that exist", () => {
  beforeEach(() => {
    db.install();
    seed();
  });

  it.each(CREATE_ROWS.map((r) => [r.route, r] as const))("%s: a duplicate is refused", async (_route, row) => {
    const plain = await businessVerdict(row, { params: row.params, body: row.body });
    expect(plain).not.toBe("ok");
    expect(JSON.stringify(plain)).toContain(row.refused);
  });

  it.each(CREATE_ROWS.map((r) => [r.route, r] as const))("%s: a duplicate is refused whatever else the request names", async (_route, row) => {
    const plain = await businessVerdict(row, { params: row.params, body: row.body });
    expect(await businessVerdict(row, { params: row.params, body: row.body, query: { [row.key]: row.existing } })).toEqual(plain);
    expect(await businessVerdict(row, { params: row.params, body: { ...row.body, [row.key]: row.existing } })).toEqual(plain);
    // a list in place of an id is not an id: the answer is the same, not a failure
    expect(await businessVerdict(row, { params: row.params, body: row.body, query: { [row.key]: [row.existing] } })).toEqual(plain);
    expect(await businessVerdict(row, { params: row.params, body: { ...row.body, [row.key]: [row.existing] } })).toEqual(plain);
  });

  it.each(CREATE_ROWS.filter((r) => r.edit).map((r) => [r.edit!.route, r.edit!] as const))(
    "%s: the row named in the path is left out of the comparison",
    async (_route, edit) => {
      expect(await businessVerdict(edit, { params: edit.params, body: edit.body })).toBe("ok");
    },
  );
});
