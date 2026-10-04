import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import axios from "axios";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { curriculums } from "src/models/data-models/curriculums";
import { dbinstance } from "src/services/dbservice";
import { ContentFake, ContentTable } from "src/test-support/content-fake";
import { CurriculumBaseLineBusiness } from "src/business/curriculumbaseline.business";
import { CurriculumBusiness } from "src/business/curriculum.business";
import { BaselinequestionModule } from "./baselinequestion/baselinequestion.module";
import { CurriculumBaseLineModule } from "./curriculumbaseline/curriculumbaseline.module";
import { CurriculumModule } from "./curriculum/curriculum.module";
import { DocumentModule } from "./document/document.module";
import { DocumentTagModule } from "./documenttag/documenttag.module";
import { ExportModule } from "./export/export.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { GradeModule } from "./grade/grade.module";
import { LessonModule } from "./lesson/lesson.module";
import { LevelModule } from "./level/level.module";
import { QuestionModule } from "./question/question.module";
import { QuestionTagModule } from "./questiontag/questiontag.module";
import { SubjectModule } from "./subject/subject.module";

/**
 * Content is confined to its organisation (content-scope.ts). Driven over real HTTP through the real strategy,
 * guards, controllers, validators and business classes; replaced are the models (an in-memory copy of the content
 * tables), the token lookup, the file store and the cloud server.
 *
 * Fixtures: organisations X and Y each have a full tree (a subject, a curriculum with a grade, a level, a lesson, a
 * practice, a quiz, a learning and a plan with documents, a level quiz question, a baseline with a question, questions
 * with tags, feedback), and a third tree belongs to no organisation. Callers: X's Organisation Admin, X's Admin, a
 * platform user acting as X, a platform user not acting, the application's server token, and a school-user token.
 *
 * For every route: the caller's own rows answer 200 with only their own data; another organisation's row, and an
 * unowned one, are answered exactly as a row that is not there is (the route's own answer for an absent id: a 400
 * from its request rules where it has them, a 404 where it has not), with every table unchanged; a list holds the
 * caller's rows and none of the others; a platform user not acting still reaches every row, the server token the
 *  routes that admit it, and a school-user token the routes that admit it. The row named in the path is the one
 * checked, whatever else the request names: another organisation's row in the path, with the caller's own row also
 * named by the request, is the 404 an absent one gets.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn(), get: jest.fn() } }));
const uploadS3 = jest.fn();
jest.mock("src/services/aws.service", () => ({
  AWSService: {
    uploadS3: (...a: unknown[]) => uploadS3(...a),
    uploadS3InFolder: jest.fn().mockResolvedValue({ Key: "k" }),
    checkExistS3Object: jest.fn().mockResolvedValue(false),
    preSignURL: jest.fn().mockResolvedValue("https://files.invalid/signed"),
  },
}));
// A lesson's points are recomputed after something is added to it or removed from it; that is not under test.
jest.mock("src/business/lesson.business", () => {
  const actual = jest.requireActual("src/business/lesson.business");
  return {
    ...actual,
    LessonBusiness: jest.fn().mockImplementation((...args: unknown[]) => {
      const real = new actual.LessonBusiness(...args);
      real.updatelearningpracticequiz = jest.fn();
      return real;
    }),
  };
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MISSING = uuid(999999);
const COUNTRY = uuid(100);

type Owner = string | null;
/** One organisation's whole tree of content; the ids differ by `base`. */
const treeOf = (owner: Owner, base: number) => {
  const id = (n: number) => uuid(base + n);
  return {
    owner,
    subject: id(1), curriculum: id(2), grade: id(3), level: id(4), lesson: id(5), practice: id(6), quiz: id(7),
    learning: id(8), plan: id(9), document: id(10), document2: id(11), question: id(12), question2: id(13),
    practiceQuestion: id(14), quizQuestion: id(15), levelQuestion: id(16), baseline: id(17), baselineQuestion: id(18),
      feedback: id(19), school: id(20), login: id(21), student: id(32), questionTag: id(22), documentTag: id(23), baseline2: id(24),
    grade2: id(25), level2: id(26), lesson2: id(27), curriculum2: id(28), subject2: id(29), practice2: id(30),
    quiz2: id(31),
    // names (Khmer: the product is taught in it)
    names: { curriculum: "ភាសាខ្មែរ", grade: "ថ្នាក់ទី១", level: "កម្រិតទី១", lesson: "មេរៀនទី១", subject: "វិទ្យាសាស្ត្រ" },
    tag: owner === X ? "tagx" : owner === Y ? "tagy" : "tagu",
  };
};
type Tree = ReturnType<typeof treeOf>;
const TX = treeOf(X, 1000);
const TY = treeOf(Y, 2000);
const TU = treeOf(null, 3000);
const NAME_OF = { [X]: "ក", [Y]: "ខ", unowned: "គ" } as const;

const db = new ContentFake();
const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002, "view_download_student", "view_feedback", "create_feedback"];
const callers = {
  "X's Organisation Admin": bearer({ lmsuserid: "oa", lmsuserroles: [Role.organisationadmin], permissions: PERMS, organisationid: X, isplatform: false }),
  "X's Admin": bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false }),
  "a platform user acting as X": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: X, isplatform: true }),
  "a platform user not acting": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: null, isplatform: true }),
  "a server token": `Bearer ${Config.fortyk.api.applicationapikey}`,
  // a school-user (teacher) token, as a classroom login is issued one: no staff claims at all
  "a school-user token": bearer({ schooluserid: uuid(499), schooluserrole: SchoolRole.TEACHER }),
} as const;
type Who = keyof typeof callers;
const IN_X: Who[] = ["X's Organisation Admin", "X's Admin", "a platform user acting as X"];
const NOT_ACTING: Who = "a platform user not acting";

type Row = Record<string, unknown>;
type Method = "get" | "post" | "put" | "delete";
const idsOf = (rows: Row[], key: string) => rows.map((r) => r[key] as string).sort();
const sorted = (...ids: string[]) => [...ids].sort();
const withoutReference = (body: Row) => {
  const { reference, logid, stack, ...rest } = body;
  return rest;
};

