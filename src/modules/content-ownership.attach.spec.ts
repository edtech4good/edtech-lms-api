import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { ContentFake, ContentTable } from "src/test-support/content-fake";
import { BaselinequestionController } from "./baselinequestion/baselinequestion.controller";
import { CurriculumBaseLineController } from "./curriculumbaseline/curriculumbaseline.controller";
import { CurriculumController } from "./curriculum/curriculum.controller";
import { DocumentController } from "./document/document.controller";
import { LessonLearningController } from "./lesson/lesson.learning.controller";
import { LessonPlanController } from "./lesson/lesson.plan.controller";
import { LessonPracticeQuestionController } from "./lesson/lesson.practice.questions.controller";
import { LessonQuizQuestionController } from "./lesson/lesson.quiz.questions.controller";
import { LevelQuizQuestionController } from "./level/level.quiz.questions.controller";
import { QuestionController } from "./question/question.controller";

/**
 * Attaching refuses a link between two owners that differ. For every attach path,
 * with a parent and an attached thing owned by X, Y or nobody: the same owner is
 * allowed; two different owners are refused (400, the same message, nothing
 * written); when either side has no owner yet it is allowed (until the owner
 * column is made required). Driven over real HTTP through the real strategy,
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
    counter = 0;
    // a second set per owner (the "other" side must be a different row from the parent)
    for (const owner of [X, Y, null]) fx[String(owner)] = makeFixture(owner);
  });

  const call = (method: "post" | "put" | "get", path: string, body?: object) => {
    const req = request(app.getHttpServer())[method](path).set("Authorization", asX);
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
        } else {
          expect(res.status).toBe(400);
          expect(res.body.code).toBe("INVALID_INPUT");
          expect(res.body.errormessage).toBe(MESSAGE);
          expect(JSON.stringify(res.body)).not.toContain(X);
          expect(JSON.stringify(res.body)).not.toContain(Y);
          expect(db.createdIn(table)).toEqual([]);
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
      expect((await call("put", `/level/quiz/question/setlesson/${row}`, { lessonid: fx[X].lesson })).status).toBe(200);
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
    });

    it("a school of another owner than the curriculum cannot be attached; one of the same owner or none can", async () => {
      db.created.length = 0;
      expect((await call("post", "/curriculumbaseline/create", body(fx[X], [fx[Y]]))).status).toBe(400);
      expect(db.createdIn("curriculumbaseline")).toEqual([]);
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
      expect((await clone(fx[Y], makeFixture(X))).status).toBe(400);
      expect(db.createdIn("baselinequestion")).toEqual([]);
    });
    it("a question that belongs to another owner than the target baseline stops the clone", async () => {
      const second = makeFixture(X);
      db.tables.baselinequestion.find((r) => r.curriculumbaselineid === fx[X].baseline)!.questionid = fx[Y].question;
      expect((await clone(fx[X], second)).status).toBe(400);
      expect(db.createdIn("baselinequestion")).toEqual([]);
    });
    it("unowned baselines clone onto an owned one (until the owners are assigned)", async () => {
      expect((await clone(fx.null, makeFixture(X))).status).toBe(200);
    });
  });
});
