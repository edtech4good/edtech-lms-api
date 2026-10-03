import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { schools } from "src/models/data-models/school";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake, ContentTable } from "src/test-support/content-fake";
import { BaselinequestionController } from "./baselinequestion/baselinequestion.controller";
import { CurriculumBaseLineController } from "./curriculumbaseline/curriculumbaseline.controller";
import { CurriculumController } from "./curriculum/curriculum.controller";
import { DocumentController } from "./document/document.controller";
import { GradeController } from "./grade/grade.controller";
import { LessonController } from "./lesson/lesson.controller";
import { LessonLearningController } from "./lesson/lesson.learning.controller";
import { LessonPlanController } from "./lesson/lesson.plan.controller";
import { LessonPracticeController } from "./lesson/lesson.practice.controller";
import { LessonPracticeQuestionController } from "./lesson/lesson.practice.questions.controller";
import { LessonQuizController } from "./lesson/lesson.quiz.controller";
import { LessonQuizQuestionController } from "./lesson/lesson.quiz.questions.controller";
import { LevelController } from "./level/level.controller";
import { LevelQuizQuestionController } from "./level/level.quiz.questions.controller";
import { QuestionController } from "./question/question.controller";
import { StudentController } from "./students/student.controller";

/**
 * Attaching refuses a link between two owners that differ. For every attach path,
 * with a parent and an attached thing owned by X, Y or nobody: the same owner is
 * allowed; two different owners are refused (400, the same message, nothing
 * written); when either side has no owner yet it is allowed (until the owner
 * column is made required). A refusal that must have written nothing is checked
 * against a snapshot of every table taken just before the request, so an update
 * that was let through shows. Driven over real HTTP through the real strategy,
 * guards, controllers, validators and business classes; the models are an
 * in-memory copy of the content tables.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

// A learning's points are recomputed after it is added; that is not under test.
jest.mock("src/business/lesson.business", () => {
  const actual = jest.requireActual("src/business/lesson.business");
  return {
    ...actual,
    LessonBusiness: jest.fn().mockImplementation(() => {
      const real = new actual.LessonBusiness();
      real.updatelearningpracticequiz = jest.fn();
      return real;
    }),
  };
});

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MESSAGE = "These belong to different organisations, so one can't be attached to the other.";
const db = new ContentFake();
const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };

let counter = 0;
const uid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

type Fx = ReturnType<typeof makeFixture>;
const makeFixture = (owner: string | null) => {
  const tag = owner === X ? "tagx" : owner === Y ? "tagy" : "tagu";
  const f = {
    owner,
    curriculum: uid(), grade: uid(), level: uid(), lesson: uid(), practice: uid(), quiz: uid(), baseline: uid(),
    question: uid(), document: uid(), subject: uid(), learning: uid(), plan: uid(), school: uid(),
    qtag: `q${tag}`, dtag: `d${tag}`,
  };
  db.add("curriculums", { curriculumid: f.curriculum, curriculumname: `c-${tag}`, curriculumstatus: true, organisationid: owner, subjectid: f.subject });
  db.add("subjects", { subjectid: f.subject, subjectname: `s-${tag}`, subjectstatus: true, organisationid: owner });
  db.add("grades", { gradeid: f.grade, curriculumid: f.curriculum });
  db.add("levels", { levelid: f.level, gradeid: f.grade });
  db.add("lessons", { lessonid: f.lesson, levelid: f.level });
  db.add("lessonpractices", { lessonpracticeid: f.practice, lessonid: f.lesson });
  db.add("lessonquizzes", { lessonquizid: f.quiz, lessonid: f.lesson });
  db.add("lessonlearnings", { lessonlearningid: f.learning, lessonid: f.lesson, documentid: f.document });
  db.add("lessonplans", { lessonplanid: f.plan, lessonid: f.lesson, documentid: f.document });
  db.add("curriculumbaseline", { curriculumbaselineid: f.baseline, curriculumid: f.curriculum, baselinetype: 1, baselinestatus: true });
  db.add("questions", { questionid: f.question, questionidentifier: `qi-${tag}`, organisationid: owner, questiontags: [] });
  db.add("documents", { documentid: f.document, documentname: `doc-${tag}`, documenttypeid: 1, organisationid: owner, documenttags: [] });
  db.add("questiontags", { questiontagid: uid(), questiontagname: f.qtag, organisationid: owner });
  db.add("documenttags", { documenttagid: uid(), documenttagname: f.dtag, organisationid: owner });
  db.add("schools", { schoolid: f.school, schoolname: `school-${tag}`, organisationid: owner, curriculums: [] });
  return f;
};

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002];
const asX = bearer({ lmsuserid: "oa", lmsuserroles: [Role.organisationadmin], permissions: PERMS, organisationid: X, isplatform: false });

type Case = [label: string, parent: string | null, other: string | null, allowed: boolean];
const OWNERS: Case[] = [
  ["the same owner (X, X)", X, X, true],
  ["different owners (X, Y)", X, Y, false],
  ["different owners (Y, X)", Y, X, false],
  ["the attached side has no owner (X, none)", X, null, true],
  ["the parent has no owner (none, Y)", null, Y, true],
  ["neither has an owner", null, null, true],
];

describe("attaching refuses a cross-owner link", () => {
  let app: INestApplication;
  const fx: Record<string, Fx> = {};
  const fixtureOf = (owner: string | null) => fx[String(owner)];

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [
        LessonPracticeQuestionController, LessonQuizQuestionController, LevelQuizQuestionController, LessonLearningController, LessonPlanController,
        BaselinequestionController, CurriculumBaseLineController, CurriculumController, QuestionController, DocumentController,
        GradeController, LevelController, LessonController, LessonPracticeController, LessonQuizController, StudentController,
      ],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    tokenExists.mockResolvedValue(true);
    db.install();
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    counter = 0;
    // a second set per owner (the "other" side must be a different row from the parent)
    for (const owner of [X, Y, null]) fx[String(owner)] = makeFixture(owner);
  });

  /** Every table as it stood when the last request was sent (after the spec set its rows up). */
  let before: ReturnType<ContentFake["snapshot"]>;
  const call = (method: "post" | "put" | "get", path: string, body?: object, token = asX) => {
    before = db.snapshot();
    const req = request(app.getHttpServer())[method](path).set("Authorization", token);
    return body ? req.send(body) : req;
  };

  /** Runs one path over every owner combination. `table` is the table the attach writes to (checked after a refusal). */
  const matrix = (
    name: string,
    table: ContentTable,
    send: (parent: Fx, other: Fx) => ReturnType<typeof call>,
    created = true,
  ) =>
    describe(name, () => {
      it.each(OWNERS)("%s", async (_label, parentOwner, otherOwner, allowed) => {
        // distinct rows even for the same owner: use two fixtures of that owner
        const parent = fixtureOf(parentOwner);
        const other = parentOwner === otherOwner ? makeFixture(otherOwner) : fixtureOf(otherOwner);
        const res = await send(parent, other);
        if (allowed) {
          expect(res.status).toBe(200);
          if (created) expect(db.createdIn(table).length).toBeGreaterThan(0);
          else expect(db.snapshot()).not.toEqual(before);
        } else {
          expect(res.status).toBe(400);
          expect(res.body.code).toBe("INVALID_INPUT");
          expect(res.body.errormessage).toBe(MESSAGE);
          expect(JSON.stringify(res.body)).not.toContain(X);
          expect(JSON.stringify(res.body)).not.toContain(Y);
          expect(db.createdIn(table)).toEqual([]);
          expect(db.snapshot()).toEqual(before);
        }
      });
    });

  describe("a question to a practice, a quiz, a level quiz and a baseline", () => {
    matrix("POST /lesson/practice/question/:practiceid/:questionid/:order", "lessonpracticequestions", (p, q) =>
      call("post", `/lesson/practice/question/${p.practice}/${q.question}/1`));
    matrix("POST /lesson/quiz/question/:quizid/:questionid/:order", "lessonquizquestions", (p, q) =>
      call("post", `/lesson/quiz/question/${p.quiz}/${q.question}/1`));
    matrix("POST /level/quiz/question/:levelid/:questionid/:order", "levelquizquestions", (p, q) =>
      call("post", `/level/quiz/question/${p.level}/${q.question}/1`));
    matrix("POST /baselinequestion/create", "baselinequestion", (p, q) =>
      call("post", "/baselinequestion/create", { curriculumbaselineid: p.baseline, questionid: q.question, baselinequestionorder: 1 }));
  });

  describe("a lesson set on a level quiz question: the lesson must have the owner of both ends of the row", () => {
    matrix("PUT /level/quiz/question/setlesson/:id", "levelquizquestions", (rowOwner, lessonFx) => {
      const row = uid();
      db.add("levelquizquestions", { levelquizquestionid: row, levelid: rowOwner.level, questionid: rowOwner.question });
      return call("put", `/level/quiz/question/setlesson/${row}`, { lessonid: lessonFx.lesson });
    }, false);

    it("a row whose own ends disagree is judged by both: a lesson of Y cannot be set on a row of X, whatever the question's owner", async () => {
      const row = uid();
      db.add("levelquizquestions", { levelquizquestionid: row, levelid: fx[X].level, questionid: fx.null.question });
      expect((await call("put", `/level/quiz/question/setlesson/${row}`, { lessonid: fx[Y].lesson })).status).toBe(400);
      expect(db.snapshot()).toEqual(before);
      expect((await call("put", `/level/quiz/question/setlesson/${row}`, { lessonid: fx[X].lesson })).status).toBe(200);
      expect(db.snapshot()).not.toEqual(before);
    });

    it("...and by the question end alone: a row on an unowned level whose question is X's takes no lesson of Y", async () => {
      const row = uid();
      db.add("levelquizquestions", { levelquizquestionid: row, levelid: fx.null.level, questionid: fx[X].question });
      expect((await call("put", `/level/quiz/question/setlesson/${row}`, { lessonid: fx[Y].lesson })).status).toBe(400);
      expect(db.snapshot()).toEqual(before);
      expect((await call("put", `/level/quiz/question/setlesson/${row}`, { lessonid: fx[X].lesson })).status).toBe(200);
      expect(db.snapshot()).not.toEqual(before);
    });
  });

  describe("a document to a learning and to a plan", () => {
    const learning = (p: Fx, d: Fx) => ({ documentid: d.document, lessonlearningname: "ការរៀន", lessonlearningdescription: "ពិពណ៌នា", lessonlearningorder: 1 });
    const learningUpdate = (p: Fx, d: Fx) => ({ documentid: d.document, lessonid: p.lesson, lessonlearningname: "ការរៀន", lessonlearningdescription: "ពិពណ៌នា" });
    matrix("POST /lesson/learning/:lessonid", "lessonlearnings", (p, d) => call("post", `/lesson/learning/${p.lesson}`, learning(p, d)));
    matrix("PUT /lesson/learning/:id (re-pointing its document)", "lessonlearnings", (p, d) =>
      call("put", `/lesson/learning/${p.learning}`, learningUpdate(p, d)), false);
    const plan = (d: Fx) => ({ documentid: d.document, lessonplanname: "ផែនការ", lessonplandescription: "ពិពណ៌នា", lessonplanorder: 1 });
    const planUpdate = (p: Fx, d: Fx) => ({ documentid: d.document, lessonid: p.lesson, lessonplanname: "ផែនការ", lessonplandescription: "ពិពណ៌នា" });
    matrix("POST /lesson/plan/:lessonid", "lessonplans", (p, d) => call("post", `/lesson/plan/${p.lesson}`, plan(d)));
    matrix("PUT /lesson/plan/:id (re-pointing its document)", "lessonplans", (p, d) =>
      call("put", `/lesson/plan/${p.plan}`, planUpdate(p, d)), false);
  });

  describe("a tag to a question and to a document (tags are stored by name)", () => {
    matrix("GET /question/tag/:questionid/:tag", "questions", (p, t) => call("get", `/question/tag/${p.question}/${t.qtag}`), false);
    matrix("GET /document/tag/:documentid/:tag", "documents", (p, t) => call("get", `/document/tag/${p.document}/${t.dtag}`), false);

    it("POST /question/create with tags: X's question takes X's tag and a name nobody has, not Y's tag", async () => {
      const body = (tags: string[]) => ({ questionidentifier: `new-${tags.join("-")}`, questiontext: "សួស្តី", templatetypeid: 1, questioncorrectvalue: 1, questiontags: tags });
      expect((await call("post", "/question/create", body([fx[X].qtag, "brandnew"]))).status).toBe(200);
      const refused = await call("post", "/question/create", body([fx[Y].qtag]));
      expect(refused.status).toBe(400);
      expect(refused.body.errormessage).toBe(MESSAGE);
      expect(db.createdIn("questions")).toHaveLength(1);
    });
  });

  describe("a subject to a curriculum", () => {
    matrix("PUT /curriculum/:id (changing its subject)", "curriculums", (p, s) =>
      call("put", `/curriculum/${p.curriculum}`, { curriculumname: "Renamed", subjectid: s.subject, countryid: [] }), false);
  });

  describe("a baseline to its curriculum and its schools", () => {
    let named = 0;
    const body = (curriculum: Fx, schools: Fx[] = []) => ({
      baselineid: curriculum.curriculum, curriculumid: curriculum.curriculum, baselinename: `Baseline ${++named}`, baselinetype: 2,
      startdate: "2026-01-01", enddate: "2026-12-31", schoolid: schools.map((s) => s.school),
    });
    it("X's Organisation Admin may make a baseline for a curriculum of X and for an unowned one, not for one of Y (400, nothing written)", async () => {
      expect((await call("post", "/curriculumbaseline/create", body(fx[X]))).status).toBe(200);
      expect((await call("post", "/curriculumbaseline/create", body(fx.null))).status).toBe(200);
      db.created.length = 0;
      const refused = await call("post", "/curriculumbaseline/create", body(fx[Y]));
      expect(refused.status).toBe(400);
      expect(refused.body.errormessage).toBe(MESSAGE);
      expect(db.createdIn("curriculumbaseline")).toEqual([]);
      expect(db.snapshot()).toEqual(before);
    });

    it("a school of another owner than the curriculum cannot be attached; one of the same owner or none can", async () => {
      db.created.length = 0;
      expect((await call("post", "/curriculumbaseline/create", body(fx[X], [fx[Y]]))).status).toBe(400);
      expect(db.createdIn("curriculumbaseline")).toEqual([]);
      expect(db.snapshot()).toEqual(before);
      expect((await call("post", "/curriculumbaseline/create", body(fx[X], [fx[X], fx.null]))).status).toBe(200);
    });

    it("a platform user acting as X is judged as X; one not acting has no side to compare and is not refused", async () => {
      const acting = bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: X, isplatform: true });
      const notActing = bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: null, isplatform: true });
      const send = (token: string, curriculum: Fx) => request(app.getHttpServer()).post("/curriculumbaseline/create").set("Authorization", token).send(body(curriculum));
      expect((await send(acting, fx[Y])).status).toBe(400);
      expect((await send(acting, fx[X])).status).toBe(200);
      expect((await send(notActing, fx[Y])).status).toBe(200);
    });

    it("PUT /curriculumbaseline/update/:id: re-pointing it at a curriculum of another owner is refused (400)", async () => {
      const res = await call("put", `/curriculumbaseline/update/${fx[X].baseline}`, { ...body(fx[Y]), baselineid: fx[Y].curriculum });
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe(MESSAGE);
      expect(db.snapshot()).toEqual(before);
    });

    const stored = (baseline: string) => db.tables.curriculumbaseline.find((r) => r.curriculumbaselineid === baseline)!;

    it("PUT /curriculumbaseline/update/:id: a baselineid of another owner in the body is not stored; the curriculum's own id is", async () => {
      const res = await call("put", `/curriculumbaseline/update/${fx[X].baseline}`, { ...body(fx[X]), baselineid: fx[Y].curriculum });
      expect(res.status).toBe(200);
      expect(stored(fx[X].baseline).curriculumid).toBe(fx[X].curriculum);
      expect(stored(fx[X].baseline).baselineid).toBe(fx[X].curriculum);
      expect(JSON.stringify(stored(fx[X].baseline))).not.toContain(fx[Y].curriculum);
    });

    it("PUT /curriculumbaseline/update/:id: the body is checked like create's: no curriculumid is a 400 (INVALID_INPUT) and nothing is written", async () => {
      const { curriculumid, ...withoutCurriculum } = body(fx[X]);
      expect(curriculumid).toBeDefined();
      const res = await call("put", `/curriculumbaseline/update/${fx[X].baseline}`, withoutCurriculum);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_INPUT");
      expect(db.snapshot()).toEqual(before);
    });
  });

  describe("a subtree moved to a new parent: it may only go to a parent of its own owner (the parent id is a body field of the update)", () => {
    const platformNotActing = bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: null, isplatform: true });
    const names = { gradename: "Grade A", levelname: "Level A", lessonname: "Lesson A", lessonpracticename: "Practice A", lessonquizname: "Quiz A" };
    // [route, the update sent for `own` (the subtree) with `newParent` as the parent id, the stored parent id of own]
    const routes: Array<[string, (own: Fx, newParent: Fx) => ReturnType<typeof call>, (own: Fx) => string]> = [
      ["PUT /grade/:id (curriculumid)", (own, np) =>
        call("put", `/grade/${own.grade}`, { gradename: names.gradename, gradeorder: 1, curriculumid: np.curriculum, passing_points: 8 }), (own) => own.curriculum],
      ["PUT /level/:id (gradeid)", (own, np) =>
        call("put", `/level/${own.level}`, { levelname: names.levelname, levelorder: 1, gradeid: np.grade, quiz_points: 10, passing_points: 8 }), (own) => own.grade],
      ["PUT /lesson/:id (levelid)", (own, np) =>
        call("put", `/lesson/${own.lesson}`, { lessonname: names.lessonname, lessonorder: 1, levelid: np.level, total_points: 100, passing_points: 0 }), (own) => own.level],
      ["PUT /lesson/practice/:id (lessonid)", (own, np) =>
        call("put", `/lesson/practice/${own.practice}`, { lessonid: np.lesson, lessonpracticename: names.lessonpracticename, lessonpracticedescription: "ពិពណ៌នា", points: 10 }), (own) => own.lesson],
      ["PUT /lesson/quiz/:id (lessonid)", (own, np) =>
        call("put", `/lesson/quiz/${own.quiz}`, { lessonid: np.lesson, lessonquizname: names.lessonquizname, lessonquizdescription: "ពិពណ៌នា", points: 10 }), (own) => own.lesson],
    ];
    for (const [name, send] of routes) matrix(name, "grades", send, false);

    // a baseline's own owner is its curriculum's. The caller check already judges the new curriculum, so the rows that
    // isolate the new rule are those where the caller is not acting (no side to compare) or is X with a baseline of Y.
    const baselineUpdate = (own: Fx, np: Fx, token = asX) =>
      call("put", `/curriculumbaseline/update/${own.baseline}`, {
        baselineid: np.curriculum, curriculumid: np.curriculum, baselinename: "Moved baseline", baselinetype: 2,
        startdate: "2026-01-01", enddate: "2026-12-31", schoolid: [],
      }, token);
    describe("PUT /curriculumbaseline/update/:id (curriculumid), by a platform user who is not acting", () => {
      it.each(OWNERS)("%s", async (_label, ownOwner, newOwner, allowed) => {
        const own = fixtureOf(ownOwner);
        const np = ownOwner === newOwner ? makeFixture(newOwner) : fixtureOf(newOwner);
        const res = await baselineUpdate(own, np, platformNotActing);
        if (allowed) {
          expect(res.status).toBe(200);
          expect(db.snapshot()).not.toEqual(before);
        } else {
          expect(res.status).toBe(400);
          expect(res.body.errormessage).toBe(MESSAGE);
          expect(db.snapshot()).toEqual(before);
        }
      });
    });
    it("PUT /curriculumbaseline/update/:id: X's Organisation Admin cannot move a baseline of Y onto a curriculum of X (its own curriculum is judged too)", async () => {
      const res = await baselineUpdate(fx[Y], fx[X]);
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe(MESSAGE);
      expect(db.snapshot()).toEqual(before);
    });

    describe("a form that sends the stored parent id again is not refused", () => {
      const resend: Array<[string, (own: Fx) => ReturnType<typeof call>]> = [
        ...routes.map(([name, send]) => [name, (own: Fx) => send(own, own)] as [string, (own: Fx) => ReturnType<typeof call>]),
        ["PUT /curriculumbaseline/update/:id (curriculumid)", (own) => baselineUpdate(own, own)],
      ];
      it.each(resend)("%s: 200", async (_name, send) => {
        expect((await send(fx[X])).status).toBe(200);
        expect(db.snapshot()).not.toEqual(before);
      });
    });
  });

  describe("a learner enrolled on a curriculum: the school and the curriculum must have the same owner", () => {
    const row = (n: number) => ({
      city: "ភ្នំពេញ", country: "Cambodia", dateofjoin: "01-01-2026", studentfirstname: `សុខា${n}`, genderid: "1", state: "Phnom Penh",
      schoolusername: `learner${n}`, schooluserpasswordhash: "pass1234",
    });
    const importBody = (school: Fx, curriculums: Fx[]) => ({ curriculumid: curriculums.map((c) => c.curriculum), schoolid: school.school, standard: "Class A", students: [row(1)] });
    matrix("POST /student/create (the import)", "students", (school, curriculum) => call("post", "/student/create", importBody(school, [curriculum])));

    it("a second curriculum of another owner among the first stops the whole import (400), nothing is written", async () => {
      const refused = await call("post", "/student/create", importBody(fx[X], [fx[X], fx[Y]]));
      expect(refused.status).toBe(400);
      expect(refused.body.errormessage).toBe(MESSAGE);
      expect(db.createdIn("students")).toEqual([]);
      expect(db.createdIn("schoolusers")).toEqual([]);
      expect(db.snapshot()).toEqual(before);
    });

    describe("the CSV update (PUT /student/update), refused before any row is written", () => {
      const nameOf = (f: Fx) => String(db.tables.curriculums.find((c) => c.curriculumid === f.curriculum)!.curriculumname);
      const schoolNameOf = (f: Fx) => String(db.tables.schools.find((c) => c.schoolid === f.school)!.schoolname);
      // a learner in the school of `f`, and the CSV row that names a school and curriculums for it
      const learner = (f: Fx, n: number) => {
        const studentid = uid();
        const schooluserid = uid();
        db.add("students", { studentid, schooluserid, schoolid: f.school, schooluser: { schooluserid, schoolusername: `learner${n}` }, curriculumids: [] });
        db.add("schoolusers", { schooluserid, schoolusername: `learner${n}`, schoolid: f.school });
        return { studentid, schooluserid, n };
      };
      const csvRow = (l: { studentid: string; schooluserid: string; n: number }, school: Fx, curriculum: Fx) => ({
        studentid: l.studentid, schooluserid: l.schooluserid, schoolusername: `learner${l.n}`, schoolname: schoolNameOf(school), standard: "Class A",
        curriculums: nameOf(curriculum), studentfirstname: `សុខា${l.n}`, genderid: "1", city: "ភ្នំពេញ", country: "Cambodia", state: "Phnom Penh",
        dateofjoin: "01-01-2026", isactive: 1,
      });
      const update = (rows: object[]) => call("put", "/student/update", { students: rows });
      const storedCurriculums = (l: { studentid: string }) => db.tables.students.find((r) => r.studentid === l.studentid)!.curriculumids;
      beforeEach(() => {
        db.add("standards", { standardid: uid(), standardname: "Class A" });
        // the school is found by its name through `WHERE TRIM(schoolname) = ?`, which the fake does not read
        jest.spyOn(schools, "findAll").mockImplementation((async (o: { where: { logic: string } }) =>
          db.tables.schools.filter((r) => String(r.schoolname).trim() === o.where.logic)) as never);
      });

      it("a curriculum of the school's owner is enrolled, and so is an unowned one", async () => {
        const own = learner(fx[X], 1);
        const unowned = learner(fx[X], 2);
        expect((await update([csvRow(own, fx[X], fx[X]), csvRow(unowned, fx[X], fx.null)])).status).toBe(200);
        expect(storedCurriculums(own)).toEqual([fx[X].curriculum]);
        expect(storedCurriculums(unowned)).toEqual([fx.null.curriculum]);
      });

      it("a curriculum of another owner is refused (400), and the rows before it in the file are not written either", async () => {
        const first = learner(fx[X], 1);
        const second = learner(fx[X], 2);
        const res = await update([csvRow(first, fx[X], fx[X]), csvRow(second, fx[X], fx[Y])]);
        expect(res.status).toBe(400);
        expect(res.body.errormessage).toBe(MESSAGE);
        expect(db.snapshot()).toEqual(before);
        expect(storedCurriculums(first)).toEqual([]);
      });
    });
  });

  describe("a baseline clone: the clone is the target curriculum's, so the owners must agree and so must every question copied", () => {
    const clone = (source: Fx, target: Fx) => call("post", "/baselinequestion/clone", { curriculumbaselineid: source.baseline, clonecurriculumbaselineid: target.baseline });
    beforeEach(() => {
      // every fixture's baseline holds one question; the targets of a clone are fresh (empty) baselines
      for (const f of Object.values(fx)) db.add("baselinequestion", { baselinequestionid: uid(), curriculumbaselineid: f.baseline, questionid: f.question, baselinequestionorder: 1, baselinequestionstatus: true });
    });
    it("two baselines of one owner: allowed, and the copies are written", async () => {
      const second = makeFixture(X);
      expect((await clone(fx[X], second)).status).toBe(200);
      expect(db.createdIn("baselinequestion").length).toBeGreaterThan(0);
    });
    it("a baseline of X cannot be cloned onto one of Y, or the other way (400), nothing is written", async () => {
      expect((await clone(fx[X], makeFixture(Y))).status).toBe(400);
      expect(db.snapshot()).toEqual(before);
      expect((await clone(fx[Y], makeFixture(X))).status).toBe(400);
      expect(db.snapshot()).toEqual(before);
      expect(db.createdIn("baselinequestion")).toEqual([]);
    });
    it("a question that belongs to another owner than the target baseline stops the clone", async () => {
      const second = makeFixture(X);
      db.tables.baselinequestion.find((r) => r.curriculumbaselineid === fx[X].baseline)!.questionid = fx[Y].question;
      expect((await clone(fx[X], second)).status).toBe(400);
      expect(db.createdIn("baselinequestion")).toEqual([]);
      expect(db.snapshot()).toEqual(before);
    });
    it("...also when the source baseline is unowned: it takes no question of Y onto a baseline of X (the question is judged against the target)", async () => {
      db.tables.baselinequestion.find((r) => r.curriculumbaselineid === fx.null.baseline)!.questionid = fx[Y].question;
      expect((await clone(fx.null, makeFixture(X))).status).toBe(400);
      expect(db.createdIn("baselinequestion")).toEqual([]);
      expect(db.snapshot()).toEqual(before);
    });
    it("the two baselines' own owners are compared even when no copied question carries an owner", async () => {
      db.tables.questions.find((q) => q.questionid === fx[X].question)!.organisationid = null;
      expect((await clone(fx[X], makeFixture(Y))).status).toBe(400);
      expect(db.createdIn("baselinequestion")).toEqual([]);
      expect(db.snapshot()).toEqual(before);
    });
    it("unowned baselines clone onto an owned one (until the owners are assigned)", async () => {
      expect((await clone(fx.null, makeFixture(X))).status).toBe(200);
    });
  });
});