/** Every table, as the routes find it. */
const seedTree = (t: Tree) => {
  const o = t.owner;
  db.add("subjects", { subjectid: t.subject, subjectname: t.names.subject + NAME_OF[(o ?? "unowned") as keyof typeof NAME_OF], subjectdescription: "ពិពណ៌នា", organisationid: o, subjectstatus: true });
  db.add("subjects", { subjectid: t.subject2, subjectname: "Second " + t.tag, organisationid: o, subjectstatus: true });
  db.add("curriculums", { curriculumid: t.curriculum, curriculumname: t.names.curriculum + NAME_OF[(o ?? "unowned") as keyof typeof NAME_OF], curriculumdescription: "ពិពណ៌នា", organisationid: o, subjectid: t.subject, curriculumstatus: true });
  db.add("curriculums", { curriculumid: t.curriculum2, curriculumname: "Second " + t.tag, organisationid: o, subjectid: t.subject, curriculumstatus: true });
  db.add("curriculumcountry", { curriculumcountryid: t.curriculum.replace(/^0{8}/, "11111111"), curriculumid: t.curriculum, countryid: COUNTRY });
  db.add("grades", { gradeid: t.grade, gradename: t.names.grade + t.tag, gradedescription: "ពិពណ៌នា", gradeorder: 1, gradestatus: true, curriculumid: t.curriculum, passing_points: 8 });
  db.add("grades", { gradeid: t.grade2, gradename: "Second " + t.tag, gradeorder: 2, gradestatus: true, curriculumid: t.curriculum, passing_points: 8 });
  db.add("levels", { levelid: t.level, levelname: t.names.level + t.tag, leveldescription: "ពិពណ៌នា", levelorder: 1, levelstatus: true, gradeid: t.grade, quiz_points: 100, passing_points: 0 });
  db.add("levels", { levelid: t.level2, levelname: "Second " + t.tag, levelorder: 2, levelstatus: true, gradeid: t.grade, quiz_points: 100, passing_points: 0 });
  db.add("lessons", { lessonid: t.lesson, lessonname: t.names.lesson + t.tag, lessondescription: "ពិពណ៌នា", lessonorder: 1, lessonstatus: true, levelid: t.level, total_points: 100, passing_points: 0 });
  db.add("lessons", { lessonid: t.lesson2, lessonname: "Second " + t.tag, lessonorder: 2, lessonstatus: true, levelid: t.level, total_points: 100, passing_points: 0 });
  db.add("lessonpractices", { lessonpracticeid: t.practice, lessonid: t.lesson, lessonpracticename: "Practice " + t.tag, lessonpracticedescription: "ពិពណ៌នា", lessonpracticeorder: 1, lessonpracticestatus: true, points: 10 });
  db.add("lessonpractices", { lessonpracticeid: t.practice2, lessonid: t.lesson, lessonpracticename: "Second practice " + t.tag, lessonpracticedescription: "ពិពណ៌នា", lessonpracticeorder: 2, lessonpracticestatus: true, points: 10 });
  db.add("lessonquizzes", { lessonquizid: t.quiz, lessonid: t.lesson, lessonquizname: "Quiz " + t.tag, lessonquizdescription: "ពិពណ៌នា", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizzes", { lessonquizid: t.quiz2, lessonid: t.lesson, lessonquizname: "Second quiz " + t.tag, lessonquizdescription: "ពិពណ៌នា", lessonquizorder: 2, lessonquizstatus: true, points: 10 });
  db.add("documents", { documentid: t.document, documentname: `doc_${t.tag}.png`, documenttypeid: 1, organisationid: o, documenttags: [], lastupdated: new Date("2026-01-01") });
  db.add("documents", { documentid: t.document2, documentname: `doc2_${t.tag}.png`, documenttypeid: 1, organisationid: o, documenttags: [], lastupdated: new Date("2026-01-02") });
  db.add("lessonlearnings", { lessonlearningid: t.learning, lessonid: t.lesson, documentid: t.document, lessonlearningname: "Learning " + t.tag, lessonlearningdescription: "ពិពណ៌នា", lessonlearningorder: 1, lessonlearningstatus: true });
  db.add("lessonplans", { lessonplanid: t.plan, lessonid: t.lesson, documentid: t.document, lessonplanname: "Plan " + t.tag, lessonplandescription: "ពិពណ៌នា", lessonplanorder: 1, lessonplanstatus: true });
  db.add("questions", { questionid: t.question, questionidentifier: `qi-${t.tag}`, questiontext: "សួស្តី", templatetypeid: 1, organisationid: o, questiontags: [], questionstatus: true, lastupdated: new Date("2026-01-01") });
  db.add("questions", { questionid: t.question2, questionidentifier: `qi2-${t.tag}`, questiontext: "សួស្តី", templatetypeid: 1, organisationid: o, questiontags: [], questionstatus: true, lastupdated: new Date("2026-01-02") });
  db.add("lessonpracticequestions", { lessonpracticequestionid: t.practiceQuestion, lessonpracticeid: t.practice, questionid: t.question, lessonpracticequestionorder: 1, lessonpracticequestionstatus: true });
  db.add("lessonquizquestions", { lessonquizquestionid: t.quizQuestion, lessonquizid: t.quiz, questionid: t.question, lessonquizquestionorder: 1, lessonquizquestionstatus: true });
  db.add("levelquizquestions", { levelquizquestionid: t.levelQuestion, levelid: t.level, questionid: t.question, lessonid: t.lesson, levelquizquestionorder: 1, levelquizquestionstatus: true });
  db.add("questiontags", { questiontagid: t.questionTag, questiontagname: `q${t.tag}`, organisationid: o });
  db.add("documenttags", { documenttagid: t.documentTag, documenttagname: `d${t.tag}`, organisationid: o });
  db.add("curriculumbaseline", { curriculumbaselineid: t.baseline, curriculumid: t.curriculum, baselineid: t.curriculum, baselinename: "Baseline " + t.tag, baselinetype: 1, baselinestatus: true, schoolid: [t.school], created_at: new Date("2026-01-01") });
  db.add("curriculumbaseline", { curriculumbaselineid: t.baseline2, curriculumid: t.curriculum, baselineid: t.curriculum, baselinename: "Midline " + t.tag, baselinetype: 2, baselinestatus: false, schoolid: [], created_at: new Date("2026-01-02") });
  db.add("baselinequestion", { baselinequestionid: t.baselineQuestion, curriculumbaselineid: t.baseline, questionid: t.question, baselinequestionorder: 1, baselinequestionstatus: true });
  db.add("schools", { schoolid: t.school, schoolname: "សាលា " + t.tag, organisationid: o, countryid: COUNTRY, curriculums: [t.curriculum] });
  db.add("schoolusers", { schooluserid: t.login, schoolusername: "login" + t.tag, schooluserrole: SchoolRole.TEACHER, schoolid: t.school, schoolname: "សាលា " + t.tag });
    // a learner of the school, enrolled on the second curriculum
  db.add("students", { studentid: t.student, schoolid: t.school, schooluserid: t.login, curriculumid: t.curriculum2, curriculumids: [t.curriculum2] });
  db.add("feedbacks", {
    feedbackid: t.feedback, curriculumid: t.curriculum, created_by: t.login, teachername: "គ្រូ " + t.tag, feedback: { rpi: { feedback: "ល្អ" } }, image: [],
    created_at: new Date("2026-02-01"),
  });
};

describe("content is confined to the caller's organisation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      imports: [
        SubjectModule, CurriculumModule, DocumentTagModule, QuestionTagModule, DocumentModule, QuestionModule, GradeModule,
        LevelModule, LessonModule, ExportModule, CurriculumBaseLineModule, FeedbackModule, BaselinequestionModule,
      ],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    // listening once, for the whole file: a listener opened and closed per request is what the odd "Parse Error" came from
    await app.listen(0);
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    tokenExists.mockResolvedValue(true);
    uploadS3.mockReset().mockResolvedValue({ Key: "k" });
    db.install();
    for (const t of [TX, TY, TU]) seedTree(t);
    db.add("countries", { countryid: COUNTRY, countryname: "កម្ពុជា" });
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    (axios.get as jest.Mock).mockReset().mockResolvedValue({ data: [] });
  });

  const send = (who: Who, method: Method, path: string, body?: object) => {
    // one connection per request: the routes that refuse before reading a body must not leave bytes for the next
    const r = request(app.getHttpServer())[method](path).set("Authorization", callers[who]).set("Connection", "close");
    return body ? r.send(body) : r;
  };
  /** The whole answer (status and body), without what differs per request. */
  const said = (res: request.Response) => ({ status: res.status, body: withoutReference(res.body) });
  /** A request that must have written nothing: checked against every table as it stood just before. */
  const refuses = async (who: Who, method: Method, path: string, body?: object) => {
    const before = db.snapshot();
    const res = await send(who, method, path, body);
    expect(db.snapshot()).toEqual(before);
    expect(db.created).toEqual([]);
    return res;
  };
  type Req = { path: string; body?: object };
  const r = (path: string, body?: object): Req => ({ path, body });
  /**
   * Another organisation's row (`foreign`) and an unowned one answer exactly as an id that is not there does (the same
   * status and body), and every table is unchanged. `reqOf` builds the request around one id (in the path or the body).
   * Returns the status of the answer for an id that is not there, for the caller to assert.
   */
  const asAbsent = async (who: Who, method: Method, reqOf: (id: string) => Req, foreign: string, unowned: string) => {
    const absent = said(await refuses(who, method, reqOf(MISSING).path, reqOf(MISSING).body));
    expect(said(await refuses(who, method, reqOf(foreign).path, reqOf(foreign).body))).toEqual(absent);
    expect(said(await refuses(who, method, reqOf(unowned).path, reqOf(unowned).body))).toEqual(absent);
    return absent.status;
  };
  /** The unowned tree's row of the same kind as another organisation's `id` (the trees' ids differ by a fixed step). */
  const unownedOf = (id: string) => uuid(Number(id.slice(-12)) + (3000 - 2000));
  /**
   * The row named in the path is the one checked, whatever else the request names: another organisation's row in the
   * path (and the unowned one of the same kind), with the caller's own row of the same kind also named by the request,
   * answers as an id that is not there does for the same request. Returns the status of that answer.
   */
  const asAbsentPath = async (who: Who, method: Method, reqOf: (id: string) => Req, param: string, own: string, foreign: string) => {
    const withOwn = (id: string) => `${reqOf(id).path}?${param}=${own}`;
    const absent = said(await refuses(who, method, withOwn(MISSING), reqOf(MISSING).body));
    expect(said(await refuses(who, method, withOwn(foreign), reqOf(foreign).body))).toEqual(absent);
    expect(said(await refuses(who, method, withOwn(unownedOf(foreign)), reqOf(unownedOf(foreign)).body))).toEqual(absent);
    return absent.status;
  };
  const stored = (table: ContentTable, key: string, id: string) => db.tables[table].find((r) => r[key] === id)!;

  // ───────────────────────────── curriculums ─────────────────────────────
  describe("GET /curriculum/all", () => {
    it.each(IN_X)("%s: X's curriculums, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/curriculum/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "curriculumid")).toEqual(sorted(TX.curriculum, TX.curriculum2));
    });
    it.each(IN_X)("%s: a school or a learner of another organisation cannot be used to widen it", async (who) => {
      const res = await send(who, "get", `/curriculum/all?schoolid=${TY.school}`);
      const absent = await send(who, "get", `/curriculum/all?schoolid=${MISSING}`);
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(absent));
    });
    it.each(IN_X)("%s: a learner of X narrows it; a learner of Y (or of no organisation) is as a learner that is not there is", async (who) => {
      const own = await send(who, "get", `/curriculum/all?studentid=${TX.student}`);
      expect(idsOf(own.body.data, "curriculumid")).toEqual([TX.curriculum2]);
      const absent = await send(who, "get", `/curriculum/all?studentid=${MISSING}`);
      expect(idsOf(absent.body.data, "curriculumid")).toEqual(sorted(TX.curriculum, TX.curriculum2));
      for (const other of [TY.student, TU.student]) {
        expect(said(await send(who, "get", `/curriculum/all?studentid=${other}`))).toEqual(said(absent));
      }
    });
    it.each([NOT_ACTING, "a server token" as Who])("%s: every curriculum, owned or not", async (who) => {
      const res = await send(who, "get", "/curriculum/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "curriculumid")).toEqual(sorted(TX.curriculum, TX.curriculum2, TY.curriculum, TY.curriculum2, TU.curriculum, TU.curriculum2));
    });
  });

  describe("POST /curriculum/create", () => {
    const body = (subjectid: string, over: object = {}) => ({ curriculumname: "មេរៀនគំរូ", curriculumdescription: "ពិពណ៌នា", subjectid, countryid: [COUNTRY], ...over });
    it.each(IN_X)("%s: creates a curriculum that is X's, with X's subject", async (who) => {
      const res = await send(who, "post", "/curriculum/create", body(TX.subject));
      expect(res.status).toBe(200);
      expect(db.createdIn("curriculums")).toEqual([expect.objectContaining({ organisationid: X, subjectid: TX.subject, curriculumname: "មេរៀនគំរូ" })]);
    });
    it.each(IN_X)("%s: a subject of Y, or an unowned one, is the answer an absent subject gets, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r("/curriculum/create", body(id)), TY.subject, TU.subject)).toBe(400);
    });
    it.each(IN_X)("%s: the name is unique among X's curriculums only: Y's name is free", async (who) => {
      const res = await send(who, "post", "/curriculum/create", body(TX.subject, { curriculumname: stored("curriculums", "curriculumid", TY.curriculum).curriculumname }));
      expect(res.status).toBe(200);
      const own = await send(who, "post", "/curriculum/create", body(TX.subject, { curriculumname: stored("curriculums", "curriculumid", TX.curriculum).curriculumname }));
      expect(own.status).toBe(409);
    });
  });

  describe("DELETE /curriculum/:curriculumid", () => {
    it.each(IN_X)("%s: deletes X's curriculum", async (who) => {
      const res = await send(who, "delete", `/curriculum/${TX.curriculum}`);
      expect(res.status).toBe(200);
      expect(stored("curriculums", "curriculumid", TX.curriculum).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's curriculum and an unowned one answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/curriculum/${id}`), TY.curriculum, TU.curriculum)).toBe(400);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/curriculum/${id}`), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it("a platform user not acting: any curriculum, an unowned one too", async () => {
      expect((await send(NOT_ACTING, "delete", `/curriculum/${TY.curriculum}`)).status).toBe(200);
      expect((await send(NOT_ACTING, "delete", `/curriculum/${TU.curriculum}`)).status).toBe(200);
      expect(stored("curriculums", "curriculumid", TY.curriculum).isdeleted).toBe(true);
    });
  });

  describe("GET /curriculum/:curriculumid", () => {
    it.each(IN_X)("%s: X's curriculum", async (who) => {
      const res = await send(who, "get", `/curriculum/${TX.curriculum}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ curriculumid: TX.curriculum, curriculumname: "ភាសាខ្មែរក" });
    });
    it.each(IN_X)("%s: Y's curriculum and an unowned one answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/curriculum/${id}`), TY.curriculum, TU.curriculum)).toBe(400);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/curriculum/${id}`), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it("a platform user not acting: any curriculum, an unowned one too", async () => {
      expect((await send(NOT_ACTING, "get", `/curriculum/${TY.curriculum}`)).body.data.curriculumid).toBe(TY.curriculum);
      expect((await send(NOT_ACTING, "get", `/curriculum/${TU.curriculum}`)).body.data.curriculumid).toBe(TU.curriculum);
    });
  });

  describe("PUT /curriculum/:curriculumid", () => {
    const body = (subjectid: string) => ({ curriculumname: "ឈ្មោះថ្មី", subjectid, countryid: [COUNTRY] });
    it.each(IN_X)("%s: renames X's curriculum, which keeps its owner", async (who) => {
      const res = await send(who, "put", `/curriculum/${TX.curriculum}`, body(TX.subject));
      expect(res.status).toBe(200);
      expect(stored("curriculums", "curriculumid", TX.curriculum)).toMatchObject({ curriculumname: "ឈ្មោះថ្មី", organisationid: X });
    });
    it.each(IN_X)("%s: Y's curriculum and an unowned one answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculum/${id}`, body(TX.subject)), TY.curriculum, TU.curriculum)).toBe(400);
    });
    it.each(IN_X)("%s: a subject of Y or an unowned one answers as an absent subject does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculum/${TX.curriculum}`, body(id)), TY.subject, TU.subject)).toBe(400);
    });
    it.each(IN_X)("%s: the curriculum named in the path is the one checked, whatever else the request names", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/curriculum/${id}`, body(TX.subject)), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it("a platform user not acting: the name is unique within the row's own organisation (X holding a name is no bar to Y's row), and across everything for an unowned row", async () => {
      const nameOf = (id: string) => stored("curriculums", "curriculumid", id).curriculumname as string;
      const put = (id: string, name: string, subject: string) => send(NOT_ACTING, "put", `/curriculum/${id}`, { ...body(subject), curriculumname: name });
      expect((await put(TY.curriculum, nameOf(TX.curriculum), TY.subject)).status).toBe(200);
      expect((await put(TY.curriculum, nameOf(TY.curriculum2), TY.subject)).status).toBe(409);
      expect((await put(TU.curriculum, nameOf(TX.curriculum2), TU.subject)).status).toBe(409);
    });
    it("a platform user not acting: any curriculum, with a subject of its owner", async () => {
      const res = await send(NOT_ACTING, "put", `/curriculum/${TY.curriculum}`, body(TY.subject));
      expect(res.status).toBe(200);
      expect(stored("curriculums", "curriculumid", TY.curriculum).curriculumname).toBe("ឈ្មោះថ្មី");
    });
  });

  describe("PUT /curriculum/activate/:curriculumid", () => {
    it.each(IN_X)("%s: activates X's curriculum", async (who) => {
      stored("curriculums", "curriculumid", TX.curriculum).curriculumstatus = false;
      expect((await send(who, "put", `/curriculum/activate/${TX.curriculum}`)).status).toBe(200);
      expect(stored("curriculums", "curriculumid", TX.curriculum).curriculumstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculum/activate/${id}`), TY.curriculum, TU.curriculum)).toBe(400);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/curriculum/activate/${id}`), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it("a platform user not acting: any curriculum", async () => {
      stored("curriculums", "curriculumid", TU.curriculum).curriculumstatus = false;
      expect((await send(NOT_ACTING, "put", `/curriculum/activate/${TU.curriculum}`)).status).toBe(200);
      expect(stored("curriculums", "curriculumid", TU.curriculum).curriculumstatus).toBe(true);
    });
  });

  describe("PUT /curriculum/deactivate/:curriculumid", () => {
    it.each(IN_X)("%s: deactivates X's curriculum", async (who) => {
      expect((await send(who, "put", `/curriculum/deactivate/${TX.curriculum}`)).status).toBe(200);
      expect(stored("curriculums", "curriculumid", TX.curriculum).curriculumstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculum/deactivate/${id}`), TY.curriculum, TU.curriculum)).toBe(400);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/curriculum/deactivate/${id}`), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it("a platform user not acting: any curriculum", async () => {
      expect((await send(NOT_ACTING, "put", `/curriculum/deactivate/${TY.curriculum}`)).status).toBe(200);
      expect(stored("curriculums", "curriculumid", TY.curriculum).curriculumstatus).toBe(false);
    });
  });

  describe("POST /curriculum", () => {
    const list = (who: Who, body: object = { pageindex: 1, pagesize: 50, filter: [] }) => send(who, "post", "/curriculum", body);
    it.each(IN_X)("%s: lists X's curriculums, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "curriculumid")).toEqual(sorted(TX.curriculum, TX.curriculum2));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      const res = await list(who, { pageindex: 1, pagesize: 50, filter: [{ key: "curriculumname", value: "ភាសាខ្មែរខ" }] });
      expect(idsOf(res.body.data.data, "curriculumid")).toEqual([]);
    });
    it("a platform user not acting: every curriculum, owned or not", async () => {
      const res = await list(NOT_ACTING);
      expect(idsOf(res.body.data.data, "curriculumid")).toEqual(sorted(TX.curriculum, TX.curriculum2, TY.curriculum, TY.curriculum2, TU.curriculum, TU.curriculum2));
    });
  });

  describe("GET /curriculum/map", () => {
    it.each(IN_X)("%s: X's tree of content, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/curriculum/map");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.curriculums, "curriculumid")).toEqual(sorted(TX.curriculum, TX.curriculum2));
      expect(idsOf(res.body.data.grades, "gradeid")).toEqual(sorted(TX.grade, TX.grade2));
      expect(idsOf(res.body.data.levels, "levelid")).toEqual(sorted(TX.level, TX.level2));
      expect(idsOf(res.body.data.lessons, "lessonid")).toEqual(sorted(TX.lesson, TX.lesson2));
      expect(idsOf(res.body.data.lessonquizzes, "lessonquizid")).toEqual(sorted(TX.quiz, TX.quiz2));
      expect(idsOf(res.body.data.lessonpractices, "lessonpracticeid")).toEqual(sorted(TX.practice, TX.practice2));
    });
    it("a platform user not acting: every organisation's, and the unowned tree", async () => {
      const res = await send(NOT_ACTING, "get", "/curriculum/map");
      expect(idsOf(res.body.data.grades, "gradeid")).toEqual(sorted(TX.grade, TX.grade2, TY.grade, TY.grade2, TU.grade, TU.grade2));
      expect(idsOf(res.body.data.lessonpractices, "lessonpracticeid")).toHaveLength(6);
    });
  });

  describe("GET /curriculum/tree", () => {
    it.each(IN_X)("%s: X's curriculums with their trees, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/curriculum/tree");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "curriculumid")).toEqual(sorted(TX.curriculum, TX.curriculum2));
      const tree = res.body.data.find((c: Row) => c.curriculumid === TX.curriculum);
      expect(idsOf(tree.grades, "gradeid")).toEqual(sorted(TX.grade, TX.grade2));
      expect(JSON.stringify(res.body)).not.toContain(TY.curriculum);
      expect(JSON.stringify(res.body)).not.toContain(TU.curriculum);
    });
    it("a platform user not acting: every curriculum, the unowned ones too", async () => {
      const res = await send(NOT_ACTING, "get", "/curriculum/tree");
      expect(idsOf(res.body.data, "curriculumid")).toEqual(sorted(TX.curriculum, TX.curriculum2, TY.curriculum, TY.curriculum2, TU.curriculum, TU.curriculum2));
    });
  });

  describe("GET /curriculum/tree/:curriculumid", () => {
    it.each(IN_X)("%s: X's curriculum tree", async (who) => {
      const res = await send(who, "get", `/curriculum/tree/${TX.curriculum}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "curriculumid")).toEqual([TX.curriculum]);
      expect(idsOf(res.body.data[0].grades, "gradeid")).toEqual(sorted(TX.grade, TX.grade2));
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/curriculum/tree/${id}`), TY.curriculum, TU.curriculum)).toBe(400);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/curriculum/tree/${id}`), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it("a platform user not acting: any curriculum's tree", async () => {
      const res = await send(NOT_ACTING, "get", `/curriculum/tree/${TU.curriculum}`);
      expect(idsOf(res.body.data, "curriculumid")).toEqual([TU.curriculum]);
    });
  });

  describe("GET /curriculum/country/:countryid", () => {
    it.each(IN_X)("%s: X's curriculums of the country, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", `/curriculum/country/${COUNTRY}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "curriculumid")).toEqual([TX.curriculum]);
    });
    it.each([NOT_ACTING, "a server token" as Who])("%s: every curriculum of the country, owned or not", async (who) => {
      const res = await send(who, "get", `/curriculum/country/${COUNTRY}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "curriculumid")).toEqual(sorted(TX.curriculum, TY.curriculum, TU.curriculum));
    });
  });

  // ───────────────────────────── subjects ─────────────────────────────
  describe("POST /subject/create", () => {
    const body = (over: object = {}) => ({ subjectname: "គណិតវិទ្យា", subjectdescription: "ពិពណ៌នា", ...over });
    it.each(IN_X)("%s: creates a subject that is X's", async (who) => {
      expect((await send(who, "post", "/subject/create", body())).status).toBe(200);
      expect(db.createdIn("subjects")).toEqual([expect.objectContaining({ organisationid: X, subjectname: "គណិតវិទ្យា" })]);
    });
    it.each(IN_X)("%s: the name is unique among X's subjects only: Y's name is free", async (who) => {
      const free = await send(who, "post", "/subject/create", body({ subjectname: stored("subjects", "subjectid", TY.subject).subjectname }));
      expect(free.status).toBe(200);
      const taken = await send(who, "post", "/subject/create", body({ subjectname: stored("subjects", "subjectid", TX.subject).subjectname }));
      expect(taken.status).toBe(409);
    });
  });

  describe("POST /subject", () => {
    const list = (who: Who) => send(who, "post", "/subject", { pageindex: 1, pagesize: 50, filter: [] });
    it.each(IN_X)("%s: lists X's subjects, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "subjectid")).toEqual(sorted(TX.subject, TX.subject2));
    });
    it("a platform user not acting: every subject, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "subjectid")).toEqual(sorted(TX.subject, TX.subject2, TY.subject, TY.subject2, TU.subject, TU.subject2));
    });
  });

  describe("DELETE /subject/:subjectid", () => {
    it.each(IN_X)("%s: deletes X's subject that no curriculum uses", async (who) => {
      expect((await send(who, "delete", `/subject/${TX.subject2}`)).status).toBe(200);
      expect(stored("subjects", "subjectid", TX.subject2).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned subject answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/subject/${id}`), TY.subject2, TU.subject2)).toBe(400);
    });
    it.each(IN_X)("%s: the subject in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/subject/${id}`), "subjectid", TX.subject2, TY.subject2)).toBe(404);
    });
    it("a platform user not acting: any subject", async () => {
      expect((await send(NOT_ACTING, "delete", `/subject/${TU.subject2}`)).status).toBe(200);
      expect(stored("subjects", "subjectid", TU.subject2).isdeleted).toBe(true);
    });
  });

  describe("GET /subject/:subjectid", () => {
    it.each(IN_X)("%s: X's subject", async (who) => {
      const res = await send(who, "get", `/subject/${TX.subject2}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ subjectid: TX.subject2, subjectname: "Second tagx" });
    });
    it.each(IN_X)("%s: Y's and an unowned subject answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/subject/${id}`), TY.subject, TU.subject)).toBe(400);
    });
    it.each(IN_X)("%s: the subject in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/subject/${id}`), "subjectid", TX.subject2, TY.subject)).toBe(404);
    });
    it("a platform user not acting: any subject", async () => {
      expect((await send(NOT_ACTING, "get", `/subject/${TY.subject2}`)).body.data.subjectid).toBe(TY.subject2);
    });
  });

  describe("PUT /subject/:subjectid", () => {
    const body = { subjectname: "ឈ្មោះថ្មី", subjectdescription: "ពិពណ៌នាថ្មី" };
    it.each(IN_X)("%s: renames X's subject, which keeps its owner", async (who) => {
      expect((await send(who, "put", `/subject/${TX.subject2}`, body)).status).toBe(200);
      expect(stored("subjects", "subjectid", TX.subject2)).toMatchObject({ subjectname: "ឈ្មោះថ្មី", organisationid: X });
    });
    it.each(IN_X)("%s: Y's and an unowned subject answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/subject/${id}`, body), TY.subject, TU.subject)).toBe(400);
    });
    it.each(IN_X)("%s: the subject in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/subject/${id}`, body), "subjectid", TX.subject2, TY.subject)).toBe(404);
    });
    it("a platform user not acting: the name is unique within the row's own organisation, and across everything for an unowned row", async () => {
      const nameOf = (id: string) => stored("subjects", "subjectid", id).subjectname as string;
      const put = (id: string, name: string) => send(NOT_ACTING, "put", `/subject/${id}`, { ...body, subjectname: name });
      expect((await put(TY.subject2, nameOf(TX.subject2))).status).toBe(200);
      expect((await put(TY.subject2, nameOf(TY.subject))).status).toBe(409);
      expect((await put(TU.subject2, nameOf(TX.subject))).status).toBe(409);
    });
    it("a platform user not acting: any subject", async () => {
      expect((await send(NOT_ACTING, "put", `/subject/${TU.subject2}`, body)).status).toBe(200);
      expect(stored("subjects", "subjectid", TU.subject2).subjectname).toBe("ឈ្មោះថ្មី");
    });
  });

  // ───────────────────────────── grades ─────────────────────────────
  describe("GET /grade/all", () => {
    it.each(IN_X)("%s: X's grades, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/grade/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "gradeid")).toEqual(sorted(TX.grade, TX.grade2));
    });
    it.each(IN_X)("%s: a curriculum of another organisation cannot be used to widen it", async (who) => {
      const res = await send(who, "get", `/grade/all?curid=${TY.curriculum}`);
      expect(idsOf(res.body.data, "gradeid")).toEqual([]);
    });
    it.each(IN_X)("%s: a learner of X narrows it; a learner of Y (or of no organisation) is as a learner that is not there is", async (who) => {
      const own = await send(who, "get", `/grade/all?studentid=${TX.student}`);
      expect(idsOf(own.body.data, "gradeid")).toEqual([]);
      const absent = await send(who, "get", `/grade/all?studentid=${MISSING}`);
      expect(idsOf(absent.body.data, "gradeid")).toEqual(sorted(TX.grade, TX.grade2));
      for (const other of [TY.student, TU.student]) {
        expect(said(await send(who, "get", `/grade/all?studentid=${other}`))).toEqual(said(absent));
      }
    });
    it.each([NOT_ACTING, "a school-user token" as Who])("%s: every grade, owned or not (a school-user token has no organisation here)", async (who) => {
      const res = await send(who, "get", "/grade/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "gradeid")).toEqual(sorted(TX.grade, TX.grade2, TY.grade, TY.grade2, TU.grade, TU.grade2));
    });
  });

  describe("POST /grade/create", () => {
    const body = (curriculumid: string, gradename = "ថ្នាក់ថ្មី") => ({ gradename, gradeorder: 3, curriculumid, passing_points: 8 });
    it.each(IN_X)("%s: creates a grade under X's curriculum", async (who) => {
      expect((await send(who, "post", "/grade/create", body(TX.curriculum))).status).toBe(200);
      expect(db.createdIn("grades")).toEqual([expect.objectContaining({ curriculumid: TX.curriculum, gradename: "ថ្នាក់ថ្មី" })]);
    });
    it.each(IN_X)("%s: under Y's or an unowned curriculum it is the 404 an absent curriculum gets, nothing written", async (who) => {
      // (named as a grade of Y's, or of the unowned tree, is: the name is not a way to tell the curriculum is there)
      const named = (id: string) => body(id, stored("grades", "gradeid", id === TY.curriculum ? TY.grade : TU.grade).gradename as string);
      expect(await asAbsent(who, "post", (id) => r("/grade/create", id === MISSING ? body(id) : named(id)), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: the name is free in Y's curriculum, and taken in X's own", async (who) => {
      const taken = await send(who, "post", "/grade/create", { ...body(TX.curriculum), gradename: stored("grades", "gradeid", TX.grade).gradename });
      expect(taken.status).toBe(409);
      const free = await send(who, "post", "/grade/create", { ...body(TX.curriculum), gradename: stored("grades", "gradeid", TY.grade).gradename });
      expect(free.status).toBe(200);
    });
    it("a platform user not acting: under any curriculum", async () => {
      expect((await send(NOT_ACTING, "post", "/grade/create", body(TU.curriculum))).status).toBe(200);
      expect(db.createdIn("grades")[0].curriculumid).toBe(TU.curriculum);
    });
  });

  describe("DELETE /grade/:gradeid", () => {
    it.each(IN_X)("%s: deletes X's grade", async (who) => {
      expect((await send(who, "delete", `/grade/${TX.grade}`)).status).toBe(200);
      expect(stored("grades", "gradeid", TX.grade).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned grade answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/grade/${id}`), TY.grade, TU.grade)).toBe(400);
    });
    it.each(IN_X)("%s: the grade in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/grade/${id}`), "gradeid", TX.grade, TY.grade)).toBe(404);
    });
    it("a platform user not acting: any grade", async () => {
      expect((await send(NOT_ACTING, "delete", `/grade/${TU.grade}`)).status).toBe(200);
      expect(stored("grades", "gradeid", TU.grade).isdeleted).toBe(true);
    });
  });

  describe("PUT /grade/activate/:gradeid", () => {
    it.each(IN_X)("%s: activates X's grade", async (who) => {
      stored("grades", "gradeid", TX.grade).gradestatus = false;
      expect((await send(who, "put", `/grade/activate/${TX.grade}`)).status).toBe(200);
      expect(stored("grades", "gradeid", TX.grade).gradestatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned grade answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/grade/activate/${id}`), TY.grade, TU.grade)).toBe(400);
    });
    it.each(IN_X)("%s: the grade in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/grade/activate/${id}`), "gradeid", TX.grade, TY.grade)).toBe(404);
    });
    it("a platform user not acting: any grade", async () => {
      stored("grades", "gradeid", TY.grade).gradestatus = false;
      expect((await send(NOT_ACTING, "put", `/grade/activate/${TY.grade}`)).status).toBe(200);
      expect(stored("grades", "gradeid", TY.grade).gradestatus).toBe(true);
    });
  });

  describe("PUT /grade/deactivate/:gradeid", () => {
    it.each(IN_X)("%s: deactivates X's grade", async (who) => {
      expect((await send(who, "put", `/grade/deactivate/${TX.grade}`)).status).toBe(200);
      expect(stored("grades", "gradeid", TX.grade).gradestatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned grade answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/grade/deactivate/${id}`), TY.grade, TU.grade)).toBe(400);
    });
    it.each(IN_X)("%s: the grade in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/grade/deactivate/${id}`), "gradeid", TX.grade, TY.grade)).toBe(404);
    });
    it("a platform user not acting: any grade", async () => {
      expect((await send(NOT_ACTING, "put", `/grade/deactivate/${TU.grade}`)).status).toBe(200);
      expect(stored("grades", "gradeid", TU.grade).gradestatus).toBe(false);
    });
  });

  describe("GET /grade/:gradeid", () => {
    it.each(IN_X)("%s: X's grade", async (who) => {
      const res = await send(who, "get", `/grade/${TX.grade}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ gradeid: TX.grade, curriculumid: TX.curriculum, curriculumname: "ភាសាខ្មែរក" });
    });
    it.each(IN_X)("%s: Y's and an unowned grade answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/grade/${id}`), TY.grade, TU.grade)).toBe(400);
    });
    it.each(IN_X)("%s: the grade in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/grade/${id}`), "gradeid", TX.grade, TY.grade)).toBe(404);
    });
    it("a platform user not acting: any grade", async () => {
      expect((await send(NOT_ACTING, "get", `/grade/${TU.grade}`)).body.data.gradeid).toBe(TU.grade);
    });
  });

  describe("GET /grade/curriculum/:curriculumid", () => {
    it.each(IN_X)("%s: the grades of X's curriculum", async (who) => {
      const res = await send(who, "get", `/grade/curriculum/${TX.curriculum}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "gradeid")).toEqual(sorted(TX.grade, TX.grade2));
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum hold no grades for X, as an absent one holds none", async (who) => {
      for (const id of [TY.curriculum, TU.curriculum, MISSING]) {
        const res = await send(who, "get", `/grade/curriculum/${id}`);
        expect(said(res)).toEqual({ status: 200, body: { error: false, data: [] } });
      }
    });
    it.each([NOT_ACTING, "a server token" as Who])("%s: the grades of any curriculum", async (who) => {
      const res = await send(who, "get", `/grade/curriculum/${TY.curriculum}`);
      expect(idsOf(res.body.data, "gradeid")).toEqual(sorted(TY.grade, TY.grade2));
    });
  });

  describe("PUT /grade/:gradeid", () => {
    const body = (curriculumid: string, gradename = "ឈ្មោះថ្មី") => ({ gradename, gradeorder: 1, curriculumid, passing_points: 8 });
    it.each(IN_X)("%s: renames X's grade, in X's curriculum", async (who) => {
      expect((await send(who, "put", `/grade/${TX.grade}`, body(TX.curriculum2))).status).toBe(200);
      expect(stored("grades", "gradeid", TX.grade)).toMatchObject({ gradename: "ឈ្មោះថ្មី", curriculumid: TX.curriculum2 });
    });
    it.each(IN_X)("%s: Y's and an unowned grade answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/grade/${id}`, body(TX.curriculum)), TY.grade, TU.grade)).toBe(400);
    });
    it.each(IN_X)("%s: moved into Y's or an unowned curriculum is the 404 an absent curriculum gets, nothing written", async (who) => {
      const named = (id: string) => body(id, stored("grades", "gradeid", id === TY.curriculum ? TY.grade : TU.grade).gradename as string);
      expect(await asAbsent(who, "put", (id) => r(`/grade/${TX.grade}`, id === MISSING ? body(id) : named(id)), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: the grade in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/grade/${id}`, body(TX.curriculum)), "gradeid", TX.grade, TY.grade)).toBe(404);
    });
    it("a platform user not acting: any grade, into a curriculum of its owner", async () => {
      expect((await send(NOT_ACTING, "put", `/grade/${TY.grade}`, body(TY.curriculum2))).status).toBe(200);
      expect(stored("grades", "gradeid", TY.grade).curriculumid).toBe(TY.curriculum2);
    });
  });

  describe("POST /grade", () => {
    const list = (who: Who, filter: object[] = []) => send(who, "post", "/grade", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: lists X's grades, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "gradeid")).toEqual(sorted(TX.grade, TX.grade2));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      expect(idsOf((await list(who, [{ key: "gradename", value: "Second tagy" }])).body.data.data, "gradeid")).toEqual([]);
    });
    it("a platform user not acting: every grade, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "gradeid")).toEqual(sorted(TX.grade, TX.grade2, TY.grade, TY.grade2, TU.grade, TU.grade2));
    });
  });

  // ───────────────────────────── levels ─────────────────────────────
  describe("GET /level/all", () => {
    it.each(IN_X)("%s: X's levels, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/level/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "levelid")).toEqual(sorted(TX.level, TX.level2));
    });
    it.each(IN_X)("%s: a grade of another organisation cannot be used to widen it", async (who) => {
      expect(idsOf((await send(who, "get", `/level/all?gradeid=${TY.grade}`)).body.data, "levelid")).toEqual([]);
    });
    it.each([NOT_ACTING, "a school-user token" as Who])("%s: every level, owned or not (a school-user token has no organisation here)", async (who) => {
      const res = await send(who, "get", "/level/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "levelid")).toEqual(sorted(TX.level, TX.level2, TY.level, TY.level2, TU.level, TU.level2));
    });
  });

  describe("POST /level/create", () => {
    const body = (gradeid: string, levelname = "កម្រិតថ្មី") => ({ levelname, levelorder: 3, gradeid, quiz_points: 100, passing_points: 0 });
    it.each(IN_X)("%s: creates a level under X's grade", async (who) => {
      expect((await send(who, "post", "/level/create", body(TX.grade))).status).toBe(200);
      expect(db.createdIn("levels")).toEqual([expect.objectContaining({ gradeid: TX.grade, levelname: "កម្រិតថ្មី" })]);
    });
    it.each(IN_X)("%s: under Y's or an unowned grade it is the 404 an absent grade gets, nothing written", async (who) => {
      // (named as a level of Y's, or of the unowned tree: the name is not a way to tell the grade is there)
      const named = (id: string) => body(id, stored("levels", "levelid", id === TY.grade ? TY.level : TU.level).levelname as string);
      expect(await asAbsent(who, "post", (id) => r("/level/create", id === MISSING ? body(id) : named(id)), TY.grade, TU.grade)).toBe(404);
    });
    it.each(IN_X)("%s: the name is taken in X's grade, free in Y's", async (who) => {
      const taken = await send(who, "post", "/level/create", { ...body(TX.grade), levelname: stored("levels", "levelid", TX.level).levelname });
      expect(taken.status).toBe(409);
      const free = await send(who, "post", "/level/create", { ...body(TX.grade), levelname: stored("levels", "levelid", TY.level).levelname });
      expect(free.status).toBe(200);
    });
    it("a platform user not acting: under any grade", async () => {
      expect((await send(NOT_ACTING, "post", "/level/create", body(TU.grade))).status).toBe(200);
      expect(db.createdIn("levels")[0].gradeid).toBe(TU.grade);
    });
  });

  describe("DELETE /level/:levelid", () => {
    it.each(IN_X)("%s: deletes X's level", async (who) => {
      expect((await send(who, "delete", `/level/${TX.level}`)).status).toBe(200);
      expect(stored("levels", "levelid", TX.level).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned level answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/level/${id}`), TY.level, TU.level)).toBe(400);
    });
    it.each(IN_X)("%s: the level in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/level/${id}`), "levelid", TX.level, TY.level)).toBe(404);
    });
    it("a platform user not acting: any level", async () => {
      expect((await send(NOT_ACTING, "delete", `/level/${TU.level}`)).status).toBe(200);
      expect(stored("levels", "levelid", TU.level).isdeleted).toBe(true);
    });
  });

  describe("PUT /level/activate/:levelid", () => {
    it.each(IN_X)("%s: activates X's level", async (who) => {
      stored("levels", "levelid", TX.level).levelstatus = false;
      expect((await send(who, "put", `/level/activate/${TX.level}`)).status).toBe(200);
      expect(stored("levels", "levelid", TX.level).levelstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned level answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/level/activate/${id}`), TY.level, TU.level)).toBe(400);
    });
    it.each(IN_X)("%s: the level in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/level/activate/${id}`), "levelid", TX.level, TY.level)).toBe(404);
    });
    it("a platform user not acting: any level", async () => {
      stored("levels", "levelid", TY.level).levelstatus = false;
      expect((await send(NOT_ACTING, "put", `/level/activate/${TY.level}`)).status).toBe(200);
      expect(stored("levels", "levelid", TY.level).levelstatus).toBe(true);
    });
  });

  describe("PUT /level/deactivate/:levelid", () => {
    it.each(IN_X)("%s: deactivates X's level", async (who) => {
      expect((await send(who, "put", `/level/deactivate/${TX.level}`)).status).toBe(200);
      expect(stored("levels", "levelid", TX.level).levelstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned level answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/level/deactivate/${id}`), TY.level, TU.level)).toBe(400);
    });
    it.each(IN_X)("%s: the level in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/level/deactivate/${id}`), "levelid", TX.level, TY.level)).toBe(404);
    });
    it("a platform user not acting: any level", async () => {
      expect((await send(NOT_ACTING, "put", `/level/deactivate/${TU.level}`)).status).toBe(200);
      expect(stored("levels", "levelid", TU.level).levelstatus).toBe(false);
    });
  });

  describe("GET /level/:levelid", () => {
    it.each(IN_X)("%s: X's level", async (who) => {
      const res = await send(who, "get", `/level/${TX.level}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ levelid: TX.level, gradeid: TX.grade, gradename: "ថ្នាក់ទី១tagx" });
    });
    it.each(IN_X)("%s: Y's and an unowned level answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/level/${id}`), TY.level, TU.level)).toBe(400);
    });
    it.each(IN_X)("%s: the level in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/level/${id}`), "levelid", TX.level, TY.level)).toBe(404);
    });
    it("a platform user not acting: any level", async () => {
      expect((await send(NOT_ACTING, "get", `/level/${TU.level}`)).body.data.levelid).toBe(TU.level);
    });
  });

  describe("PUT /level/:levelid", () => {
    const body = (gradeid: string, levelname = "ឈ្មោះថ្មី") => ({ levelname, levelorder: 1, gradeid, quiz_points: 100, passing_points: 0 });
    it.each(IN_X)("%s: renames X's level, in X's grade", async (who) => {
      expect((await send(who, "put", `/level/${TX.level}`, body(TX.grade))).status).toBe(200);
      expect(stored("levels", "levelid", TX.level)).toMatchObject({ levelname: "ឈ្មោះថ្មី", gradeid: TX.grade });
    });
    it.each(IN_X)("%s: Y's and an unowned level answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/level/${id}`, body(TX.grade)), TY.level, TU.level)).toBe(400);
    });
    it.each(IN_X)("%s: moved into Y's or an unowned grade is the 404 an absent grade gets, nothing written", async (who) => {
      const named = (id: string) => body(id, stored("levels", "levelid", id === TY.grade ? TY.level : TU.level).levelname as string);
      expect(await asAbsent(who, "put", (id) => r(`/level/${TX.level}`, id === MISSING ? body(id) : named(id)), TY.grade, TU.grade)).toBe(404);
    });
    it.each(IN_X)("%s: the level in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/level/${id}`, body(TX.grade)), "levelid", TX.level, TY.level)).toBe(404);
    });
    it("a platform user not acting: any level, into a grade of its owner", async () => {
      expect((await send(NOT_ACTING, "put", `/level/${TY.level}`, body(TY.grade))).status).toBe(200);
      expect(stored("levels", "levelid", TY.level).levelname).toBe("ឈ្មោះថ្មី");
    });
  });

  describe("POST /level", () => {
    const list = (who: Who, filter: object[] = []) => send(who, "post", "/level", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: lists X's levels, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "levelid")).toEqual(sorted(TX.level, TX.level2));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      expect(idsOf((await list(who, [{ key: "levelname", value: "Second tagy" }])).body.data.data, "levelid")).toEqual([]);
    });
    it("a platform user not acting: every level, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "levelid")).toEqual(sorted(TX.level, TX.level2, TY.level, TY.level2, TU.level, TU.level2));
    });
  });

  // ───────────────────────────── level quiz questions ─────────────────────────────
  describe("GET /level/quiz/question/:levelid", () => {
    it.each(IN_X)("%s: the questions of X's level", async (who) => {
      const res = await send(who, "get", `/level/quiz/question/${TX.level}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "levelquizquestionid")).toEqual([TX.levelQuestion]);
    });
    it.each(IN_X)("%s: Y's and an unowned level answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/level/quiz/question/${id}`), TY.level, TU.level)).toBe(400);
    });
    it.each(IN_X)("%s: the level in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/level/quiz/question/${id}`), "levelid", TX.level, TY.level)).toBe(404);
    });
    it("a platform user not acting: any level's questions", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/level/quiz/question/${TY.level}`)).body.data, "levelquizquestionid")).toEqual([TY.levelQuestion]);
    });
  });

  describe("POST /level/quiz/question/:levelid/:questionid/:levelquizquestionorder", () => {
    const at = (level: string, question: string) => r(`/level/quiz/question/${level}/${question}/2`);
    it.each(IN_X)("%s: adds X's question to X's level", async (who) => {
      expect((await send(who, "post", at(TX.level, TX.question2).path)).status).toBe(200);
      expect(db.createdIn("levelquizquestions")).toEqual([expect.objectContaining({ levelid: TX.level, questionid: TX.question2 })]);
    });
    it.each(IN_X)("%s: Y's or an unowned level answers as an absent level does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => at(id, TX.question2), TY.level, TU.level)).toBe(400);
    });
    it.each(IN_X)("%s: Y's or an unowned question answers as an absent question does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => at(TX.level, id), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the level and the question in the path are the ones checked, before any owner is compared (404, not the 400 for two owners)", async (who) => {
      expect(await asAbsentPath(who, "post", (id) => at(id, TX.question2), "levelid", TX.level, TY.level)).toBe(404);
      expect(await asAbsentPath(who, "post", (id) => at(TX.level, id), "questionid", TX.question2, TY.question)).toBe(404);
    });
    it("a platform user not acting: any level, with a question of the same owner", async () => {
      expect((await send(NOT_ACTING, "post", at(TY.level, TY.question2).path)).status).toBe(200);
      expect((await send(NOT_ACTING, "post", at(TY.level, TX.question).path)).status).toBe(400);
    });
  });

  describe("DELETE /level/quiz/question/:levelquizquestionid", () => {
    it.each(IN_X)("%s: removes X's level quiz question", async (who) => {
      expect((await send(who, "delete", `/level/quiz/question/${TX.levelQuestion}`)).status).toBe(200);
      expect(db.tables.levelquizquestions.map((q) => q.levelquizquestionid)).not.toContain(TX.levelQuestion);
    });
    it.each(IN_X)("%s: Y's and an unowned one answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/level/quiz/question/${id}`), TY.levelQuestion, TU.levelQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/level/quiz/question/${id}`), "levelquizquestionid", TX.levelQuestion, TY.levelQuestion)).toBe(404);
    });
    it("a platform user not acting: any level quiz question", async () => {
      expect((await send(NOT_ACTING, "delete", `/level/quiz/question/${TU.levelQuestion}`)).status).toBe(200);
      expect(db.tables.levelquizquestions.map((q) => q.levelquizquestionid)).not.toContain(TU.levelQuestion);
    });
  });

  describe("PUT /level/quiz/question/activate/:levelquizquestionid", () => {
    it.each(IN_X)("%s: activates X's level quiz question", async (who) => {
      stored("levelquizquestions", "levelquizquestionid", TX.levelQuestion).levelquizquestionstatus = false;
      expect((await send(who, "put", `/level/quiz/question/activate/${TX.levelQuestion}`)).status).toBe(200);
      expect(stored("levelquizquestions", "levelquizquestionid", TX.levelQuestion).levelquizquestionstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned one answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/level/quiz/question/activate/${id}`), TY.levelQuestion, TU.levelQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/level/quiz/question/activate/${id}`), "levelquizquestionid", TX.levelQuestion, TY.levelQuestion)).toBe(404);
    });
    it("a platform user not acting: any level quiz question", async () => {
      stored("levelquizquestions", "levelquizquestionid", TY.levelQuestion).levelquizquestionstatus = false;
      expect((await send(NOT_ACTING, "put", `/level/quiz/question/activate/${TY.levelQuestion}`)).status).toBe(200);
      expect(stored("levelquizquestions", "levelquizquestionid", TY.levelQuestion).levelquizquestionstatus).toBe(true);
    });
  });

  describe("PUT /level/quiz/question/deactivate/:levelquizquestionid", () => {
    it.each(IN_X)("%s: deactivates X's level quiz question", async (who) => {
      expect((await send(who, "put", `/level/quiz/question/deactivate/${TX.levelQuestion}`)).status).toBe(200);
      expect(stored("levelquizquestions", "levelquizquestionid", TX.levelQuestion).levelquizquestionstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned one answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/level/quiz/question/deactivate/${id}`), TY.levelQuestion, TU.levelQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/level/quiz/question/deactivate/${id}`), "levelquizquestionid", TX.levelQuestion, TY.levelQuestion)).toBe(404);
    });
    it("a platform user not acting: any level quiz question", async () => {
      expect((await send(NOT_ACTING, "put", `/level/quiz/question/deactivate/${TU.levelQuestion}`)).status).toBe(200);
      expect(stored("levelquizquestions", "levelquizquestionid", TU.levelQuestion).levelquizquestionstatus).toBe(false);
    });
  });

  describe("PUT /level/quiz/question/order/:levelquizquestionid/:levelquizquestionorder", () => {
    it.each(IN_X)("%s: reorders X's level quiz question", async (who) => {
      expect((await send(who, "put", `/level/quiz/question/order/${TX.levelQuestion}/5`)).status).toBe(200);
      expect(String(stored("levelquizquestions", "levelquizquestionid", TX.levelQuestion).levelquizquestionorder)).toBe("5");
    });
    it.each(IN_X)("%s: Y's and an unowned one answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/level/quiz/question/order/${id}/5`), TY.levelQuestion, TU.levelQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/level/quiz/question/order/${id}/5`), "levelquizquestionid", TX.levelQuestion, TY.levelQuestion)).toBe(404);
    });
    it("a platform user not acting: any level quiz question", async () => {
      expect((await send(NOT_ACTING, "put", `/level/quiz/question/order/${TY.levelQuestion}/5`)).status).toBe(200);
      expect(String(stored("levelquizquestions", "levelquizquestionid", TY.levelQuestion).levelquizquestionorder)).toBe("5");
    });
  });

  describe("PUT /level/quiz/question/setlesson/:levelquizquestionid", () => {
    const at = (row: string, lesson: string) => r(`/level/quiz/question/setlesson/${row}`, { lessonid: lesson });
    it.each(IN_X)("%s: sets X's lesson on X's row", async (who) => {
      expect((await send(who, "put", at(TX.levelQuestion, TX.lesson2).path, at(TX.levelQuestion, TX.lesson2).body)).status).toBe(200);
      expect(stored("levelquizquestions", "levelquizquestionid", TX.levelQuestion).lessonid).toBe(TX.lesson2);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => at(id, TX.lesson2), TY.levelQuestion, TU.levelQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: a lesson of Y or an unowned one is the 404 an absent lesson gets, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => at(TX.levelQuestion, id), TY.lesson, TU.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => at(id, TX.lesson2), "levelquizquestionid", TX.levelQuestion, TY.levelQuestion)).toBe(404);
    });
    it("a platform user not acting: any row, with a lesson of its owner", async () => {
      expect((await send(NOT_ACTING, "put", at(TY.levelQuestion, TY.lesson2).path, at(TY.levelQuestion, TY.lesson2).body)).status).toBe(200);
      expect(stored("levelquizquestions", "levelquizquestionid", TY.levelQuestion).lessonid).toBe(TY.lesson2);
    });
  });

  // ───────────────────────────── lesson practices ─────────────────────────────
  describe("GET /lesson/practice/:lessonid", () => {
    it.each(IN_X)("%s: the practices of X's lesson", async (who) => {
      const res = await send(who, "get", `/lesson/practice/${TX.lesson}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "lessonpracticeid")).toEqual(sorted(TX.practice, TX.practice2));
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/practice/${id}`), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/practice/${id}`), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson's practices", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/lesson/practice/${TU.lesson}`)).body.data, "lessonpracticeid")).toEqual(sorted(TU.practice, TU.practice2));
    });
  });

  describe("GET /lesson/practice/:lessonid/:lessonpracticeid", () => {
    it.each(IN_X)("%s: X's practice", async (who) => {
      const res = await send(who, "get", `/lesson/practice/${TX.lesson}/${TX.practice}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ lessonpracticeid: TX.practice, lessonid: TX.lesson });
    });
    it.each(IN_X)("%s: Y's and an unowned practice answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/practice/${TX.lesson}/${id}`), TY.practice, TU.practice)).toBe(400);
    });
    it.each(IN_X)("%s: the practice in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/practice/${TX.lesson}/${id}`), "lessonpracticeid", TX.practice, TY.practice)).toBe(404);
    });
    it("a platform user not acting: any practice", async () => {
      expect((await send(NOT_ACTING, "get", `/lesson/practice/${TU.lesson}/${TU.practice}`)).body.data.lessonpracticeid).toBe(TU.practice);
    });
  });

  describe("POST /lesson/practice/:lessonid", () => {
    const body = { lessonpracticename: "ថ្មី", lessonpracticedescription: "ពិពណ៌នា", lessonpracticeorder: 3, points: 10 };
    it.each(IN_X)("%s: adds a practice to X's lesson", async (who) => {
      expect((await send(who, "post", `/lesson/practice/${TX.lesson}`, body)).status).toBe(200);
      expect(db.createdIn("lessonpractices")).toEqual([expect.objectContaining({ lessonid: TX.lesson, lessonpracticename: "ថ្មី" })]);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does, nothing written", async (who) => {
      // (named as a practice of the other lesson: the name is not a way to tell the lesson is there)
      const named = (id: string) => ({ ...body, lessonpracticename: stored("lessonpractices", "lessonpracticeid", id === TY.lesson ? TY.practice : TU.practice).lessonpracticename });
      expect(await asAbsent(who, "post", (id) => r(`/lesson/practice/${id}`, id === MISSING ? body : named(id)), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "post", (id) => r(`/lesson/practice/${id}`, body), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: to any lesson", async () => {
      expect((await send(NOT_ACTING, "post", `/lesson/practice/${TU.lesson}`, body)).status).toBe(200);
      expect(db.createdIn("lessonpractices")[0].lessonid).toBe(TU.lesson);
    });
  });

  describe("PUT /lesson/practice/activate/:lessonpracticeid", () => {
    it.each(IN_X)("%s: activates X's practice", async (who) => {
      stored("lessonpractices", "lessonpracticeid", TX.practice).lessonpracticestatus = false;
      expect((await send(who, "put", `/lesson/practice/activate/${TX.practice}`)).status).toBe(200);
      expect(stored("lessonpractices", "lessonpracticeid", TX.practice).lessonpracticestatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned practice answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/practice/activate/${id}`), TY.practice, TU.practice)).toBe(400);
    });
    it.each(IN_X)("%s: the practice in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/practice/activate/${id}`), "lessonpracticeid", TX.practice, TY.practice)).toBe(404);
    });
    it("a platform user not acting: any practice", async () => {
      stored("lessonpractices", "lessonpracticeid", TY.practice).lessonpracticestatus = false;
      expect((await send(NOT_ACTING, "put", `/lesson/practice/activate/${TY.practice}`)).status).toBe(200);
      expect(stored("lessonpractices", "lessonpracticeid", TY.practice).lessonpracticestatus).toBe(true);
    });
  });

  describe("PUT /lesson/practice/deactivate/:lessonpracticeid", () => {
    it.each(IN_X)("%s: deactivates X's practice", async (who) => {
      expect((await send(who, "put", `/lesson/practice/deactivate/${TX.practice}`)).status).toBe(200);
      expect(stored("lessonpractices", "lessonpracticeid", TX.practice).lessonpracticestatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned practice answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/practice/deactivate/${id}`), TY.practice, TU.practice)).toBe(400);
    });
    it.each(IN_X)("%s: the practice in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/practice/deactivate/${id}`), "lessonpracticeid", TX.practice, TY.practice)).toBe(404);
    });
    it("a platform user not acting: any practice", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/practice/deactivate/${TU.practice}`)).status).toBe(200);
      expect(stored("lessonpractices", "lessonpracticeid", TU.practice).lessonpracticestatus).toBe(false);
    });
  });

  describe("PUT /lesson/practice/order/:lessonpracticeid/:lessonpracticeorder", () => {
    it.each(IN_X)("%s: reorders X's practice", async (who) => {
      expect((await send(who, "put", `/lesson/practice/order/${TX.practice}/5`)).status).toBe(200);
      expect(String(stored("lessonpractices", "lessonpracticeid", TX.practice).lessonpracticeorder)).toBe("5");
    });
    it.each(IN_X)("%s: Y's and an unowned practice answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/practice/order/${id}/5`), TY.practice, TU.practice)).toBe(400);
    });
    it.each(IN_X)("%s: the practice in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/practice/order/${id}/5`), "lessonpracticeid", TX.practice, TY.practice)).toBe(404);
    });
    it("a platform user not acting: any practice", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/practice/order/${TY.practice}/5`)).status).toBe(200);
      expect(String(stored("lessonpractices", "lessonpracticeid", TY.practice).lessonpracticeorder)).toBe("5");
    });
  });

  describe("PUT /lesson/practice/:lessonpracticeid", () => {
    const body = (lessonid: string, lessonpracticename = "ឈ្មោះថ្មី") => ({ lessonid, lessonpracticename, lessonpracticedescription: "ពិពណ៌នា", points: 10 });
    it.each(IN_X)("%s: renames X's practice, in X's lesson", async (who) => {
      expect((await send(who, "put", `/lesson/practice/${TX.practice}`, body(TX.lesson2))).status).toBe(200);
      expect(stored("lessonpractices", "lessonpracticeid", TX.practice)).toMatchObject({ lessonpracticename: "ឈ្មោះថ្មី", lessonid: TX.lesson2 });
    });
    it.each(IN_X)("%s: Y's and an unowned practice answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/practice/${id}`, body(TX.lesson)), TY.practice, TU.practice)).toBe(400);
    });
    it.each(IN_X)("%s: moved into Y's or an unowned lesson is the 404 an absent lesson gets, nothing written", async (who) => {
      const named = (id: string) => body(id, stored("lessonpractices", "lessonpracticeid", id === TY.lesson ? TY.practice : TU.practice).lessonpracticename as string);
      expect(await asAbsent(who, "put", (id) => r(`/lesson/practice/${TX.practice}`, id === MISSING ? body(id) : named(id)), TY.lesson, TU.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: the practice in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/practice/${id}`, body(TX.lesson)), "lessonpracticeid", TX.practice, TY.practice)).toBe(404);
    });
    it("a platform user not acting: any practice, into a lesson of its owner", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/practice/${TY.practice}`, body(TY.lesson2))).status).toBe(200);
      expect(stored("lessonpractices", "lessonpracticeid", TY.practice).lessonid).toBe(TY.lesson2);
    });
  });

  describe("DELETE /lesson/practice/:lessonpracticeid", () => {
    it.each(IN_X)("%s: deletes X's practice", async (who) => {
      expect((await send(who, "delete", `/lesson/practice/${TX.practice}`)).status).toBe(200);
      expect(db.tables.lessonpractices.map((x) => x.lessonpracticeid)).not.toContain(TX.practice);
    });
    it.each(IN_X)("%s: Y's and an unowned practice answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/lesson/practice/${id}`), TY.practice, TU.practice)).toBe(400);
    });
    it.each(IN_X)("%s: the practice in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/lesson/practice/${id}`), "lessonpracticeid", TX.practice, TY.practice)).toBe(404);
    });
    it("a platform user not acting: any practice", async () => {
      expect((await send(NOT_ACTING, "delete", `/lesson/practice/${TU.practice}`)).status).toBe(200);
      expect(db.tables.lessonpractices.map((x) => x.lessonpracticeid)).not.toContain(TU.practice);
    });
  });

  // ───────────────────────────── lesson practice questions ─────────────────────────────
  describe("GET /lesson/practice/question/:lessonpracticeid", () => {
    it.each(IN_X)("%s: the questions of X's practice", async (who) => {
      const res = await send(who, "get", `/lesson/practice/question/${TX.practice}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "lessonpracticequestionid")).toEqual([TX.practiceQuestion]);
    });
    it.each(IN_X)("%s: Y's and an unowned practice answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/practice/question/${id}`), TY.practice, TU.practice)).toBe(400);
    });
    it.each(IN_X)("%s: the practice in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/practice/question/${id}`), "lessonpracticeid", TX.practice, TY.practice)).toBe(404);
    });
    it("a platform user not acting: any practice's questions", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/lesson/practice/question/${TY.practice}`)).body.data, "lessonpracticequestionid")).toEqual([TY.practiceQuestion]);
    });
  });

  describe("POST /lesson/practice/question/:lessonpracticeid/:questionid/:lessonpracticequestionorder", () => {
    const at = (practice: string, question: string) => r(`/lesson/practice/question/${practice}/${question}/2`);
    it.each(IN_X)("%s: adds X's question to X's practice", async (who) => {
      expect((await send(who, "post", at(TX.practice, TX.question2).path)).status).toBe(200);
      expect(db.createdIn("lessonpracticequestions")).toEqual([expect.objectContaining({ lessonpracticeid: TX.practice, questionid: TX.question2 })]);
    });
    it.each(IN_X)("%s: Y's or an unowned practice answers as an absent practice does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => at(id, TX.question2), TY.practice, TU.practice)).toBe(400);
    });
    it.each(IN_X)("%s: Y's or an unowned question answers as an absent question does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => at(TX.practice, id), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the practice and the question in the path are the ones checked, before any owner is compared (404, not the 400 for two owners)", async (who) => {
      expect(await asAbsentPath(who, "post", (id) => at(id, TX.question2), "lessonpracticeid", TX.practice, TY.practice)).toBe(404);
      expect(await asAbsentPath(who, "post", (id) => at(TX.practice, id), "questionid", TX.question2, TY.question)).toBe(404);
    });
    it("a platform user not acting: any practice, with a question of the same owner", async () => {
      expect((await send(NOT_ACTING, "post", at(TY.practice, TY.question2).path)).status).toBe(200);
      expect((await send(NOT_ACTING, "post", at(TY.practice, TX.question).path)).status).toBe(400);
    });
  });

  describe("PUT /lesson/practice/question/activate/:lessonpracticequestionid", () => {
    it.each(IN_X)("%s: activates X's row", async (who) => {
      stored("lessonpracticequestions", "lessonpracticequestionid", TX.practiceQuestion).lessonpracticequestionstatus = false;
      expect((await send(who, "put", `/lesson/practice/question/activate/${TX.practiceQuestion}`)).status).toBe(200);
      expect(stored("lessonpracticequestions", "lessonpracticequestionid", TX.practiceQuestion).lessonpracticequestionstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/practice/question/activate/${id}`), TY.practiceQuestion, TU.practiceQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/practice/question/activate/${id}`), "lessonpracticequestionid", TX.practiceQuestion, TY.practiceQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      stored("lessonpracticequestions", "lessonpracticequestionid", TY.practiceQuestion).lessonpracticequestionstatus = false;
      expect((await send(NOT_ACTING, "put", `/lesson/practice/question/activate/${TY.practiceQuestion}`)).status).toBe(200);
      expect(stored("lessonpracticequestions", "lessonpracticequestionid", TY.practiceQuestion).lessonpracticequestionstatus).toBe(true);
    });
  });

  describe("PUT /lesson/practice/question/deactivate/:lessonpracticequestionid", () => {
    it.each(IN_X)("%s: deactivates X's row", async (who) => {
      expect((await send(who, "put", `/lesson/practice/question/deactivate/${TX.practiceQuestion}`)).status).toBe(200);
      expect(stored("lessonpracticequestions", "lessonpracticequestionid", TX.practiceQuestion).lessonpracticequestionstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/practice/question/deactivate/${id}`), TY.practiceQuestion, TU.practiceQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/practice/question/deactivate/${id}`), "lessonpracticequestionid", TX.practiceQuestion, TY.practiceQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/practice/question/deactivate/${TU.practiceQuestion}`)).status).toBe(200);
      expect(stored("lessonpracticequestions", "lessonpracticequestionid", TU.practiceQuestion).lessonpracticequestionstatus).toBe(false);
    });
  });

  describe("PUT /lesson/practice/question/order/:lessonpracticequestionid/:lessonpracticequestionorder", () => {
    it.each(IN_X)("%s: reorders X's row", async (who) => {
      expect((await send(who, "put", `/lesson/practice/question/order/${TX.practiceQuestion}/5`)).status).toBe(200);
      expect(String(stored("lessonpracticequestions", "lessonpracticequestionid", TX.practiceQuestion).lessonpracticequestionorder)).toBe("5");
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/practice/question/order/${id}/5`), TY.practiceQuestion, TU.practiceQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/practice/question/order/${id}/5`), "lessonpracticequestionid", TX.practiceQuestion, TY.practiceQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/practice/question/order/${TY.practiceQuestion}/5`)).status).toBe(200);
      expect(String(stored("lessonpracticequestions", "lessonpracticequestionid", TY.practiceQuestion).lessonpracticequestionorder)).toBe("5");
    });
  });

  describe("DELETE /lesson/practice/question/:lessonpracticequestionid", () => {
    it.each(IN_X)("%s: removes X's row", async (who) => {
      expect((await send(who, "delete", `/lesson/practice/question/${TX.practiceQuestion}`)).status).toBe(200);
      expect(db.tables.lessonpracticequestions.map((x) => x.lessonpracticequestionid)).not.toContain(TX.practiceQuestion);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/lesson/practice/question/${id}`), TY.practiceQuestion, TU.practiceQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/lesson/practice/question/${id}`), "lessonpracticequestionid", TX.practiceQuestion, TY.practiceQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "delete", `/lesson/practice/question/${TU.practiceQuestion}`)).status).toBe(200);
      expect(db.tables.lessonpracticequestions.map((x) => x.lessonpracticequestionid)).not.toContain(TU.practiceQuestion);
    });
  });

  // ───────────────────────────── lesson quizs ─────────────────────────────
  describe("GET /lesson/quiz/:lessonid", () => {
    it.each(IN_X)("%s: the quizs of X's lesson", async (who) => {
      const res = await send(who, "get", `/lesson/quiz/${TX.lesson}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "lessonquizid")).toEqual(sorted(TX.quiz, TX.quiz2));
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/quiz/${id}`), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/quiz/${id}`), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson's quizs", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/lesson/quiz/${TU.lesson}`)).body.data, "lessonquizid")).toEqual(sorted(TU.quiz, TU.quiz2));
    });
  });

  describe("GET /lesson/quiz/:lessonid/:lessonquizid", () => {
    it.each(IN_X)("%s: X's quiz", async (who) => {
      const res = await send(who, "get", `/lesson/quiz/${TX.lesson}/${TX.quiz}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ lessonquizid: TX.quiz, lessonid: TX.lesson });
    });
    it.each(IN_X)("%s: Y's and an unowned quiz answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/quiz/${TX.lesson}/${id}`), TY.quiz, TU.quiz)).toBe(400);
    });
    it.each(IN_X)("%s: the quiz in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/quiz/${TX.lesson}/${id}`), "lessonquizid", TX.quiz, TY.quiz)).toBe(404);
    });
    it("a platform user not acting: any quiz", async () => {
      expect((await send(NOT_ACTING, "get", `/lesson/quiz/${TU.lesson}/${TU.quiz}`)).body.data.lessonquizid).toBe(TU.quiz);
    });
  });

  describe("POST /lesson/quiz/:lessonid", () => {
    const body = { lessonquizname: "ថ្មី", lessonquizdescription: "ពិពណ៌នា", lessonquizorder: 3, points: 10 };
    it.each(IN_X)("%s: adds a quiz to X's lesson", async (who) => {
      expect((await send(who, "post", `/lesson/quiz/${TX.lesson}`, body)).status).toBe(200);
      expect(db.createdIn("lessonquizzes")).toEqual([expect.objectContaining({ lessonid: TX.lesson, lessonquizname: "ថ្មី" })]);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does, nothing written", async (who) => {
      // (named as a quiz of the other lesson: the name is not a way to tell the lesson is there)
      const named = (id: string) => ({ ...body, lessonquizname: stored("lessonquizzes", "lessonquizid", id === TY.lesson ? TY.quiz : TU.quiz).lessonquizname });
      expect(await asAbsent(who, "post", (id) => r(`/lesson/quiz/${id}`, id === MISSING ? body : named(id)), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "post", (id) => r(`/lesson/quiz/${id}`, body), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: to any lesson", async () => {
      expect((await send(NOT_ACTING, "post", `/lesson/quiz/${TU.lesson}`, body)).status).toBe(200);
      expect(db.createdIn("lessonquizzes")[0].lessonid).toBe(TU.lesson);
    });
  });

  describe("PUT /lesson/quiz/activate/:lessonquizid", () => {
    it.each(IN_X)("%s: activates X's quiz", async (who) => {
      stored("lessonquizzes", "lessonquizid", TX.quiz).lessonquizstatus = false;
      expect((await send(who, "put", `/lesson/quiz/activate/${TX.quiz}`)).status).toBe(200);
      expect(stored("lessonquizzes", "lessonquizid", TX.quiz).lessonquizstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned quiz answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/quiz/activate/${id}`), TY.quiz, TU.quiz)).toBe(400);
    });
    it.each(IN_X)("%s: the quiz in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/quiz/activate/${id}`), "lessonquizid", TX.quiz, TY.quiz)).toBe(404);
    });
    it("a platform user not acting: any quiz", async () => {
      stored("lessonquizzes", "lessonquizid", TY.quiz).lessonquizstatus = false;
      expect((await send(NOT_ACTING, "put", `/lesson/quiz/activate/${TY.quiz}`)).status).toBe(200);
      expect(stored("lessonquizzes", "lessonquizid", TY.quiz).lessonquizstatus).toBe(true);
    });
  });

  describe("PUT /lesson/quiz/deactivate/:lessonquizid", () => {
    it.each(IN_X)("%s: deactivates X's quiz", async (who) => {
      expect((await send(who, "put", `/lesson/quiz/deactivate/${TX.quiz}`)).status).toBe(200);
      expect(stored("lessonquizzes", "lessonquizid", TX.quiz).lessonquizstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned quiz answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/quiz/deactivate/${id}`), TY.quiz, TU.quiz)).toBe(400);
    });
    it.each(IN_X)("%s: the quiz in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/quiz/deactivate/${id}`), "lessonquizid", TX.quiz, TY.quiz)).toBe(404);
    });
    it("a platform user not acting: any quiz", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/quiz/deactivate/${TU.quiz}`)).status).toBe(200);
      expect(stored("lessonquizzes", "lessonquizid", TU.quiz).lessonquizstatus).toBe(false);
    });
  });

  describe("PUT /lesson/quiz/order/:lessonquizid/:lessonquizorder", () => {
    it.each(IN_X)("%s: reorders X's quiz", async (who) => {
      expect((await send(who, "put", `/lesson/quiz/order/${TX.quiz}/5`)).status).toBe(200);
      expect(String(stored("lessonquizzes", "lessonquizid", TX.quiz).lessonquizorder)).toBe("5");
    });
    it.each(IN_X)("%s: Y's and an unowned quiz answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/quiz/order/${id}/5`), TY.quiz, TU.quiz)).toBe(400);
    });
    it.each(IN_X)("%s: the quiz in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/quiz/order/${id}/5`), "lessonquizid", TX.quiz, TY.quiz)).toBe(404);
    });
    it("a platform user not acting: any quiz", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/quiz/order/${TY.quiz}/5`)).status).toBe(200);
      expect(String(stored("lessonquizzes", "lessonquizid", TY.quiz).lessonquizorder)).toBe("5");
    });
  });

  describe("PUT /lesson/quiz/:lessonquizid", () => {
    const body = (lessonid: string, lessonquizname = "ឈ្មោះថ្មី") => ({ lessonid, lessonquizname, lessonquizdescription: "ពិពណ៌នា", points: 10 });
    it.each(IN_X)("%s: renames X's quiz, in X's lesson", async (who) => {
      expect((await send(who, "put", `/lesson/quiz/${TX.quiz}`, body(TX.lesson2))).status).toBe(200);
      expect(stored("lessonquizzes", "lessonquizid", TX.quiz)).toMatchObject({ lessonquizname: "ឈ្មោះថ្មី", lessonid: TX.lesson2 });
    });
    it.each(IN_X)("%s: Y's and an unowned quiz answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/quiz/${id}`, body(TX.lesson)), TY.quiz, TU.quiz)).toBe(400);
    });
    it.each(IN_X)("%s: moved into Y's or an unowned lesson is the 404 an absent lesson gets, nothing written", async (who) => {
      const named = (id: string) => body(id, stored("lessonquizzes", "lessonquizid", id === TY.lesson ? TY.quiz : TU.quiz).lessonquizname as string);
      expect(await asAbsent(who, "put", (id) => r(`/lesson/quiz/${TX.quiz}`, id === MISSING ? body(id) : named(id)), TY.lesson, TU.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: the quiz in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/quiz/${id}`, body(TX.lesson)), "lessonquizid", TX.quiz, TY.quiz)).toBe(404);
    });
    it("a platform user not acting: any quiz, into a lesson of its owner", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/quiz/${TY.quiz}`, body(TY.lesson2))).status).toBe(200);
      expect(stored("lessonquizzes", "lessonquizid", TY.quiz).lessonid).toBe(TY.lesson2);
    });
  });

  describe("DELETE /lesson/quiz/:lessonquizid", () => {
    it.each(IN_X)("%s: deletes X's quiz", async (who) => {
      expect((await send(who, "delete", `/lesson/quiz/${TX.quiz}`)).status).toBe(200);
      expect(db.tables.lessonquizzes.map((x) => x.lessonquizid)).not.toContain(TX.quiz);
    });
    it.each(IN_X)("%s: Y's and an unowned quiz answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/lesson/quiz/${id}`), TY.quiz, TU.quiz)).toBe(400);
    });
    it.each(IN_X)("%s: the quiz in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/lesson/quiz/${id}`), "lessonquizid", TX.quiz, TY.quiz)).toBe(404);
    });
    it("a platform user not acting: any quiz", async () => {
      expect((await send(NOT_ACTING, "delete", `/lesson/quiz/${TU.quiz}`)).status).toBe(200);
      expect(db.tables.lessonquizzes.map((x) => x.lessonquizid)).not.toContain(TU.quiz);
    });
  });

  // ───────────────────────────── lesson quiz questions ─────────────────────────────
  describe("GET /lesson/quiz/question/:lessonquizid", () => {
    it.each(IN_X)("%s: the questions of X's quiz", async (who) => {
      const res = await send(who, "get", `/lesson/quiz/question/${TX.quiz}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "lessonquizquestionid")).toEqual([TX.quizQuestion]);
    });
    it.each(IN_X)("%s: Y's and an unowned quiz answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/quiz/question/${id}`), TY.quiz, TU.quiz)).toBe(400);
    });
    it.each(IN_X)("%s: the quiz in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/quiz/question/${id}`), "lessonquizid", TX.quiz, TY.quiz)).toBe(404);
    });
    it("a platform user not acting: any quiz's questions", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/lesson/quiz/question/${TY.quiz}`)).body.data, "lessonquizquestionid")).toEqual([TY.quizQuestion]);
    });
  });

  describe("POST /lesson/quiz/question/:lessonquizid/:questionid/:lessonquizquestionorder", () => {
    const at = (quiz: string, question: string) => r(`/lesson/quiz/question/${quiz}/${question}/2`);
    it.each(IN_X)("%s: adds X's question to X's quiz", async (who) => {
      expect((await send(who, "post", at(TX.quiz, TX.question2).path)).status).toBe(200);
      expect(db.createdIn("lessonquizquestions")).toEqual([expect.objectContaining({ lessonquizid: TX.quiz, questionid: TX.question2 })]);
    });
    it.each(IN_X)("%s: Y's or an unowned quiz answers as an absent quiz does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => at(id, TX.question2), TY.quiz, TU.quiz)).toBe(400);
    });
    it.each(IN_X)("%s: Y's or an unowned question answers as an absent question does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => at(TX.quiz, id), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the quiz and the question in the path are the ones checked, before any owner is compared (404, not the 400 for two owners)", async (who) => {
      expect(await asAbsentPath(who, "post", (id) => at(id, TX.question2), "lessonquizid", TX.quiz, TY.quiz)).toBe(404);
      expect(await asAbsentPath(who, "post", (id) => at(TX.quiz, id), "questionid", TX.question2, TY.question)).toBe(404);
    });
    it("a platform user not acting: any quiz, with a question of the same owner", async () => {
      expect((await send(NOT_ACTING, "post", at(TY.quiz, TY.question2).path)).status).toBe(200);
      expect((await send(NOT_ACTING, "post", at(TY.quiz, TX.question).path)).status).toBe(400);
    });
  });

  describe("PUT /lesson/quiz/question/activate/:lessonquizquestionid", () => {
    it.each(IN_X)("%s: activates X's row", async (who) => {
      stored("lessonquizquestions", "lessonquizquestionid", TX.quizQuestion).lessonquizquestionstatus = false;
      expect((await send(who, "put", `/lesson/quiz/question/activate/${TX.quizQuestion}`)).status).toBe(200);
      expect(stored("lessonquizquestions", "lessonquizquestionid", TX.quizQuestion).lessonquizquestionstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/quiz/question/activate/${id}`), TY.quizQuestion, TU.quizQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/quiz/question/activate/${id}`), "lessonquizquestionid", TX.quizQuestion, TY.quizQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      stored("lessonquizquestions", "lessonquizquestionid", TY.quizQuestion).lessonquizquestionstatus = false;
      expect((await send(NOT_ACTING, "put", `/lesson/quiz/question/activate/${TY.quizQuestion}`)).status).toBe(200);
      expect(stored("lessonquizquestions", "lessonquizquestionid", TY.quizQuestion).lessonquizquestionstatus).toBe(true);
    });
  });

  describe("PUT /lesson/quiz/question/deactivate/:lessonquizquestionid", () => {
    it.each(IN_X)("%s: deactivates X's row", async (who) => {
      expect((await send(who, "put", `/lesson/quiz/question/deactivate/${TX.quizQuestion}`)).status).toBe(200);
      expect(stored("lessonquizquestions", "lessonquizquestionid", TX.quizQuestion).lessonquizquestionstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/quiz/question/deactivate/${id}`), TY.quizQuestion, TU.quizQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/quiz/question/deactivate/${id}`), "lessonquizquestionid", TX.quizQuestion, TY.quizQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/quiz/question/deactivate/${TU.quizQuestion}`)).status).toBe(200);
      expect(stored("lessonquizquestions", "lessonquizquestionid", TU.quizQuestion).lessonquizquestionstatus).toBe(false);
    });
  });

  describe("PUT /lesson/quiz/question/order/:lessonquizquestionid/:lessonquizquestionorder", () => {
    it.each(IN_X)("%s: reorders X's row", async (who) => {
      expect((await send(who, "put", `/lesson/quiz/question/order/${TX.quizQuestion}/5`)).status).toBe(200);
      expect(String(stored("lessonquizquestions", "lessonquizquestionid", TX.quizQuestion).lessonquizquestionorder)).toBe("5");
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/quiz/question/order/${id}/5`), TY.quizQuestion, TU.quizQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/quiz/question/order/${id}/5`), "lessonquizquestionid", TX.quizQuestion, TY.quizQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/quiz/question/order/${TY.quizQuestion}/5`)).status).toBe(200);
      expect(String(stored("lessonquizquestions", "lessonquizquestionid", TY.quizQuestion).lessonquizquestionorder)).toBe("5");
    });
  });

  describe("DELETE /lesson/quiz/question/:lessonquizquestionid", () => {
    it.each(IN_X)("%s: removes X's row", async (who) => {
      expect((await send(who, "delete", `/lesson/quiz/question/${TX.quizQuestion}`)).status).toBe(200);
      expect(db.tables.lessonquizquestions.map((x) => x.lessonquizquestionid)).not.toContain(TX.quizQuestion);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/lesson/quiz/question/${id}`), TY.quizQuestion, TU.quizQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/lesson/quiz/question/${id}`), "lessonquizquestionid", TX.quizQuestion, TY.quizQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "delete", `/lesson/quiz/question/${TU.quizQuestion}`)).status).toBe(200);
      expect(db.tables.lessonquizquestions.map((x) => x.lessonquizquestionid)).not.toContain(TU.quizQuestion);
    });
  });

  // ───────────────────────────── lessons ─────────────────────────────
  describe("GET /lesson/all", () => {
    it.each(IN_X)("%s: X's lessons, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/lesson/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "lessonid")).toEqual(sorted(TX.lesson, TX.lesson2));
    });
    it.each(IN_X)("%s: a level of another organisation cannot be used to widen it", async (who) => {
      expect(idsOf((await send(who, "get", `/lesson/all?levelid=${TY.level}`)).body.data, "lessonid")).toEqual([]);
    });
    it.each([NOT_ACTING, "a school-user token" as Who])("%s: every lesson, owned or not (a school-user token has no organisation here)", async (who) => {
      const res = await send(who, "get", "/lesson/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "lessonid")).toEqual(sorted(TX.lesson, TX.lesson2, TY.lesson, TY.lesson2, TU.lesson, TU.lesson2));
    });
  });

  describe("POST /lesson/create", () => {
    const body = (levelid: string, lessonname = "មេរៀនថ្មី") => ({ lessonname, lessonorder: 3, levelid, total_points: 100, passing_points: 0 });
    it.each(IN_X)("%s: creates a lesson under X's level", async (who) => {
      expect((await send(who, "post", "/lesson/create", body(TX.level))).status).toBe(200);
      expect(db.createdIn("lessons")).toEqual([expect.objectContaining({ levelid: TX.level, lessonname: "មេរៀនថ្មី" })]);
    });
    it.each(IN_X)("%s: under Y's or an unowned level it is the 404 an absent level gets, nothing written", async (who) => {
      const named = (id: string) => body(id, stored("lessons", "lessonid", id === TY.level ? TY.lesson : TU.lesson).lessonname as string);
      expect(await asAbsent(who, "post", (id) => r("/lesson/create", id === MISSING ? body(id) : named(id)), TY.level, TU.level)).toBe(404);
    });
    it.each(IN_X)("%s: the name is taken in X's level, free in Y's", async (who) => {
      const taken = await send(who, "post", "/lesson/create", { ...body(TX.level), lessonname: stored("lessons", "lessonid", TX.lesson).lessonname });
      expect(taken.status).toBe(409);
      const free = await send(who, "post", "/lesson/create", { ...body(TX.level), lessonname: stored("lessons", "lessonid", TY.lesson).lessonname });
      expect(free.status).toBe(200);
    });
    it("a platform user not acting: under any level", async () => {
      expect((await send(NOT_ACTING, "post", "/lesson/create", body(TU.level))).status).toBe(200);
      expect(db.createdIn("lessons")[0].levelid).toBe(TU.level);
    });
  });

  describe("DELETE /lesson/:lessonid", () => {
    it.each(IN_X)("%s: deletes X's lesson", async (who) => {
      expect((await send(who, "delete", `/lesson/${TX.lesson}`)).status).toBe(200);
      expect(stored("lessons", "lessonid", TX.lesson).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/lesson/${id}`), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/lesson/${id}`), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson", async () => {
      expect((await send(NOT_ACTING, "delete", `/lesson/${TU.lesson}`)).status).toBe(200);
      expect(stored("lessons", "lessonid", TU.lesson).isdeleted).toBe(true);
    });
  });

  describe("PUT /lesson/activate/:lessonid", () => {
    it.each(IN_X)("%s: activates X's lesson", async (who) => {
      stored("lessons", "lessonid", TX.lesson).lessonstatus = false;
      expect((await send(who, "put", `/lesson/activate/${TX.lesson}`)).status).toBe(200);
      expect(stored("lessons", "lessonid", TX.lesson).lessonstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/activate/${id}`), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/activate/${id}`), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson", async () => {
      stored("lessons", "lessonid", TY.lesson).lessonstatus = false;
      expect((await send(NOT_ACTING, "put", `/lesson/activate/${TY.lesson}`)).status).toBe(200);
      expect(stored("lessons", "lessonid", TY.lesson).lessonstatus).toBe(true);
    });
  });

  describe("PUT /lesson/deactivate/:lessonid", () => {
    it.each(IN_X)("%s: deactivates X's lesson", async (who) => {
      expect((await send(who, "put", `/lesson/deactivate/${TX.lesson}`)).status).toBe(200);
      expect(stored("lessons", "lessonid", TX.lesson).lessonstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/deactivate/${id}`), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/deactivate/${id}`), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/deactivate/${TU.lesson}`)).status).toBe(200);
      expect(stored("lessons", "lessonid", TU.lesson).lessonstatus).toBe(false);
    });
  });

  describe("GET /lesson/:lessonid", () => {
    it.each(IN_X)("%s: X's lesson", async (who) => {
      const res = await send(who, "get", `/lesson/${TX.lesson}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ lessonid: TX.lesson, levelid: TX.level, levelname: "កម្រិតទី១tagx" });
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/${id}`), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/${id}`), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson", async () => {
      expect((await send(NOT_ACTING, "get", `/lesson/${TU.lesson}`)).body.data.lessonid).toBe(TU.lesson);
    });
  });

  describe("PUT /lesson/:lessonid", () => {
    const body = (levelid: string, lessonname = "ឈ្មោះថ្មី") => ({ lessonname, lessonorder: 1, levelid, total_points: 100, passing_points: 0 });
    it.each(IN_X)("%s: renames X's lesson, in X's level", async (who) => {
      expect((await send(who, "put", `/lesson/${TX.lesson}`, body(TX.level2))).status).toBe(200);
      expect(stored("lessons", "lessonid", TX.lesson)).toMatchObject({ lessonname: "ឈ្មោះថ្មី", levelid: TX.level2 });
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/${id}`, body(TX.level)), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: moved into Y's or an unowned level is the 404 an absent level gets, nothing written", async (who) => {
      const named = (id: string) => body(id, stored("lessons", "lessonid", id === TY.level ? TY.lesson : TU.lesson).lessonname as string);
      expect(await asAbsent(who, "put", (id) => r(`/lesson/${TX.lesson}`, id === MISSING ? body(id) : named(id)), TY.level, TU.level)).toBe(404);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/${id}`, body(TX.level)), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson, into a level of its owner", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/${TY.lesson}`, body(TY.level2))).status).toBe(200);
      expect(stored("lessons", "lessonid", TY.lesson).levelid).toBe(TY.level2);
    });
  });

  describe("POST /lesson", () => {
    const list = (who: Who, filter: object[] = []) => send(who, "post", "/lesson", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: lists X's lessons, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "lessonid")).toEqual(sorted(TX.lesson, TX.lesson2));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      expect(idsOf((await list(who, [{ key: "lessonname", value: "Second tagy" }])).body.data.data, "lessonid")).toEqual([]);
    });
    it("a platform user not acting: every lesson, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "lessonid")).toEqual(sorted(TX.lesson, TX.lesson2, TY.lesson, TY.lesson2, TU.lesson, TU.lesson2));
    });
  });

  // ───────────────────────────── lesson learnings ─────────────────────────────
  describe("GET /lesson/learning/:lessonid", () => {
    it.each(IN_X)("%s: the learnings of X's lesson", async (who) => {
      const res = await send(who, "get", `/lesson/learning/${TX.lesson}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "lessonlearningid")).toEqual([TX.learning]);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/learning/${id}`), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/learning/${id}`), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson's learnings", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/lesson/learning/${TU.lesson}`)).body.data, "lessonlearningid")).toEqual([TU.learning]);
    });
  });

  describe("GET /lesson/learning/:lessonid/:lessonlearningid", () => {
    it.each(IN_X)("%s: X's learning", async (who) => {
      const res = await send(who, "get", `/lesson/learning/${TX.lesson}/${TX.learning}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ lessonlearningid: TX.learning, lessonid: TX.lesson, documentid: TX.document });
    });
    it.each(IN_X)("%s: Y's and an unowned learning answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/learning/${TX.lesson}/${id}`), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: the learning in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/learning/${TX.lesson}/${id}`), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any learning", async () => {
      expect((await send(NOT_ACTING, "get", `/lesson/learning/${TU.lesson}/${TU.learning}`)).body.data.lessonlearningid).toBe(TU.learning);
    });
  });

  describe("POST /lesson/learning/:lessonid", () => {
    const body = (documentid: string) => ({ documentid, lessonlearningname: "ថ្មី", lessonlearningdescription: "ពិពណ៌នា", lessonlearningorder: 3 });
    it.each(IN_X)("%s: adds a learning of X's document to X's lesson", async (who) => {
      expect((await send(who, "post", `/lesson/learning/${TX.lesson}`, body(TX.document2))).status).toBe(200);
      expect(db.createdIn("lessonlearnings")).toEqual([expect.objectContaining({ lessonid: TX.lesson, documentid: TX.document2 })]);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r(`/lesson/learning/${id}`, body(TX.document2)), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: Y's and an unowned document answer as an absent document does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r(`/lesson/learning/${TX.lesson}`, body(id)), TY.document, TU.document)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "post", (id) => r(`/lesson/learning/${id}`, body(TX.document2)), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: to any lesson, with a document of its owner", async () => {
      expect((await send(NOT_ACTING, "post", `/lesson/learning/${TU.lesson}`, body(TU.document2))).status).toBe(200);
      expect((await send(NOT_ACTING, "post", `/lesson/learning/${TY.lesson}`, body(TX.document2))).status).toBe(400);
    });
  });

  describe("PUT /lesson/learning/activate/:lessonlearningid", () => {
    it.each(IN_X)("%s: activates X's row", async (who) => {
      stored("lessonlearnings", "lessonlearningid", TX.learning).lessonlearningstatus = false;
      expect((await send(who, "put", `/lesson/learning/activate/${TX.learning}`)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TX.learning).lessonlearningstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/learning/activate/${id}`), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/learning/activate/${id}`), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      stored("lessonlearnings", "lessonlearningid", TY.learning).lessonlearningstatus = false;
      expect((await send(NOT_ACTING, "put", `/lesson/learning/activate/${TY.learning}`)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TY.learning).lessonlearningstatus).toBe(true);
    });
  });

  describe("PUT /lesson/learning/deactivate/:lessonlearningid", () => {
    it.each(IN_X)("%s: deactivates X's row", async (who) => {
      expect((await send(who, "put", `/lesson/learning/deactivate/${TX.learning}`)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TX.learning).lessonlearningstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/learning/deactivate/${id}`), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/learning/deactivate/${id}`), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/learning/deactivate/${TU.learning}`)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TU.learning).lessonlearningstatus).toBe(false);
    });
  });

  describe("PUT /lesson/learning/order/:lessonlearningid/:lessonlearningorder", () => {
    it.each(IN_X)("%s: reorders X's row", async (who) => {
      expect((await send(who, "put", `/lesson/learning/order/${TX.learning}/5`)).status).toBe(200);
      expect(String(stored("lessonlearnings", "lessonlearningid", TX.learning).lessonlearningorder)).toBe("5");
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/learning/order/${id}/5`), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/learning/order/${id}/5`), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/learning/order/${TY.learning}/5`)).status).toBe(200);
      expect(String(stored("lessonlearnings", "lessonlearningid", TY.learning).lessonlearningorder)).toBe("5");
    });
  });

  describe("PUT /lesson/learning/:lessonlearningid", () => {
    const body = (documentid: string) => ({ documentid, lessonid: TX.lesson, lessonlearningname: "ឈ្មោះថ្មី", lessonlearningdescription: "ពិពណ៌នា" });
    it.each(IN_X)("%s: renames X's learning and points it at X's other document", async (who) => {
      expect((await send(who, "put", `/lesson/learning/${TX.learning}`, body(TX.document2))).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TX.learning)).toMatchObject({ lessonlearningname: "ឈ្មោះថ្មី", documentid: TX.document2 });
    });
    it.each(IN_X)("%s: Y's and an unowned learning answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/learning/${id}`, body(TX.document2)), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: a document of Y or an unowned one is the 404 an absent document gets, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/learning/${TX.learning}`, body(id)), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: the learning in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/learning/${id}`, body(TX.document2)), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any learning, with a document of its owner", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/learning/${TY.learning}`, { ...body(TY.document2), lessonid: TY.lesson })).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TY.learning).documentid).toBe(TY.document2);
    });
  });

  describe("DELETE /lesson/learning/:lessonlearningid", () => {
    it.each(IN_X)("%s: deletes X's learning", async (who) => {
      expect((await send(who, "delete", `/lesson/learning/${TX.learning}`)).status).toBe(200);
      expect(db.tables.lessonlearnings.map((x) => x.lessonlearningid)).not.toContain(TX.learning);
    });
    it.each(IN_X)("%s: Y's and an unowned learning answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/lesson/learning/${id}`), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: the learning in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/lesson/learning/${id}`), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any learning", async () => {
      expect((await send(NOT_ACTING, "delete", `/lesson/learning/${TU.learning}`)).status).toBe(200);
      expect(db.tables.lessonlearnings.map((x) => x.lessonlearningid)).not.toContain(TU.learning);
    });
  });

  // ───────────────────────────── lesson plans ─────────────────────────────
  describe("GET /lesson/plan/:lessonid", () => {
    it.each(IN_X)("%s: the plans of X's lesson", async (who) => {
      const res = await send(who, "get", `/lesson/plan/${TX.lesson}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "lessonplanid")).toEqual([TX.plan]);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/plan/${id}`), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/plan/${id}`), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: any lesson's plans", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/lesson/plan/${TU.lesson}`)).body.data, "lessonplanid")).toEqual([TU.plan]);
    });
  });

  describe("GET /lesson/plan/:lessonid/:lessonplanid", () => {
    it.each(IN_X)("%s: X's plan", async (who) => {
      const res = await send(who, "get", `/lesson/plan/${TX.lesson}/${TX.plan}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ lessonplanid: TX.plan, lessonid: TX.lesson, documentid: TX.document });
    });
    it.each(IN_X)("%s: Y's and an unowned plan answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/lesson/plan/${TX.lesson}/${id}`), TY.plan, TU.plan)).toBe(400);
    });
    it.each(IN_X)("%s: the plan in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/lesson/plan/${TX.lesson}/${id}`), "lessonplanid", TX.plan, TY.plan)).toBe(404);
    });
    it("a platform user not acting: any plan", async () => {
      expect((await send(NOT_ACTING, "get", `/lesson/plan/${TU.lesson}/${TU.plan}`)).body.data.lessonplanid).toBe(TU.plan);
    });
  });

  describe("POST /lesson/plan/:lessonid", () => {
    const body = (documentid: string) => ({ documentid, lessonplanname: "ថ្មី", lessonplandescription: "ពិពណ៌នា", lessonplanorder: 3 });
    it.each(IN_X)("%s: adds a plan of X's document to X's lesson", async (who) => {
      expect((await send(who, "post", `/lesson/plan/${TX.lesson}`, body(TX.document2))).status).toBe(200);
      expect(db.createdIn("lessonplans")).toEqual([expect.objectContaining({ lessonid: TX.lesson, documentid: TX.document2 })]);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r(`/lesson/plan/${id}`, body(TX.document2)), TY.lesson, TU.lesson)).toBe(400);
    });
    it.each(IN_X)("%s: Y's and an unowned document answer as an absent document does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r(`/lesson/plan/${TX.lesson}`, body(id)), TY.document, TU.document)).toBe(400);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "post", (id) => r(`/lesson/plan/${id}`, body(TX.document2)), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it("a platform user not acting: to any lesson, with a document of its owner", async () => {
      expect((await send(NOT_ACTING, "post", `/lesson/plan/${TU.lesson}`, body(TU.document2))).status).toBe(200);
      expect((await send(NOT_ACTING, "post", `/lesson/plan/${TY.lesson}`, body(TX.document2))).status).toBe(400);
    });
  });

  describe("PUT /lesson/plan/activate/:lessonlearningid", () => {
    it.each(IN_X)("%s: activates X's row", async (who) => {
      stored("lessonlearnings", "lessonlearningid", TX.learning).lessonlearningstatus = false;
      expect((await send(who, "put", `/lesson/plan/activate/${TX.learning}`)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TX.learning).lessonlearningstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/plan/activate/${id}`), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/plan/activate/${id}`), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      stored("lessonlearnings", "lessonlearningid", TY.learning).lessonlearningstatus = false;
      expect((await send(NOT_ACTING, "put", `/lesson/plan/activate/${TY.learning}`)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TY.learning).lessonlearningstatus).toBe(true);
    });
  });

  describe("PUT /lesson/plan/deactivate/:lessonlearningid", () => {
    it.each(IN_X)("%s: deactivates X's row", async (who) => {
      expect((await send(who, "put", `/lesson/plan/deactivate/${TX.learning}`)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TX.learning).lessonlearningstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/plan/deactivate/${id}`), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/plan/deactivate/${id}`), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/plan/deactivate/${TU.learning}`)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TU.learning).lessonlearningstatus).toBe(false);
    });
  });

  describe("PUT /lesson/plan/order/:lessonlearningid/:lessonlearningorder", () => {
    it.each(IN_X)("%s: reorders X's row", async (who) => {
      expect((await send(who, "put", `/lesson/plan/order/${TX.learning}/5`)).status).toBe(200);
      expect(String(stored("lessonlearnings", "lessonlearningid", TX.learning).lessonlearningorder)).toBe("5");
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/plan/order/${id}/5`), TY.learning, TU.learning)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/plan/order/${id}/5`), "lessonlearningid", TX.learning, TY.learning)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/plan/order/${TY.learning}/5`)).status).toBe(200);
      expect(String(stored("lessonlearnings", "lessonlearningid", TY.learning).lessonlearningorder)).toBe("5");
    });
  });

  describe("PUT /lesson/plan/:lessonplanid", () => {
    const body = (documentid: string) => ({ documentid, lessonid: TX.lesson, lessonplanname: "ឈ្មោះថ្មី", lessonplandescription: "ពិពណ៌នា" });
    it.each(IN_X)("%s: renames X's plan and points it at X's other document", async (who) => {
      expect((await send(who, "put", `/lesson/plan/${TX.plan}`, body(TX.document2))).status).toBe(200);
      expect(stored("lessonplans", "lessonplanid", TX.plan)).toMatchObject({ lessonplanname: "ឈ្មោះថ្មី", documentid: TX.document2 });
    });
    it.each(IN_X)("%s: Y's and an unowned plan answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/plan/${id}`, body(TX.document2)), TY.plan, TU.plan)).toBe(400);
    });
    it.each(IN_X)("%s: a document of Y or an unowned one is the 404 an absent document gets, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/plan/${TX.plan}`, body(id)), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: the plan in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/lesson/plan/${id}`, body(TX.document2)), "lessonplanid", TX.plan, TY.plan)).toBe(404);
    });
    it("a platform user not acting: any plan, with a document of its owner", async () => {
      expect((await send(NOT_ACTING, "put", `/lesson/plan/${TY.plan}`, { ...body(TY.document2), lessonid: TY.lesson })).status).toBe(200);
      expect(stored("lessonplans", "lessonplanid", TY.plan).documentid).toBe(TY.document2);
    });
  });

  describe("DELETE /lesson/plan/:lessonplanid", () => {
    it.each(IN_X)("%s: deletes X's plan", async (who) => {
      expect((await send(who, "delete", `/lesson/plan/${TX.plan}`)).status).toBe(200);
      expect(db.tables.lessonplans.map((x) => x.lessonplanid)).not.toContain(TX.plan);
    });
    it.each(IN_X)("%s: Y's and an unowned plan answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/lesson/plan/${id}`), TY.plan, TU.plan)).toBe(400);
    });
    it.each(IN_X)("%s: the plan in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/lesson/plan/${id}`), "lessonplanid", TX.plan, TY.plan)).toBe(404);
    });
    it("a platform user not acting: any plan", async () => {
      expect((await send(NOT_ACTING, "delete", `/lesson/plan/${TU.plan}`)).status).toBe(200);
      expect(db.tables.lessonplans.map((x) => x.lessonplanid)).not.toContain(TU.plan);
    });
  });

  // ───────────────────────────── questions ─────────────────────────────
  describe("POST /question/create", () => {
    const body = (over: object = {}) => ({ questionidentifier: "សំណួរ-ថ្មី", questiontext: "សួស្តី", templatetypeid: 1, questioncorrectvalue: 1, ...over });
    it.each(IN_X)("%s: creates a question that is X's", async (who) => {
      expect((await send(who, "post", "/question/create", body())).status).toBe(200);
      expect(db.createdIn("questions")).toEqual([expect.objectContaining({ organisationid: X, questionidentifier: "សំណួរ-ថ្មី" })]);
    });
    it.each(IN_X)("%s: tags in the body are names: one Y holds is as free as one nobody holds", async (who) => {
      const held = await send(who, "post", "/question/create", body({ questionidentifier: "tags-a", questiontags: ["qtagy"] }));
      const free = await send(who, "post", "/question/create", body({ questionidentifier: "tags-b", questiontags: ["qtagnew"] }));
      expect([held.status, free.status]).toEqual([200, 200]);
      expect(db.createdIn("questions").map((q) => q.questiontags)).toEqual([["qtagy"], ["qtagnew"]]);
    });
    it.each(IN_X)("%s: the identifier is unique among X's questions only: Y's identifier is free", async (who) => {
      const free = await send(who, "post", "/question/create", body({ questionidentifier: stored("questions", "questionid", TY.question).questionidentifier }));
      expect(free.status).toBe(200);
      const taken = await send(who, "post", "/question/create", body({ questionidentifier: stored("questions", "questionid", TX.question).questionidentifier }));
      expect(taken.status).toBe(409);
    });
  });

  describe("DELETE /question/:questionid", () => {
    it.each(IN_X)("%s: deletes X's question", async (who) => {
      expect((await send(who, "delete", `/question/${TX.question}`)).status).toBe(200);
      expect(stored("questions", "questionid", TX.question).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned question answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/question/${id}`), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the question in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/question/${id}`), "questionid", TX.question, TY.question)).toBe(404);
    });
    it("a platform user not acting: any question", async () => {
      expect((await send(NOT_ACTING, "delete", `/question/${TU.question}`)).status).toBe(200);
      expect(stored("questions", "questionid", TU.question).isdeleted).toBe(true);
    });
  });

  describe("GET /question/:questionid", () => {
    it.each(IN_X)("%s: X's question", async (who) => {
      const res = await send(who, "get", `/question/${TX.question}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ questionid: TX.question, questionidentifier: "qi-tagx" });
    });
    it.each(IN_X)("%s: Y's and an unowned question answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/question/${id}`), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the question in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/question/${id}`), "questionid", TX.question, TY.question)).toBe(404);
    });
    it("a platform user not acting: any question", async () => {
      expect((await send(NOT_ACTING, "get", `/question/${TU.question}`)).body.data.questionid).toBe(TU.question);
    });
  });

  describe("PUT /question/:questionid", () => {
    const body = { questionidentifier: "សំណួរ-ថ្មី" };
    it.each(IN_X)("%s: renames X's question, which keeps its owner", async (who) => {
      expect((await send(who, "put", `/question/${TX.question}`, body)).status).toBe(200);
      expect(stored("questions", "questionid", TX.question)).toMatchObject({ questionidentifier: "សំណួរ-ថ្មី", organisationid: X });
    });
    it.each(IN_X)("%s: Y's and an unowned question answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/question/${id}`, body), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the question in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/question/${id}`, body), "questionid", TX.question, TY.question)).toBe(404);
    });
    it("a platform user not acting: the identifier is unique within the row's own organisation, and across everything for an unowned row", async () => {
      const identifierOf = (id: string) => stored("questions", "questionid", id).questionidentifier as string;
      const put = (id: string, questionidentifier: string) => send(NOT_ACTING, "put", `/question/${id}`, { questionidentifier });
      expect((await put(TY.question, identifierOf(TX.question))).status).toBe(200);
      expect((await put(TY.question, identifierOf(TY.question2))).status).toBe(409);
      expect((await put(TU.question, identifierOf(TX.question2))).status).toBe(409);
    });
    it("a platform user not acting: any question", async () => {
      expect((await send(NOT_ACTING, "put", `/question/${TU.question}`, body)).status).toBe(200);
      expect(stored("questions", "questionid", TU.question).questionidentifier).toBe("សំណួរ-ថ្មី");
    });
  });

  describe("POST /question", () => {
    const list = (who: Who, filter: object[] = []) => send(who, "post", "/question", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: lists X's questions, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "questionid")).toEqual(sorted(TX.question, TX.question2));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      expect(idsOf((await list(who, [{ key: "questionidentifier", value: "qi-tagy" }])).body.data.data, "questionid")).toEqual([]);
    });
    it("a platform user not acting: every question, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "questionid")).toEqual(sorted(TX.question, TX.question2, TY.question, TY.question2, TU.question, TU.question2));
    });
  });

  describe("POST /question/search", () => {
    const search = (who: Who, filter: object[] = []) => send(who, "post", "/question/search", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: finds X's questions, none of Y's or the unowned", async (who) => {
      const res = await search(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "questionid")).toEqual(sorted(TX.question, TX.question2));
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      expect(idsOf((await search(who, [{ key: "questionidentifier", value: "qi-tagy" }])).body.data.data, "questionid")).toEqual([]);
    });
    it("a platform user not acting: every question, owned or not", async () => {
      expect(idsOf((await search(NOT_ACTING)).body.data.data, "questionid")).toEqual(sorted(TX.question, TX.question2, TY.question, TY.question2, TU.question, TU.question2));
    });
  });

  describe("GET /question/tag/:questionid/:tag", () => {
    it.each(IN_X)("%s: adds X's tag to X's question", async (who) => {
      expect((await send(who, "get", `/question/tag/${TX.question}/qtagx`)).status).toBe(200);
      expect(stored("questions", "questionid", TX.question).questiontags).toEqual(["qtagx"]);
    });
    it.each(IN_X)("%s: Y's and an unowned question answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/question/tag/${id}/qtagx`), TY.question, TU.question)).toBe(404);
    });
    it.each(IN_X)("%s: a tag name Y (or nobody) holds is a name like any other for X's question: the answer does not tell who holds it", async (who) => {
      const held = await send(who, "get", `/question/tag/${TX.question}/qtagy`);
      const free = await send(who, "get", `/question/tag/${TX.question}/qtagnew`);
      expect(said(held)).toEqual(said(free));
      expect(free.status).toBe(200);
      expect(stored("questions", "questionid", TX.question).questiontags).toEqual(["qtagy", "qtagnew"]);
    });
    it.each(IN_X)("%s: the question in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/question/tag/${id}/qtagx`), "questionid", TX.question, TY.question)).toBe(404);
    });
    it("a platform user not acting: any question, with a tag of its owner", async () => {
      expect((await send(NOT_ACTING, "get", `/question/tag/${TY.question}/qtagy`)).status).toBe(200);
      expect(stored("questions", "questionid", TY.question).questiontags).toEqual(["qtagy"]);
    });
  });

  describe("DELETE /question/tag/:questionid/:tag", () => {
    it.each(IN_X)("%s: removes a tag from X's question", async (who) => {
      stored("questions", "questionid", TX.question).questiontags = ["qtagx", "other"];
      expect((await send(who, "delete", `/question/tag/${TX.question}/qtagx`)).status).toBe(200);
      expect(stored("questions", "questionid", TX.question).questiontags).toEqual(["other"]);
    });
    it.each(IN_X)("%s: Y's and an unowned question answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/question/tag/${id}/qtagx`), TY.question, TU.question)).toBe(404);
    });
    it.each(IN_X)("%s: the question in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/question/tag/${id}/qtagx`), "questionid", TX.question, TY.question)).toBe(404);
    });
    it("a platform user not acting: any question", async () => {
      stored("questions", "questionid", TU.question).questiontags = ["qtagu"];
      expect((await send(NOT_ACTING, "delete", `/question/tag/${TU.question}/qtagu`)).status).toBe(200);
      expect(stored("questions", "questionid", TU.question).questiontags).toEqual([]);
    });
  });

  describe("PUT /question/activate/:questionid", () => {
    it.each(IN_X)("%s: activates X's question", async (who) => {
      stored("questions", "questionid", TX.question).questionstatus = false;
      expect((await send(who, "put", `/question/activate/${TX.question}`)).status).toBe(200);
      expect(stored("questions", "questionid", TX.question).questionstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned question answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/question/activate/${id}`), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the question in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/question/activate/${id}`), "questionid", TX.question, TY.question)).toBe(404);
    });
    it("a platform user not acting: any question", async () => {
      stored("questions", "questionid", TY.question).questionstatus = false;
      expect((await send(NOT_ACTING, "put", `/question/activate/${TY.question}`)).status).toBe(200);
      expect(stored("questions", "questionid", TY.question).questionstatus).toBe(true);
    });
  });

  describe("PUT /question/deactivate/:questionid", () => {
    it.each(IN_X)("%s: deactivates X's question", async (who) => {
      expect((await send(who, "put", `/question/deactivate/${TX.question}`)).status).toBe(200);
      expect(stored("questions", "questionid", TX.question).questionstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned question answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/question/deactivate/${id}`), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the question in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/question/deactivate/${id}`), "questionid", TX.question, TY.question)).toBe(404);
    });
    it("a platform user not acting: any question", async () => {
      expect((await send(NOT_ACTING, "put", `/question/deactivate/${TU.question}`)).status).toBe(200);
      expect(stored("questions", "questionid", TU.question).questionstatus).toBe(false);
    });
  });

  describe("PUT /question/:questionid/questionidentifier/:questionidentifier", () => {
    it.each(IN_X)("%s: changes the identifier of X's question", async (who) => {
      expect((await send(who, "put", `/question/${TX.question}/questionidentifier/new-identifier`)).status).toBe(200);
      expect(stored("questions", "questionid", TX.question).questionidentifier).toBe("new-identifier");
    });
    it.each(IN_X)("%s: Y's and an unowned question answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/question/${id}/questionidentifier/new-identifier`), TY.question, TU.question)).toBe(400);
    });
    it.each(IN_X)("%s: the question in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/question/${id}/questionidentifier/new-identifier`), "questionid", TX.question, TY.question)).toBe(404);
    });
    it("a platform user not acting: any question", async () => {
      expect((await send(NOT_ACTING, "put", `/question/${TU.question}/questionidentifier/new-identifier`)).status).toBe(200);
      expect(stored("questions", "questionid", TU.question).questionidentifier).toBe("new-identifier");
    });
  });

  // ───────────────────────────── question tags and document tags ─────────────────────────────
  describe("POST /questiontag/create", () => {
    it.each(IN_X)("%s: creates a tag that is X's", async (who) => {
      expect((await send(who, "post", "/questiontag/create", { questiontagname: "newtag" })).status).toBe(200);
      expect(db.createdIn("questiontags")).toEqual([expect.objectContaining({ organisationid: X, questiontagname: "newtag" })]);
    });
    it.each(IN_X)("%s: the name is unique among X's tags only: Y's name is free", async (who) => {
      expect((await send(who, "post", "/questiontag/create", { questiontagname: "qtagy" })).status).toBe(200);
      expect((await send(who, "post", "/questiontag/create", { questiontagname: "qtagx" })).status).toBe(409);
    });
  });

  describe("DELETE /questiontag/:questiontagid", () => {
    it.each(IN_X)("%s: deletes X's tag", async (who) => {
      expect((await send(who, "delete", `/questiontag/${TX.questionTag}`)).status).toBe(200);
      expect(stored("questiontags", "questiontagid", TX.questionTag).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned tag answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/questiontag/${id}`), TY.questionTag, TU.questionTag)).toBe(400);
    });
    it.each(IN_X)("%s: the tag in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/questiontag/${id}`), "questiontagid", TX.questionTag, TY.questionTag)).toBe(404);
    });
    it("a platform user not acting: any tag", async () => {
      expect((await send(NOT_ACTING, "delete", `/questiontag/${TU.questionTag}`)).status).toBe(200);
      expect(stored("questiontags", "questiontagid", TU.questionTag).isdeleted).toBe(true);
    });
  });

  describe("GET /questiontag/:questiontagid", () => {
    it.each(IN_X)("%s: X's tag", async (who) => {
      const res = await send(who, "get", `/questiontag/${TX.questionTag}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ questiontagid: TX.questionTag, questiontagname: "qtagx" });
    });
    it.each(IN_X)("%s: Y's and an unowned tag answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/questiontag/${id}`), TY.questionTag, TU.questionTag)).toBe(400);
    });
    it.each(IN_X)("%s: the tag in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/questiontag/${id}`), "questiontagid", TX.questionTag, TY.questionTag)).toBe(404);
    });
    it("a platform user not acting: any tag", async () => {
      expect((await send(NOT_ACTING, "get", `/questiontag/${TU.questionTag}`)).body.data.questiontagid).toBe(TU.questionTag);
    });
  });

  describe("PUT /questiontag/:questiontagid", () => {
    const body = { questiontagname: "renamed" };
    it.each(IN_X)("%s: renames X's tag, which keeps its owner", async (who) => {
      expect((await send(who, "put", `/questiontag/${TX.questionTag}`, body)).status).toBe(200);
      expect(stored("questiontags", "questiontagid", TX.questionTag)).toMatchObject({ questiontagname: "renamed", organisationid: X });
    });
    it.each(IN_X)("%s: Y's and an unowned tag answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/questiontag/${id}`, body), TY.questionTag, TU.questionTag)).toBe(400);
    });
    it.each(IN_X)("%s: the tag in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/questiontag/${id}`, body), "questiontagid", TX.questionTag, TY.questionTag)).toBe(404);
    });
    it("a platform user not acting: the name is unique within the row's own organisation, and across everything for an unowned row", async () => {
      const put = (id: string, questiontagname: string) => send(NOT_ACTING, "put", `/questiontag/${id}`, { questiontagname });
      // (a second tag of Y's to collide with)
      db.add("questiontags", { questiontagid: uuid(70001), questiontagname: "ytwo", organisationid: Y });
      expect((await put(TY.questionTag, stored("questiontags", "questiontagid", TX.questionTag).questiontagname as string)).status).toBe(200);
      expect((await put(TY.questionTag, "ytwo")).status).toBe(409);
      expect((await put(TU.questionTag, "ytwo")).status).toBe(409);
    });
    it("a platform user not acting: any tag", async () => {
      expect((await send(NOT_ACTING, "put", `/questiontag/${TU.questionTag}`, body)).status).toBe(200);
      expect(stored("questiontags", "questiontagid", TU.questionTag).questiontagname).toBe("renamed");
    });
  });

  describe("POST /questiontag", () => {
    const list = (who: Who, filter: object[] = []) => send(who, "post", "/questiontag", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: lists X's tags, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "questiontagid")).toEqual([TX.questionTag]);
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      expect(idsOf((await list(who, [{ key: "questiontagname", value: "qtagy" }])).body.data.data, "questiontagid")).toEqual([]);
    });
    it("a platform user not acting: every tag, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "questiontagid")).toEqual(sorted(TX.questionTag, TY.questionTag, TU.questionTag));
    });
  });

  describe("POST /documenttag/create", () => {
    it.each(IN_X)("%s: creates a tag that is X's", async (who) => {
      expect((await send(who, "post", "/documenttag/create", { documenttagname: "newtag" })).status).toBe(200);
      expect(db.createdIn("documenttags")).toEqual([expect.objectContaining({ organisationid: X, documenttagname: "newtag" })]);
    });
    it.each(IN_X)("%s: the name is unique among X's tags only: Y's name is free", async (who) => {
      expect((await send(who, "post", "/documenttag/create", { documenttagname: "dtagy" })).status).toBe(200);
      expect((await send(who, "post", "/documenttag/create", { documenttagname: "dtagx" })).status).toBe(409);
    });
  });

  describe("DELETE /documenttag/:documenttagid", () => {
    it.each(IN_X)("%s: deletes X's tag", async (who) => {
      expect((await send(who, "delete", `/documenttag/${TX.documentTag}`)).status).toBe(200);
      expect(stored("documenttags", "documenttagid", TX.documentTag).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned tag answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/documenttag/${id}`), TY.documentTag, TU.documentTag)).toBe(400);
    });
    it.each(IN_X)("%s: the tag in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/documenttag/${id}`), "documenttagid", TX.documentTag, TY.documentTag)).toBe(404);
    });
    it("a platform user not acting: any tag", async () => {
      expect((await send(NOT_ACTING, "delete", `/documenttag/${TU.documentTag}`)).status).toBe(200);
      expect(stored("documenttags", "documenttagid", TU.documentTag).isdeleted).toBe(true);
    });
  });

  describe("GET /documenttag/:documenttagid", () => {
    it.each(IN_X)("%s: X's tag", async (who) => {
      const res = await send(who, "get", `/documenttag/${TX.documentTag}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ documenttagid: TX.documentTag, documenttagname: "dtagx" });
    });
    it.each(IN_X)("%s: Y's and an unowned tag answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/documenttag/${id}`), TY.documentTag, TU.documentTag)).toBe(400);
    });
    it.each(IN_X)("%s: the tag in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/documenttag/${id}`), "documenttagid", TX.documentTag, TY.documentTag)).toBe(404);
    });
    it("a platform user not acting: any tag", async () => {
      expect((await send(NOT_ACTING, "get", `/documenttag/${TU.documentTag}`)).body.data.documenttagid).toBe(TU.documentTag);
    });
  });

  describe("PUT /documenttag/:documenttagid", () => {
    const body = { documenttagname: "renamed" };
    it.each(IN_X)("%s: renames X's tag, which keeps its owner", async (who) => {
      expect((await send(who, "put", `/documenttag/${TX.documentTag}`, body)).status).toBe(200);
      expect(stored("documenttags", "documenttagid", TX.documentTag)).toMatchObject({ documenttagname: "renamed", organisationid: X });
    });
    it.each(IN_X)("%s: Y's and an unowned tag answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/documenttag/${id}`, body), TY.documentTag, TU.documentTag)).toBe(400);
    });
    it.each(IN_X)("%s: the tag in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/documenttag/${id}`, body), "documenttagid", TX.documentTag, TY.documentTag)).toBe(404);
    });
    it("a platform user not acting: the name is unique within the row's own organisation, and across everything for an unowned row", async () => {
      const put = (id: string, documenttagname: string) => send(NOT_ACTING, "put", `/documenttag/${id}`, { documenttagname });
      // (a second tag of Y's to collide with)
      db.add("documenttags", { documenttagid: uuid(70001), documenttagname: "ytwo", organisationid: Y });
      expect((await put(TY.documentTag, stored("documenttags", "documenttagid", TX.documentTag).documenttagname as string)).status).toBe(200);
      expect((await put(TY.documentTag, "ytwo")).status).toBe(409);
      expect((await put(TU.documentTag, "ytwo")).status).toBe(409);
    });
    it("a platform user not acting: any tag", async () => {
      expect((await send(NOT_ACTING, "put", `/documenttag/${TU.documentTag}`, body)).status).toBe(200);
      expect(stored("documenttags", "documenttagid", TU.documentTag).documenttagname).toBe("renamed");
    });
  });

  describe("POST /documenttag", () => {
    const list = (who: Who, filter: object[] = []) => send(who, "post", "/documenttag", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: lists X's tags, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "documenttagid")).toEqual([TX.documentTag]);
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      expect(idsOf((await list(who, [{ key: "documenttagname", value: "dtagy" }])).body.data.data, "documenttagid")).toEqual([]);
    });
    it("a platform user not acting: every tag, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "documenttagid")).toEqual(sorted(TX.documentTag, TY.documentTag, TU.documentTag));
    });
  });

  // ───────────────────────────── documents ─────────────────────────────
  describe("POST /document/upload", () => {
    const upload = (who: Who, filename: string) =>
      request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).set("Connection", "close").attach("file", Buffer.from("png"), filename);
    it.each(IN_X)("%s: the document is X's", async (who) => {
      expect((await upload(who, "sample_file.png")).status).toBe(200);
      expect(db.createdIn("documents")).toEqual([expect.objectContaining({ organisationid: X, documentname: "sample_file.png" })]);
    });
    it.each(IN_X)("%s: a name another organisation's document holds is refused as any existing name is, as the file store is shared", async (who) => {
      const own = await upload(who, "doc_tagx.png");
      const foreign = await upload(who, "doc_tagy.png");
      const unowned = await upload(who, "doc_tagu.png");
      expect([own.status, foreign.status, unowned.status]).toEqual([409, 409, 409]);
      expect(uploadS3).not.toHaveBeenCalled();
      expect(db.created).toEqual([]);
    });
  });

  describe("DELETE /document/:documentid", () => {
    it.each(IN_X)("%s: deletes X's document", async (who) => {
      expect((await send(who, "delete", `/document/${TX.document}`)).status).toBe(200);
      expect(stored("documents", "documentid", TX.document).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned document answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/document/${id}`), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: the document in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/document/${id}`), "documentid", TX.document, TY.document)).toBe(404);
    });
    it("a platform user not acting: any document", async () => {
      expect((await send(NOT_ACTING, "delete", `/document/${TU.document}`)).status).toBe(200);
      expect(stored("documents", "documentid", TU.document).isdeleted).toBe(true);
    });
  });

  describe("POST /document", () => {
    const list = (who: Who, filter: object[] = []) => send(who, "post", "/document", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: lists X's documents, none of Y's or the unowned", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "documentid")).toEqual(sorted(TX.document, TX.document2));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: a filter finds nothing of another organisation", async (who) => {
      expect(idsOf((await list(who, [{ key: "documentname", value: "doc_tagy.png" }])).body.data.data, "documentid")).toEqual([]);
    });
    it("a platform user not acting: every document, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "documentid")).toEqual(sorted(TX.document, TX.document2, TY.document, TY.document2, TU.document, TU.document2));
    });
  });

  describe("GET /document/tag/:documentid/:tag", () => {
    it.each(IN_X)("%s: adds X's tag to X's document", async (who) => {
      expect((await send(who, "get", `/document/tag/${TX.document}/dtagx`)).status).toBe(200);
      expect(stored("documents", "documentid", TX.document).documenttags).toEqual(["dtagx"]);
    });
    it.each(IN_X)("%s: Y's and an unowned document answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/document/tag/${id}/dtagx`), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: a tag name Y (or nobody) holds is a name like any other for X's document: the answer does not tell who holds it", async (who) => {
      const held = await send(who, "get", `/document/tag/${TX.document}/dtagy`);
      const free = await send(who, "get", `/document/tag/${TX.document}/dtagnew`);
      expect(said(held)).toEqual(said(free));
      expect(free.status).toBe(200);
      expect(stored("documents", "documentid", TX.document).documenttags).toEqual(["dtagy", "dtagnew"]);
    });
    it.each(IN_X)("%s: the document in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/document/tag/${id}/dtagx`), "documentid", TX.document, TY.document)).toBe(404);
    });
    it("a platform user not acting: any document, with a tag of its owner", async () => {
      expect((await send(NOT_ACTING, "get", `/document/tag/${TY.document}/dtagy`)).status).toBe(200);
      expect(stored("documents", "documentid", TY.document).documenttags).toEqual(["dtagy"]);
    });
  });

  describe("DELETE /document/tag/:documentid/:tag", () => {
    it.each(IN_X)("%s: removes a tag from X's document", async (who) => {
      stored("documents", "documentid", TX.document).documenttags = ["dtagx", "other"];
      expect((await send(who, "delete", `/document/tag/${TX.document}/dtagx`)).status).toBe(200);
      expect(stored("documents", "documentid", TX.document).documenttags).toEqual(["other"]);
    });
    it.each(IN_X)("%s: Y's and an unowned document answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/document/tag/${id}/dtagx`), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: the document in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/document/tag/${id}/dtagx`), "documentid", TX.document, TY.document)).toBe(404);
    });
    it("a platform user not acting: any document", async () => {
      stored("documents", "documentid", TU.document).documenttags = ["dtagu"];
      expect((await send(NOT_ACTING, "delete", `/document/tag/${TU.document}/dtagu`)).status).toBe(200);
      expect(stored("documents", "documentid", TU.document).documenttags).toEqual([]);
    });
  });

  describe("GET /document/presign/:filename", () => {
    it.each(IN_X)("%s: the route's own request rules refuse it (they ask for a document and a tag in the path), so no signed address is handed out", async (who) => {
      const res = await send(who, "get", "/document/presign/some_file.png");
      expect(res.status).toBe(400);
    });
    it("a platform user not acting is refused the same way", async () => {
      expect((await send(NOT_ACTING, "get", "/document/presign/some_file.png")).status).toBe(400);
    });
  });

  // ───────────────────────────── baselines ─────────────────────────────
  describe("POST /curriculumbaseline/create", () => {
    const body = (curriculumid: string, schoolid: string[] = [], over: object = {}) => ({
      baselineid: curriculumid, curriculumid, baselinename: "Endline ថ្មី", baselinetype: 3, startdate: "2026-01-01", enddate: "2026-12-31", schoolid, ...over,
    });
    it.each(IN_X)("%s: creates a baseline for X's curriculum and X's school", async (who) => {
      expect((await send(who, "post", "/curriculumbaseline/create", body(TX.curriculum, [TX.school]))).status).toBe(200);
      expect(db.createdIn("curriculumbaseline")).toEqual([expect.objectContaining({ curriculumid: TX.curriculum, schoolid: [TX.school] })]);
    });
    it.each(IN_X)("%s: for Y's or an unowned curriculum it answers as an absent curriculum does, nothing written", async (who) => {
      // (of a type that Y's curriculum already has a baseline of this year: the year rule is not a way to tell it is there)
      expect(await asAbsent(who, "post", (id) => r("/curriculumbaseline/create", body(id, [], { baselinetype: 1 })), TY.curriculum, TU.curriculum)).toBe(400);
    });
    it.each(IN_X)("%s: a school of Y or an unowned one is the 404 an absent school gets, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r("/curriculumbaseline/create", body(TX.curriculum, [id])), TY.school, TU.school)).toBe(404);
    });
    it.each(IN_X)("%s: the name is unique among X's baselines only", async (who) => {
      // (a curriculum may have one baseline of each type a year: none of X's is from this year)
      for (const id of [TX.baseline, TX.baseline2]) stored("curriculumbaseline", "curriculumbaselineid", id).created_at = new Date("2020-01-01");
      const free = await send(who, "post", "/curriculumbaseline/create", body(TX.curriculum, [], { baselinename: stored("curriculumbaseline", "curriculumbaselineid", TY.baseline).baselinename, baselinetype: 1 }));
      expect(free.status).toBe(200);
      const taken = await send(who, "post", "/curriculumbaseline/create", body(TX.curriculum, [], { baselinename: stored("curriculumbaseline", "curriculumbaselineid", TX.baseline).baselinename, baselinetype: 1 }));
      expect(taken.status).toBe(409);
    });
    it("a platform user not acting: for any curriculum, with a school of its owner", async () => {
      expect((await send(NOT_ACTING, "post", "/curriculumbaseline/create", body(TU.curriculum, [TU.school]))).status).toBe(200);
      expect((await send(NOT_ACTING, "post", "/curriculumbaseline/create", body(TY.curriculum, [TX.school], { baselinename: "Another name" }))).status).toBe(400);
    });
  });

  describe("DELETE /curriculumbaseline/:curriculumbaselineid", () => {
    it.each(IN_X)("%s: deletes X's baseline and its questions", async (who) => {
      expect((await send(who, "delete", `/curriculumbaseline/${TX.baseline}`)).status).toBe(200);
      expect(stored("curriculumbaseline", "curriculumbaselineid", TX.baseline).isdeleted).toBe(true);
      expect(stored("baselinequestion", "baselinequestionid", TX.baselineQuestion).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned baseline answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/curriculumbaseline/${id}`), TY.baseline, TU.baseline)).toBe(400);
    });
    it.each(IN_X)("%s: the baseline in the path is the one checked, and its questions are not touched", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/curriculumbaseline/${id}`), "curriculumbaselineid", TX.baseline, TY.baseline)).toBe(404);
    });
    it("a platform user not acting: any baseline", async () => {
      expect((await send(NOT_ACTING, "delete", `/curriculumbaseline/${TU.baseline}`)).status).toBe(200);
      expect(stored("baselinequestion", "baselinequestionid", TU.baselineQuestion).isdeleted).toBe(true);
    });
  });

  describe("PUT /curriculumbaseline/update/:curriculumbaselineid", () => {
    const body = (curriculumid: string, schoolid: string[] = []) => ({
      baselineid: curriculumid, curriculumid, baselinename: "ឈ្មោះថ្មី", baselinetype: 2, startdate: "2026-01-01", enddate: "2026-12-31", schoolid,
    });
    it.each(IN_X)("%s: updates X's baseline, onto X's other curriculum and X's school", async (who) => {
      expect((await send(who, "put", `/curriculumbaseline/update/${TX.baseline}`, body(TX.curriculum2, [TX.school]))).status).toBe(200);
      expect(stored("curriculumbaseline", "curriculumbaselineid", TX.baseline)).toMatchObject({ baselinename: "ឈ្មោះថ្មី", curriculumid: TX.curriculum2, schoolid: [TX.school] });
    });
    it.each(IN_X)("%s: Y's and an unowned baseline answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculumbaseline/update/${id}`, body(TX.curriculum)), TY.baseline, TU.baseline)).toBe(400);
    });
    it.each(IN_X)("%s: onto Y's or an unowned curriculum is the 404 an absent curriculum gets, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculumbaseline/update/${TX.baseline}`, body(id)), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: with a school of Y or an unowned one is the 404 an absent school gets, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculumbaseline/update/${TX.baseline}`, body(TX.curriculum, [id])), TY.school, TU.school)).toBe(404);
    });
    it.each(IN_X)("%s: the baseline in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/curriculumbaseline/update/${id}`, body(TX.curriculum)), "curriculumbaselineid", TX.baseline, TY.baseline)).toBe(404);
    });
    it("a platform user not acting: the name (of a type) is unique within the baseline's own organisation, and across everything for an unowned one", async () => {
      // (a baseline of a type is one a year a curriculum: the existing ones are from earlier years)
      for (const t of [TX, TY, TU]) for (const id of [t.baseline, t.baseline2]) stored("curriculumbaseline", "curriculumbaselineid", id).created_at = new Date("2020-01-01");
      const put = (t: Tree, id: string, name: string) => send(NOT_ACTING, "put", `/curriculumbaseline/update/${id}`, { ...body(t.curriculum, [t.school]), baselinename: name, baselinetype: 1 });
      const nameOf = (id: string) => stored("curriculumbaseline", "curriculumbaselineid", id).baselinename as string;
      expect((await put(TY, TY.baseline2, nameOf(TX.baseline))).status).toBe(200);
      expect((await put(TY, TY.baseline2, nameOf(TY.baseline))).status).toBe(409);
      expect((await put(TU, TU.baseline2, nameOf(TX.baseline))).status).toBe(409);
    });
    it("a platform user not acting: any baseline, onto a curriculum of its owner", async () => {
      expect((await send(NOT_ACTING, "put", `/curriculumbaseline/update/${TY.baseline}`, body(TY.curriculum2, [TY.school]))).status).toBe(200);
      expect(stored("curriculumbaseline", "curriculumbaselineid", TY.baseline).curriculumid).toBe(TY.curriculum2);
    });
  });

  describe("PUT /curriculumbaseline/activate/:curriculumbaselineid/:curriculumid", () => {
    it.each(IN_X)("%s: activates X's baseline for X's curriculum, and deactivates the curriculum's other active baseline", async (who) => {
      stored("curriculumbaseline", "curriculumbaselineid", TX.baseline).baselinestatus = false;
      stored("curriculumbaseline", "curriculumbaselineid", TX.baseline2).baselinestatus = true;
      expect((await send(who, "put", `/curriculumbaseline/activate/${TX.baseline}/${TX.curriculum}`)).status).toBe(200);
      expect(stored("curriculumbaseline", "curriculumbaselineid", TX.baseline).baselinestatus).toBe(true);
      expect(stored("curriculumbaseline", "curriculumbaselineid", TX.baseline2).baselinestatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned baseline answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculumbaseline/activate/${id}/${TX.curriculum}`), TY.baseline, TU.baseline)).toBe(400);
    });
    it.each(IN_X)("%s: Y's or an unowned curriculum is the 404 an absent curriculum gets, and the other baselines of Y are not deactivated", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculumbaseline/activate/${TX.baseline}/${id}`), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: the baseline in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/curriculumbaseline/activate/${id}/${TX.curriculum}`), "curriculumbaselineid", TX.baseline, TY.baseline)).toBe(404);
    });
    it("a platform user not acting: any baseline", async () => {
      stored("curriculumbaseline", "curriculumbaselineid", TY.baseline).baselinestatus = false;
      expect((await send(NOT_ACTING, "put", `/curriculumbaseline/activate/${TY.baseline}/${TY.curriculum}`)).status).toBe(200);
      expect(stored("curriculumbaseline", "curriculumbaselineid", TY.baseline).baselinestatus).toBe(true);
    });
  });

  describe("PUT /curriculumbaseline/deactivate/:curriculumbaselineid", () => {
    it.each(IN_X)("%s: deactivates X's baseline", async (who) => {
      expect((await send(who, "put", `/curriculumbaseline/deactivate/${TX.baseline}`)).status).toBe(200);
      expect(stored("curriculumbaseline", "curriculumbaselineid", TX.baseline).baselinestatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned baseline answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/curriculumbaseline/deactivate/${id}`), TY.baseline, TU.baseline)).toBe(400);
    });
    it.each(IN_X)("%s: the baseline in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/curriculumbaseline/deactivate/${id}`), "curriculumbaselineid", TX.baseline, TY.baseline)).toBe(404);
    });
    it("a platform user not acting: any baseline", async () => {
      expect((await send(NOT_ACTING, "put", `/curriculumbaseline/deactivate/${TU.baseline}`)).status).toBe(200);
      expect(stored("curriculumbaseline", "curriculumbaselineid", TU.baseline).baselinestatus).toBe(false);
    });
  });

  describe("GET /curriculumbaseline/all", () => {
    it.each(IN_X)("%s: X's baselines, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/curriculumbaseline/all");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "curriculumbaselineid")).toEqual(sorted(TX.baseline, TX.baseline2));
    });
    it("a platform user not acting: every baseline, owned or not", async () => {
      const res = await send(NOT_ACTING, "get", "/curriculumbaseline/all");
      expect(idsOf(res.body.data, "curriculumbaselineid")).toEqual(sorted(TX.baseline, TX.baseline2, TY.baseline, TY.baseline2, TU.baseline, TU.baseline2));
    });
  });

  describe("GET /curriculumbaseline/query", () => {
    it.each(IN_X)("%s: finds X's baselines, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/curriculumbaseline/query?baselinename=line");
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "curriculumbaselineid")).toEqual(sorted(TX.baseline, TX.baseline2));
    });
    it.each(IN_X)("%s: a name another organisation's baseline has finds nothing", async (who) => {
      expect((await send(who, "get", "/curriculumbaseline/query?baselinename=tagy")).body.data).toEqual([]);
    });
    it("a platform user not acting: every baseline that matches, owned or not", async () => {
      const res = await send(NOT_ACTING, "get", "/curriculumbaseline/query?baselinename=line");
      expect(idsOf(res.body.data, "curriculumbaselineid")).toEqual(sorted(TX.baseline, TX.baseline2, TY.baseline, TY.baseline2, TU.baseline, TU.baseline2));
    });
  });

  describe("GET /curriculumbaseline/getcurriculumbaseline/:curriculumbaselineid", () => {
    it.each(IN_X)("%s: X's baseline", async (who) => {
      const res = await send(who, "get", `/curriculumbaseline/getcurriculumbaseline/${TX.baseline}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ curriculumbaselineid: TX.baseline, curriculumid: TX.curriculum });
    });
    it.each(IN_X)("%s: Y's and an unowned baseline answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/curriculumbaseline/getcurriculumbaseline/${id}`), TY.baseline, TU.baseline)).toBe(404);
    });
    it("a platform user not acting: any baseline", async () => {
      expect((await send(NOT_ACTING, "get", `/curriculumbaseline/getcurriculumbaseline/${TU.baseline}`)).body.data.curriculumbaselineid).toBe(TU.baseline);
    });
  });

  describe("GET /curriculumbaseline/school/:curriculumbaselineid", () => {
    it.each(IN_X)("%s: the schools of X's baseline", async (who) => {
      const res = await send(who, "get", `/curriculumbaseline/school/${TX.baseline}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([TX.school]);
    });
    it.each(IN_X)("%s: a school of another organisation that a baseline of X names is not listed", async (who) => {
      stored("curriculumbaseline", "curriculumbaselineid", TX.baseline).schoolid = [TX.school, TY.school, TU.school];
      expect(idsOf((await send(who, "get", `/curriculumbaseline/school/${TX.baseline}`)).body.data, "schoolid")).toEqual([TX.school]);
    });
    it.each(IN_X)("%s: Y's and an unowned baseline answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/curriculumbaseline/school/${id}`), TY.baseline, TU.baseline)).toBe(404);
    });
    it("a platform user not acting: any baseline's schools", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/curriculumbaseline/school/${TY.baseline}`)).body.data, "schoolid")).toEqual([TY.school]);
    });
  });

  describe("GET /curriculumbaseline/:curriculumbaselineid/download", () => {
    let results: jest.SpyInstance;
    beforeEach(() => {
      results = jest.spyOn(CurriculumBaseLineBusiness.prototype, "getStudentBaselineEndlineResults").mockResolvedValue([]);
    });
    it.each(IN_X)("%s: X's baseline's results", async (who) => {
      expect((await send(who, "get", `/curriculumbaseline/${TX.baseline}/download`)).status).toBe(200);
      expect(results).toHaveBeenCalledWith(TX.baseline);
    });
    it.each(IN_X)("%s: Y's and an unowned baseline answer as an absent one does (404): its results are never read", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/curriculumbaseline/${id}/download`), TY.baseline, TU.baseline)).toBe(404);
      expect(results).not.toHaveBeenCalled();
    });
    it("a platform user not acting: any baseline's results", async () => {
      expect((await send(NOT_ACTING, "get", `/curriculumbaseline/${TU.baseline}/download`)).status).toBe(200);
      expect(results).toHaveBeenCalledWith(TU.baseline);
    });
  });

  // ───────────────────────────── baseline questions ─────────────────────────────
  describe("POST /baselinequestion/create", () => {
    const body = (curriculumbaselineid: string, questionid: string) => ({ curriculumbaselineid, questionid, baselinequestionorder: 2 });
    it.each(IN_X)("%s: adds X's question to X's baseline", async (who) => {
      expect((await send(who, "post", "/baselinequestion/create", body(TX.baseline, TX.question2))).status).toBe(200);
      expect(db.createdIn("baselinequestion")).toEqual([expect.objectContaining({ curriculumbaselineid: TX.baseline, questionid: TX.question2 })]);
    });
    it.each(IN_X)("%s: Y's or an unowned baseline answers as an absent baseline does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r("/baselinequestion/create", body(id, TX.question2)), TY.baseline, TU.baseline)).toBe(400);
    });
    it.each(IN_X)("%s: Y's or an unowned question answers as an absent question does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r("/baselinequestion/create", body(TX.baseline, id)), TY.question, TU.question)).toBe(400);
    });
    it("a platform user not acting: to any baseline, with a question of the same owner", async () => {
      expect((await send(NOT_ACTING, "post", "/baselinequestion/create", body(TY.baseline, TY.question2))).status).toBe(200);
      expect((await send(NOT_ACTING, "post", "/baselinequestion/create", body(TY.baseline, TX.question2))).status).toBe(400);
    });
  });

  describe("POST /baselinequestion/clone", () => {
    const body = (source: string, target: string) => ({ curriculumbaselineid: source, clonecurriculumbaselineid: target });
    it.each(IN_X)("%s: copies the questions of X's baseline onto X's empty baseline", async (who) => {
      expect((await send(who, "post", "/baselinequestion/clone", body(TX.baseline, TX.baseline2))).status).toBe(200);
      expect(db.createdIn("baselinequestion")).toEqual([expect.objectContaining({ curriculumbaselineid: TX.baseline2, questionid: TX.question })]);
    });
    it.each(IN_X)("%s: from Y's or an unowned baseline answers as an absent source does, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r("/baselinequestion/clone", body(id, TX.baseline2)), TY.baseline, TU.baseline)).toBe(400);
    });
    it.each(IN_X)("%s: onto Y's or an unowned baseline answers as an absent target does (404), nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r("/baselinequestion/clone", body(TX.baseline, id)), TY.baseline2, TU.baseline2)).toBe(404);
      // (one that already has questions too: "already has a question" is not a way to tell the baseline is there)
      expect(await asAbsent(who, "post", (id) => r("/baselinequestion/clone", body(TX.baseline, id)), TY.baseline, TU.baseline)).toBe(404);
    });
    it("a platform user not acting: between any two baselines of one owner", async () => {
      expect((await send(NOT_ACTING, "post", "/baselinequestion/clone", body(TX.baseline, TY.baseline2))).status).toBe(400);
      expect((await send(NOT_ACTING, "post", "/baselinequestion/clone", body(TY.baseline, TY.baseline2))).status).toBe(200);
    });
  });

  describe("PUT /baselinequestion/activate/:baselinequestionid", () => {
    it.each(IN_X)("%s: activates X's row", async (who) => {
      stored("baselinequestion", "baselinequestionid", TX.baselineQuestion).baselinequestionstatus = false;
      expect((await send(who, "put", `/baselinequestion/activate/${TX.baselineQuestion}`)).status).toBe(200);
      expect(stored("baselinequestion", "baselinequestionid", TX.baselineQuestion).baselinequestionstatus).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/baselinequestion/activate/${id}`), TY.baselineQuestion, TU.baselineQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/baselinequestion/activate/${id}`), "baselinequestionid", TX.baselineQuestion, TY.baselineQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      stored("baselinequestion", "baselinequestionid", TY.baselineQuestion).baselinequestionstatus = false;
      expect((await send(NOT_ACTING, "put", `/baselinequestion/activate/${TY.baselineQuestion}`)).status).toBe(200);
      expect(stored("baselinequestion", "baselinequestionid", TY.baselineQuestion).baselinequestionstatus).toBe(true);
    });
  });

  describe("PUT /baselinequestion/deactivate/:baselinequestionid", () => {
    it.each(IN_X)("%s: deactivates X's row", async (who) => {
      expect((await send(who, "put", `/baselinequestion/deactivate/${TX.baselineQuestion}`)).status).toBe(200);
      expect(stored("baselinequestion", "baselinequestionid", TX.baselineQuestion).baselinequestionstatus).toBe(false);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/baselinequestion/deactivate/${id}`), TY.baselineQuestion, TU.baselineQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/baselinequestion/deactivate/${id}`), "baselinequestionid", TX.baselineQuestion, TY.baselineQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/baselinequestion/deactivate/${TU.baselineQuestion}`)).status).toBe(200);
      expect(stored("baselinequestion", "baselinequestionid", TU.baselineQuestion).baselinequestionstatus).toBe(false);
    });
  });

  describe("PUT /baselinequestion/order/:baselinequestionid/:baselinequestionorder", () => {
    it.each(IN_X)("%s: reorders X's row", async (who) => {
      expect((await send(who, "put", `/baselinequestion/order/${TX.baselineQuestion}/5`)).status).toBe(200);
      expect(String(stored("baselinequestion", "baselinequestionid", TX.baselineQuestion).baselinequestionorder)).toBe("5");
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/baselinequestion/order/${id}/5`), TY.baselineQuestion, TU.baselineQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/baselinequestion/order/${id}/5`), "baselinequestionid", TX.baselineQuestion, TY.baselineQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "put", `/baselinequestion/order/${TY.baselineQuestion}/5`)).status).toBe(200);
      expect(String(stored("baselinequestion", "baselinequestionid", TY.baselineQuestion).baselinequestionorder)).toBe("5");
    });
  });

  describe("DELETE /baselinequestion/:baselinequestionid", () => {
    it.each(IN_X)("%s: deletes X's row", async (who) => {
      expect((await send(who, "delete", `/baselinequestion/${TX.baselineQuestion}`)).status).toBe(200);
      expect(stored("baselinequestion", "baselinequestionid", TX.baselineQuestion).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's and an unowned row answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "delete", (id) => r(`/baselinequestion/${id}`), TY.baselineQuestion, TU.baselineQuestion)).toBe(400);
    });
    it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "delete", (id) => r(`/baselinequestion/${id}`), "baselinequestionid", TX.baselineQuestion, TY.baselineQuestion)).toBe(404);
    });
    it("a platform user not acting: any row", async () => {
      expect((await send(NOT_ACTING, "delete", `/baselinequestion/${TU.baselineQuestion}`)).status).toBe(200);
      expect(stored("baselinequestion", "baselinequestionid", TU.baselineQuestion).isdeleted).toBe(true);
    });
  });

  describe("GET /baselinequestion/getall/:curriculumbaselineid", () => {
    it.each(IN_X)("%s: the questions of X's baseline", async (who) => {
      const res = await send(who, "get", `/baselinequestion/getall/${TX.baseline}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data, "baselinequestionid")).toEqual([TX.baselineQuestion]);
    });
    it.each(IN_X)("%s: Y's and an unowned baseline answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/baselinequestion/getall/${id}`), TY.baseline, TU.baseline)).toBe(404);
    });
    it("a platform user not acting: any baseline's questions", async () => {
      expect(idsOf((await send(NOT_ACTING, "get", `/baselinequestion/getall/${TU.baseline}`)).body.data, "baselinequestionid")).toEqual([TU.baselineQuestion]);
    });
  });

  // ───────────────────────────── feedback ─────────────────────────────
  describe("POST /feedback/create", () => {
    const item = { feedback: "ល្អណាស់", selected_error: [], images: [] };
    const body = (curriculumid: string) => ({ teachername: "គ្រូ", curriculumid, rpi: item, router: item, tablet: item, content: item, app: item, general: item });
    it.each(IN_X)("%s: records feedback about X's curriculum", async (who) => {
      expect((await send(who, "post", "/feedback/create", body(TX.curriculum))).status).toBe(200);
      expect(db.createdIn("feedbacks")).toEqual([expect.objectContaining({ curriculumid: TX.curriculum, teachername: "គ្រូ" })]);
    });
    it.each(IN_X)("%s: about Y's or an unowned curriculum it is the 404 an absent curriculum gets, nothing written", async (who) => {
      expect(await asAbsent(who, "post", (id) => r("/feedback/create", body(id)), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each([[undefined], [null], [""], [{ curriculumid: "x" }], [7]])("a curriculum id that is not a string (%j) is the 404 an absent one gets, for the platform as for X, and nothing is written", async (bad) => {
      for (const who of [NOT_ACTING, "X's Admin" as Who]) {
        const absent = said(await refuses(who, "post", "/feedback/create", body(MISSING)));
        expect(absent.status).toBe(404);
                (curriculums.findOne as unknown as jest.Mock).mockClear();
        const res = await refuses(who, "post", "/feedback/create", { ...body(TX.curriculum), curriculumid: bad });
        expect(said(res)).toEqual(absent);
        // (no id that is not a string reaches a query: with a real table an undefined key is an error, not a miss)
        expect(curriculums.findOne).not.toHaveBeenCalled();
      }
    });
    it("a platform user not acting: about any curriculum", async () => {
      expect((await send(NOT_ACTING, "post", "/feedback/create", body(TU.curriculum))).status).toBe(200);
      expect(db.createdIn("feedbacks")[0].curriculumid).toBe(TU.curriculum);
    });
  });

  describe("POST /feedback", () => {
        const list = (who: Who, filter: object[] = []) => send(who, "post", "/feedback", { pageindex: 1, pagesize: 50, filter });
    it.each(IN_X)("%s: the feedback about X's curriculums, none about Y's or an unowned one", async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.data.data, "feedbackid")).toEqual([TX.feedback]);
    });
            it.each(IN_X)("%s: a filter by X's school is accepted; by another organisation's school, id or name, it is the answer for a school that is not there", async (who) => {
      // (the rows a filter keeps are chosen by a joined column the fake does not select, so only the answers are compared)
      expect((await list(who, [{ key: "schoolid", value: TX.school }])).status).toBe(200);
      expect((await list(who, [{ key: "schoolname", value: "សាលា tagx" }])).status).toBe(200);
      const absentId = await list(who, [{ key: "schoolid", value: MISSING }]);
      const absentName = await list(who, [{ key: "schoolname", value: "សាលាដែលមិនមាន" }]);
      expect(absentId.status).toBe(404);
      expect(absentName.status).toBe(404);
      for (const other of [TY.school, TU.school]) {
        expect(said(await list(who, [{ key: "schoolid", value: other }]))).toEqual(said(absentId));
      }
      for (const other of [TY, TU]) {
        expect(said(await list(who, [{ key: "schoolname", value: `សាលា ${other.tag}` }]))).toEqual(said(absentName));
      }
    });
    it("a platform user not acting: a filter by any organisation's school is accepted", async () => {
      expect((await list(NOT_ACTING, [{ key: "schoolid", value: TY.school }])).status).toBe(200);
      expect((await list(NOT_ACTING, [{ key: "schoolname", value: "សាលា tagu" }])).status).toBe(200);
    });
    it("a platform user not acting: every feedback, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "feedbackid")).toEqual(sorted(TX.feedback, TY.feedback, TU.feedback));
    });
  });

  describe("GET /feedback/:feedbackid", () => {
    it.each(IN_X)("%s: X's feedback", async (who) => {
      const res = await send(who, "get", `/feedback/${TX.feedback}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ feedbackid: TX.feedback, teachername: "គ្រូ tagx" });
    });
    it.each(IN_X)("%s: Y's and an unowned feedback answer as an absent one does (404)", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/feedback/${id}`), TY.feedback, TU.feedback)).toBe(404);
    });
    it.each(IN_X)("%s: the feedback in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(`/feedback/${id}`), "feedbackid", TX.feedback, TY.feedback)).toBe(404);
    });
    it("a platform user not acting: any feedback", async () => {
      expect((await send(NOT_ACTING, "get", `/feedback/${TU.feedback}`)).body.data.feedbackid).toBe(TU.feedback);
    });
  });

  // ───────────────────────────── export ─────────────────────────────
  describe("GET /export/documents/:curriculumid", () => {
    let assembled: jest.SpyInstance;
    beforeEach(() => {
      assembled = jest.spyOn(CurriculumBusiness.prototype, "getDocuments").mockImplementation((async (id: string) => [`${id}.png`]) as never);
    });
    it.each(IN_X)("%s: the files of X's curriculum", async (who) => {
      const res = await send(who, "get", `/export/documents/${TX.curriculum}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([`${TX.curriculum}.png`]);
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum answer as an absent one does (404): nothing is assembled from them", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(`/export/documents/${id}`), TY.curriculum, TU.curriculum)).toBe(404);
      expect(assembled).not.toHaveBeenCalled();
    });
    it("a platform user not acting: any curriculum's files", async () => {
      const res = await send(NOT_ACTING, "get", `/export/documents/${TU.curriculum}`);
      expect(res.body).toEqual([`${TU.curriculum}.png`]);
    });
  });

  // ───────────────────────────── the other tokens ─────────────────────────────
  describe("the application's server token", () => {
    it.each([
      ["get", "/curriculum/all"],
      ["get", `/curriculum/country/${COUNTRY}`],
      ["get", `/grade/curriculum/${TY.curriculum}`],
    ] as const)("a server token still reads every organisation's rows: %s %s answers 200 with Y's rows in it", async (method, path) => {
      const res = await send("a server token", method, path);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toMatch(new RegExp(`${TY.curriculum}|${TY.grade}`));
    });
    it.each([
      ["get", "/curriculum/map"],
      ["get", "/curriculum/tree"],
      ["get", `/curriculum/${TX.curriculum}`],
      ["post", "/curriculum"],
      ["get", "/grade/all"],
      ["get", `/grade/${TX.grade}`],
      ["get", "/level/all"],
      ["get", "/lesson/all"],
      ["get", `/lesson/practice/${TX.lesson}`],
      ["post", "/question"],
      ["post", "/document"],
      ["post", "/subject"],
      ["post", "/questiontag"],
      ["post", "/documenttag"],
      ["get", "/curriculumbaseline/all"],
      ["get", `/baselinequestion/getall/${TX.baseline}`],
      ["post", "/feedback"],
      ["get", `/export/documents/${TX.curriculum}`],
    ] as const)("a server token is still refused (401) where the route does not admit it: %s %s", async (method, path) => {
      const before = db.snapshot();
      const res = await send("a server token", method, path, method === "post" ? {} : undefined);
      expect(res.status).toBe(401);
      expect(db.snapshot()).toEqual(before);
    });
  });

  describe("a school-user (teacher) token", () => {
    it.each([
      ["get", "/grade/all"],
      ["get", "/level/all"],
      ["get", "/lesson/all"],
    ] as const)("still reads every organisation's rows where the route admits it: %s %s", async (method, path) => {
      const res = await send("a school-user token", method, path);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(6);
    });
    it.each([
      ["get", "/curriculum/all"],
      ["get", `/curriculum/country/${COUNTRY}`],
      ["get", `/grade/curriculum/${TX.curriculum}`],
      ["get", "/curriculum/map"],
      ["get", `/grade/${TX.grade}`],
      ["post", "/question"],
      ["post", "/document"],
      ["get", "/curriculumbaseline/all"],
      ["get", `/export/documents/${TX.curriculum}`],
    ] as const)("is still refused (403) where the route does not admit it: %s %s", async (method, path) => {
      const before = db.snapshot();
      const res = await send("a school-user token", method, path, method === "post" ? {} : undefined);
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
    });
  });

  describe("a name in the shared file store", () => {
    it("is held by another when a live document of another organisation, or of none, has it; never for the platform, and never for a name that is free", async () => {
      const { DocumentBusiness } = await import("src/business/document.business");
      const asX = { organisationid: X, isplatform: false } as const;
      const asPlatform = { organisationid: null, isplatform: true } as const;
      const held = (org: typeof asX | typeof asPlatform | undefined, name: string) => new DocumentBusiness(org).isNameHeldByAnother(name);
      expect([await held(asX, "doc_tagy.png"), await held(asX, "doc_tagu.png"), await held(asX, "doc_tagx.png"), await held(asX, "free_name.png")]).toEqual([true, true, false, false]);
      expect([await held(asPlatform, "doc_tagy.png"), await held(undefined, "doc_tagy.png")]).toEqual([false, false]);
    });
  });
});
