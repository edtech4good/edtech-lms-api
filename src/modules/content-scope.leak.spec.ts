import AdmZip from "adm-zip";
import { createHash } from "crypto";
import {
  csvBytes, gifBytes, jpgBytes, mp3Bytes, mp4Bytes, odfBytes, ooxmlBytes, pdfBytes, pngBytes,
} from "src/test-support/synthetic-media";
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
import { DocumentController } from "./document/document.controller";
import { DOCUMENT_UPLOAD_ROUTE } from "src/constants/upload-limits";
import { DocumentTagModule } from "./documenttag/documenttag.module";
import { ExportModule } from "./export/export.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { GradeModule } from "./grade/grade.module";
import { LessonModule } from "./lesson/lesson.module";
import { LevelModule } from "./level/level.module";
import { QuestionModule } from "./question/question.module";
import { QuestionTagModule } from "./questiontag/questiontag.module";
import { SubjectModule } from "./subject/subject.module";
import { TranslationsModule } from "./translations/translations.module";

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
// publish_curriculum is granted to the Organisation Admin role by 20261027120100-seed-publish-curriculum-permission (the frozen list of 2 Oct predates it)
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002, "publish_curriculum", "view_download_student", "view_feedback", "create_feedback"];
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
  db.add("documents", { documentid: t.document, documentname: `doc_${t.tag}.png`, documenttypeid: 2, organisationid: o, documenttags: [], lastupdated: new Date("2026-01-01") });
  db.add("documents", { documentid: t.document2, documentname: `doc2_${t.tag}.png`, documenttypeid: 2, organisationid: o, documenttags: [], lastupdated: new Date("2026-01-02") });
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
        LevelModule, LessonModule, ExportModule, CurriculumBaseLineModule, FeedbackModule, BaselinequestionModule, TranslationsModule,
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
      expect(res.body.data).toMatchObject({ curriculumid: TX.curriculum, curriculumname: "ភាសាខ្មែរក", organisationid: X });
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
    it("a platform user not acting: the curriculum names its owner (none for an unowned one)", async () => {
      expect((await send(NOT_ACTING, "get", `/curriculum/${TY.curriculum}`)).body.data.organisationid).toBe(Y);
      expect((await send(NOT_ACTING, "get", `/curriculum/${TU.curriculum}`)).body.data.organisationid).toBeNull();
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

  // Publishing a curriculum stores its own payload (its rows, and the questions and documents they name) as a publication.
  describe("PUT /curriculum/publish/:curriculumid", () => {
    const url = (id: string) => `/curriculum/publish/${id}`;
    const USER_OF: Record<string, string> = { "X's Organisation Admin": "oa", "X's Admin": "ad", "a platform user acting as X": "p" };
    const payloadOfRow = (row: Row) => row.payload as { tables: Record<string, Row[]> };
    it.each(IN_X)("%s: publishes X's curriculum: only its own rows and the bank rows it names are stored, and the answer names what is new", async (who) => {
      const res = await send(who, "put", url(TX.curriculum));
      expect(res.status).toBe(200);
      const rows = db.createdIn("curriculumpublications");
      expect(rows).toHaveLength(1);
      expect(withoutReference(res.body)).toEqual({
        error: false,
        data: { publicationid: rows[0].publicationid, publishedat: expect.any(String), summary: expect.objectContaining({ previous: null }) },
      });
      expect(rows[0]).toMatchObject({ curriculumid: TX.curriculum, organisationid: X, publishedby: USER_OF[who], status: "published" });
      const tables = payloadOfRow(rows[0]).tables;
      expect(idsOf(tables.curriculums, "curriculumid")).toEqual([TX.curriculum]);
      expect(idsOf(tables.grades, "gradeid")).toEqual(sorted(TX.grade, TX.grade2));
      expect(idsOf(tables.lessons, "lessonid")).toEqual(sorted(TX.lesson, TX.lesson2));
      // the closure: the question and the document the curriculum names, and not the one it does not
      expect(idsOf(tables.questions, "questionid")).toEqual([TX.question]);
      expect(idsOf(tables.documents, "documentid")).toEqual([TX.document]);
      // nothing of Y's, of the unowned tree, or of X's other curriculum
      const stored = JSON.stringify(rows[0]);
      for (const other of [TY, TU]) {
        for (const value of Object.values(other)) if (typeof value === "string" && value.startsWith("00000000")) expect(stored).not.toContain(value);
      }
      expect(stored).not.toContain(TX.curriculum2);
      expect(res.body.data.summary.changes.lessons).toEqual({ added: 2, removed: 0, changed: 0 });
    });
    it.each(IN_X)("%s: a second publish with nothing changed records another publication, with 0, 0, 0", async (who) => {
      await send(who, "put", url(TX.curriculum));
      const res = await send(who, "put", url(TX.curriculum));
      expect(res.status).toBe(200);
      expect(db.createdIn("curriculumpublications")).toHaveLength(2);
      for (const change of Object.values(res.body.data.summary.changes)) expect(change).toEqual({ added: 0, removed: 0, changed: 0 });
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(id)), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(url(id)), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: a question of Y's named by X's curriculum stops the publish (400, tables and counts only), nothing written", async (who) => {
      stored("lessonquizquestions", "lessonquizquestionid", TX.quizQuestion).questionid = TY.question;
      const res = await refuses(who, "put", url(TX.curriculum));
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe("This curriculum can't be published yet. lessonquizquestions: 1 row names a question that is not this organisation's.");
      expect(JSON.stringify(res.body)).not.toContain(TY.question);
    });
    it("a platform user not acting must choose an organisation first (400), nothing written", async () => {
      const res = await refuses(NOT_ACTING, "put", url(TX.curriculum));
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe("Choose an organisation to act in before you publish a curriculum. Use the organisation switcher, then try again.");
    });
    it("a staff user who may view but not publish is refused (403), nothing written", async () => {
      const viewer = bearer({ lmsuserid: "vw", lmsuserroles: [Role.admin], permissions: ["view_curriculum", "update_curriculum"], organisationid: X, isplatform: false });
      const before = db.snapshot();
      const res = await request(app.getHttpServer()).put(url(TX.curriculum)).set("Authorization", viewer).set("Connection", "close");
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
    });
    it("a school-user token and the server token are refused, nothing written", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        const res = await refuses(who, "put", url(TX.curriculum));
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  // Retiring withdraws the curriculum's publication; it is idempotent.
  describe("PUT /curriculum/retire/:curriculumid", () => {
    const url = (id: string) => `/curriculum/retire/${id}`;
    it.each(IN_X)("%s: withdraws X's published curriculum; a second call changes nothing and says so", async (who) => {
      await send(who, "put", `/curriculum/publish/${TX.curriculum}`);
      const first = await send(who, "put", url(TX.curriculum));
      expect(first.status).toBe(200);
      expect(withoutReference(first.body)).toEqual({
        error: false,
        data: { curriculumid: TX.curriculum, retired: true, publicationid: db.createdIn("curriculumpublications")[0].publicationid, publishedat: null, publicationstatus: "withdrawn" },
      });
      expect(db.tables.curriculumpublications.map((p) => p.status)).toEqual(["withdrawn"]);
      const before = db.snapshot();
      const again = await send(who, "put", url(TX.curriculum));
      expect(db.snapshot()).toEqual(before);
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({ retired: false, publicationstatus: "withdrawn" });
    });
    it.each(IN_X)("%s: a curriculum never published answers 200 with retired false, nothing written", async (who) => {
      const res = await refuses(who, "put", url(TX.curriculum2));
      expect(withoutReference(res.body)).toEqual({
        error: false,
        data: { curriculumid: TX.curriculum2, retired: false, publicationid: null, publishedat: null, publicationstatus: "never" },
      });
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(id)), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(url(id)), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it("a platform user not acting must choose an organisation first (400), nothing written", async () => {
      const res = await refuses(NOT_ACTING, "put", url(TX.curriculum));
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe("Choose an organisation to act in before you retire a curriculum. Use the organisation switcher, then try again.");
    });
    it("a staff user who may view but not publish is refused (403), nothing written", async () => {
      const viewer = bearer({ lmsuserid: "vw", lmsuserroles: [Role.admin], permissions: ["view_curriculum", "update_curriculum"], organisationid: X, isplatform: false });
      const before = db.snapshot();
      const res = await request(app.getHttpServer()).put(url(TX.curriculum)).set("Authorization", viewer).set("Connection", "close");
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
    });
    it("a school-user token and the server token are refused, nothing written", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        expect([401, 403]).toContain((await refuses(who, "put", url(TX.curriculum))).status);
      }
    });
  });

  // Where a curriculum stands: read on demand, because "changed since publish" reads the organisation's bank.
  describe("GET /curriculum/publication/:curriculumid", () => {
    const url = (id: string) => `/curriculum/publication/${id}`;
    it.each(IN_X)("%s: X's curriculum never published is `never`; published and untouched it has not changed; a renamed lesson has", async (who) => {
      const never = await send(who, "get", url(TX.curriculum));
      expect(withoutReference(never.body)).toEqual({
        error: false,
        data: { curriculumid: TX.curriculum, publicationid: null, publishedat: null, publicationstatus: "never", changedsincepublish: false, problem: null, pending: null, latest: null },
      });
      await send(who, "put", `/curriculum/publish/${TX.curriculum}`);
      const same = await send(who, "get", url(TX.curriculum));
      expect(same.body.data).toMatchObject({ publicationstatus: "published", changedsincepublish: false, problem: null });
      stored("lessons", "lessonid", TX.lesson).lessonname = "Renamed";
      const changed = await send(who, "get", url(TX.curriculum));
      expect(changed.body.data.changedsincepublish).toBe(true);
      expect(changed.body.data.pending.affected.lessons.changed).toEqual([{ id: TX.lesson, name: "Renamed" }]);
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum answer as an absent one does", async (who) => {
      expect(await asAbsent(who, "get", (id) => r(url(id)), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "get", (id) => r(url(id)), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it("a platform user not acting: any owned curriculum's state; an unowned one has none (404)", async () => {
      const res = await send(NOT_ACTING, "get", url(TY.curriculum));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ curriculumid: TY.curriculum, publicationstatus: "never" });
      expect((await send(NOT_ACTING, "get", url(TU.curriculum))).status).toBe(404);
    });
    it("a school-user token and the server token are refused", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        expect([401, 403]).toContain((await send(who, "get", url(TX.curriculum))).status);
      }
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
      expect(res.body.data).toMatchObject({ lessonid: TX.lesson, levelid: TX.level, levelname: "កម្រិតទី១tagx", organisationid: X });
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
    it("a platform user not acting: the lesson names the owner of its curriculum (none for an unowned one)", async () => {
      expect((await send(NOT_ACTING, "get", `/lesson/${TY.lesson}`)).body.data.organisationid).toBe(Y);
      expect((await send(NOT_ACTING, "get", `/lesson/${TU.lesson}`)).body.data.organisationid).toBeNull();
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

  // The learning slot is an ordered list of typed items (docs: learning items). One call sets a lesson's order.
  describe("PUT /lesson/learning/reorder/:lessonid", () => {
    const [L2, L3, LY2, LOTHER] = [uuid(7101), uuid(7102), uuid(7201), uuid(7301)];
    const item = (id: string, lessonid: string, order: number, documentid: string) => ({
      lessonlearningid: id, lessonid, documentid, lessonlearningname: "Learning " + id.slice(-4), lessonlearningdescription: "ពិពណ៌នា", lessonlearningorder: order, lessonlearningstatus: true,
    });
    const ids = (lesson: string) => db.tables.lessonlearnings.filter((x) => x.lessonid === lesson).map((x) => x.lessonlearningid).sort();
    const orderOf = (id: string) => stored("lessonlearnings", "lessonlearningid", id).lessonlearningorder;
    const url = (lesson: string) => `/lesson/learning/reorder/${lesson}`;
    beforeEach(() => {
      // X's lesson holds three items (two of them tied at 5, as an admin's typed numbers can leave them), Y's holds two, and X's other lesson one
      db.add("lessonlearnings", item(L2, TX.lesson, 5, TX.document2));
      db.add("lessonlearnings", item(L3, TX.lesson, 5, TX.document2));
      db.add("lessonlearnings", item(LY2, TY.lesson, 5, TY.document2));
      db.add("lessonlearnings", item(LOTHER, TX.lesson2, 1, TX.document2));
    });
    it.each(IN_X)("%s: sets the order of X's lesson's items to 1..n in the order given, and no other item changes", async (who) => {
      const res = await send(who, "put", url(TX.lesson), { lessonlearningids: [L3, TX.learning, L2] });
      expect(res.status).toBe(200);
      expect(withoutReference(res.body)).toEqual({ error: false, data: true });
      expect([orderOf(L3), orderOf(TX.learning), orderOf(L2)]).toEqual([1, 2, 3]);
      expect(orderOf(LOTHER)).toBe(1);
      expect(orderOf(TY.learning)).toBe(1);
      expect(orderOf(LY2)).toBe(5);
    });
    it.each(IN_X)("%s: reading the lesson's items afterwards lists them in the order given", async (who) => {
      await send(who, "put", url(TX.lesson), { lessonlearningids: [L2, L3, TX.learning] });
      expect([orderOf(L2), orderOf(L3), orderOf(TX.learning)]).toEqual([1, 2, 3]);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(id), { lessonlearningids: [TX.learning, L2, L3] }), TY.lesson, TU.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(url(id), { lessonlearningids: [TX.learning, L2, L3] }), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: a list holding Y's item or an unowned one is the 404 an absent item gets, the whole request refused, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(TX.lesson), { lessonlearningids: [L3, id, TX.learning, L2] }), TY.learning, TU.learning)).toBe(404);
    });
    it.each(IN_X)("%s: a list holding X's item of another lesson, a missing item, or a repeated one is refused, nothing written", async (who) => {
      for (const list of [
        [TX.learning, L2, L3, LOTHER],
        [TX.learning, L2, LOTHER],
        [TX.learning, L2],
        [TX.learning, L2, L2],
        [TX.learning, L2, L3, L3],
      ]) {
        const res = await refuses(who, "put", url(TX.lesson), { lessonlearningids: list });
        expect(res.status).toBe(400);
      }
    });
    it.each(IN_X)("%s: a body that is not a list of ids is refused, nothing written", async (who) => {
      for (const body of [{}, { lessonlearningids: "x" }, { lessonlearningids: ["not-an-id"] }, { lessonlearningids: [TX.learning], extra: 1 }]) {
        expect((await refuses(who, "put", url(TX.lesson), body)).status).toBe(400);
      }
    });
    it("a platform user not acting: any lesson's items, an unowned lesson's too", async () => {
      expect((await send(NOT_ACTING, "put", url(TY.lesson), { lessonlearningids: [LY2, TY.learning] })).status).toBe(200);
      expect([orderOf(LY2), orderOf(TY.learning)]).toEqual([1, 2]);
      expect((await send(NOT_ACTING, "put", url(TU.lesson), { lessonlearningids: [TU.learning] })).status).toBe(200);
      expect(ids(TX.lesson)).toEqual(sorted(TX.learning, L2, L3));
    });
    it("a platform user not acting: a lesson or an item that is not there is the 404 an absent one gets", async () => {
      expect((await refuses(NOT_ACTING, "put", url(MISSING), { lessonlearningids: [] })).status).toBe(404);
      expect((await refuses(NOT_ACTING, "put", url(TY.lesson), { lessonlearningids: [LY2, TY.learning, MISSING] })).status).toBe(404);
    });
    it("a staff user who may view learnings but not update them is refused (403), nothing written", async () => {
      const viewer = bearer({ lmsuserid: "vw", lmsuserroles: [Role.admin], permissions: ["view_lessonlearning"], organisationid: X, isplatform: false });
      const before = db.snapshot();
      const res = await request(app.getHttpServer()).put(url(TX.lesson)).set("Authorization", viewer).set("Connection", "close").send({ lessonlearningids: [TX.learning, L2, L3] });
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
      const read = await request(app.getHttpServer()).get(`/lesson/learning/${TX.lesson}`).set("Authorization", viewer).set("Connection", "close");
      expect(read.status).toBe(200);
    });
    it("a school-user token and the server token are refused, nothing written", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        const res = await refuses(who, "put", url(TX.lesson), { lessonlearningids: [TX.learning, L2, L3] });
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  // One call sets the order of ALL the live grades of a curriculum: 1..n in the order given (the rules of a lesson's learning items).
  describe("PUT /grade/reorder/:curriculumid", () => {
    const [EXTRA, OTHER_PARENT_KID, EMPTY_PARENT, DELETED] = [uuid(11101), uuid(11102), uuid(11104), uuid(11103)];
    const url = (parent: string) => `/grade/reorder/${parent}`;
    const body = (list: string[]) => ({ gradeids: list });
    const row = (id: string, parentid: string, order: number) => ({ gradeid: id, curriculumid: parentid, gradename: "Extra " + id.slice(-4), gradeorder: order, gradestatus: true, passing_points: 8 });
    const KIDS = [TX.grade, TX.grade2];
    const ALL = [...KIDS, EXTRA];
    const orderOf = (id: string) => stored("grades", "gradeid", id).gradeorder;
    beforeEach(() => {
      // the curriculum holds a third grade (its number ties with the first, as an admin's typed numbers can leave them); a sibling curriculum
      // holds one of its own; a third curriculum holds none
      db.add("grades", row(EXTRA, TX.curriculum, 1));
      db.add("grades", row(OTHER_PARENT_KID, TX.curriculum2, 1));
      db.add("grades", { ...row(DELETED, TX.curriculum, 9), isdeleted: true });
      db.add("curriculums", { curriculumid: EMPTY_PARENT, curriculumname: "Empty " + EMPTY_PARENT.slice(-4), organisationid: X, subjectid: TX.subject, curriculumstatus: true });
    });
    /** The tables as they stood, with only the order of the named grades changed to 1..n in the order given. */
    const afterReorder = (before: Record<string, Row[]>, list: string[]) => {
      const expected = JSON.parse(JSON.stringify(before)) as Record<string, Row[]>;
      for (const [index, id] of list.entries()) expected.grades.find((r) => r.gradeid === id)!.gradeorder = index + 1;
      return expected;
    };
    it.each(IN_X)("%s: sets the order of X's curriculum's grades to 1..n in the order given, and nothing else changes", async (who) => {
      const list = [EXTRA, ...[...KIDS].reverse()];
      const before = db.snapshot();
      const res = await send(who, "put", url(TX.curriculum), body(list));
      expect(res.status).toBe(200);
      expect(withoutReference(res.body)).toEqual({ error: false, data: true });
      expect(list.map(orderOf)).toEqual([1, 2, 3]);
      // the sibling curriculum's grade, Y's and the unowned ones are where they were
      expect(db.snapshot()).toEqual(afterReorder(before, list));
    });
    it.each(IN_X)("%s: a deleted grade is not part of the set: left out it is fine, named it is refused", async (who) => {
      const named = await refuses(who, "put", url(TX.curriculum), body([...ALL, DELETED]));
      expect(named.status).toBe(400);
      expect(named.body.fields).toEqual([{ field: "gradeids", message: "The list must hold every grade of this curriculum, once each, and nothing else: 1 not in this curriculum." }]);
      const res = await send(who, "put", url(TX.curriculum), body([EXTRA, ...[...KIDS].reverse()]));
      expect(res.status).toBe(200);
      expect(orderOf(DELETED)).toBe(9);
      expect(stored("grades", "gradeid", DELETED).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: a curriculum with no grades takes an empty list and writes nothing", async (who) => {
      const before = db.snapshot();
      const res = await send(who, "put", url(EMPTY_PARENT), body([]));
      expect(res.status).toBe(200);
      expect(db.snapshot()).toEqual(before);
    });
    it.each(IN_X)("%s: Y's and an unowned curriculum answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(id), body(ALL)), TY.curriculum, TU.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: the curriculum in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(url(id), body(ALL)), "curriculumid", TX.curriculum, TY.curriculum)).toBe(404);
    });
    it.each(IN_X)("%s: a list holding Y's grade or an unowned one is the 404 an absent grade gets, the whole request refused, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(TX.curriculum), body([id, ...ALL])), TY.grade, TU.grade)).toBe(404);
    });
    it.each(IN_X)("%s: a partial list is refused with what is wrong counted, and nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.curriculum), body([EXTRA, KIDS[0]]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "gradeids", message: "The list must hold every grade of this curriculum, once each, and nothing else: 1 missing." }]);
      const none = await refuses(who, "put", url(TX.curriculum), body([]));
      expect(none.status).toBe(400);
      expect(none.body.fields).toEqual([{ field: "gradeids", message: "The list must hold every grade of this curriculum, once each, and nothing else: 3 missing." }]);
    });
    it.each(IN_X)("%s: X's grade of another curriculum is refused, with a left-out one counted too; nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.curriculum), body([...ALL, OTHER_PARENT_KID]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "gradeids", message: "The list must hold every grade of this curriculum, once each, and nothing else: 1 not in this curriculum." }]);
      const both = await refuses(who, "put", url(TX.curriculum), body([EXTRA, OTHER_PARENT_KID, KIDS[0]]));
      expect(both.status).toBe(400);
      expect(both.body.fields).toEqual([{ field: "gradeids", message: "The list must hold every grade of this curriculum, once each, and nothing else: 1 missing, 1 not in this curriculum." }]);
    });
    it.each(IN_X)("%s: a repeated grade is refused, nothing written", async (who) => {
      for (const list of [[...ALL, EXTRA], [EXTRA, EXTRA, KIDS[0]]]) {
        expect((await refuses(who, "put", url(TX.curriculum), body(list))).status).toBe(400);
      }
    });
    it.each(IN_X)("%s: a body that is not a list of ids is refused, nothing written", async (who) => {
      for (const bad of [{}, { gradeids: "x" }, { gradeids: ["not-an-id"] }, { gradeids: [EXTRA], extra: 1 }, { gradeids: null }]) {
        expect((await refuses(who, "put", url(TX.curriculum), bad)).status).toBe(400);
      }
      expect((await refuses(who, "put", url("not-an-id"), body(ALL))).status).toBe(400);
    });
    it("a platform user not acting: any curriculum's grades, an unowned curriculum's too", async () => {
      expect((await send(NOT_ACTING, "put", url(TY.curriculum), body([TY.grade2, TY.grade]))).status).toBe(200);
      expect([orderOf(TY.grade2), orderOf(TY.grade)]).toEqual([1, 2]);
      expect((await send(NOT_ACTING, "put", url(TU.curriculum), body([TU.grade2, TU.grade]))).status).toBe(200);
      expect([orderOf(TU.grade2), orderOf(TU.grade)]).toEqual([1, 2]);
    });
    it("a platform user not acting: a curriculum or a grade that is not there is the 404 an absent one gets", async () => {
      expect((await refuses(NOT_ACTING, "put", url(MISSING), body([]))).status).toBe(404);
      expect((await refuses(NOT_ACTING, "put", url(TX.curriculum), body([...ALL, MISSING]))).status).toBe(404);
    });
    it("a staff user who may view but not update is refused (403), nothing written", async () => {
      const viewer = bearer({ lmsuserid: "vw", lmsuserroles: [Role.admin], permissions: ["view_curriculum"], organisationid: X, isplatform: false });
      const before = db.snapshot();
      const res = await request(app.getHttpServer()).put(url(TX.curriculum)).set("Authorization", viewer).set("Connection", "close").send(body(ALL));
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
    });
    it("a school-user token and the server token are refused, nothing written", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        const res = await refuses(who, "put", url(TX.curriculum), body(ALL));
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  // One call sets the order of ALL the live levels of a grade: 1..n in the order given (the rules of a lesson's learning items).
  describe("PUT /level/reorder/:gradeid", () => {
    const [EXTRA, OTHER_PARENT_KID, EMPTY_PARENT, DELETED] = [uuid(12101), uuid(12102), uuid(12104), uuid(12103)];
    const url = (parent: string) => `/level/reorder/${parent}`;
    const body = (list: string[]) => ({ levelids: list });
    const row = (id: string, parentid: string, order: number) => ({ levelid: id, gradeid: parentid, levelname: "Extra " + id.slice(-4), levelorder: order, levelstatus: true, quiz_points: 100, passing_points: 0 });
    const KIDS = [TX.level, TX.level2];
    const ALL = [...KIDS, EXTRA];
    const orderOf = (id: string) => stored("levels", "levelid", id).levelorder;
    beforeEach(() => {
      // the grade holds a third level (its number ties with the first, as an admin's typed numbers can leave them); a sibling grade
      // holds one of its own; a third grade holds none
      db.add("levels", row(EXTRA, TX.grade, 1));
      db.add("levels", row(OTHER_PARENT_KID, TX.grade2, 1));
      db.add("levels", { ...row(DELETED, TX.grade, 9), isdeleted: true });
      db.add("grades", { gradeid: EMPTY_PARENT, curriculumid: TX.curriculum, gradename: "Empty " + EMPTY_PARENT.slice(-4), gradeorder: 9, gradestatus: true, passing_points: 8 });
    });
    /** The tables as they stood, with only the order of the named levels changed to 1..n in the order given. */
    const afterReorder = (before: Record<string, Row[]>, list: string[]) => {
      const expected = JSON.parse(JSON.stringify(before)) as Record<string, Row[]>;
      for (const [index, id] of list.entries()) expected.levels.find((r) => r.levelid === id)!.levelorder = index + 1;
      return expected;
    };
    it.each(IN_X)("%s: sets the order of X's grade's levels to 1..n in the order given, and nothing else changes", async (who) => {
      const list = [EXTRA, ...[...KIDS].reverse()];
      const before = db.snapshot();
      const res = await send(who, "put", url(TX.grade), body(list));
      expect(res.status).toBe(200);
      expect(withoutReference(res.body)).toEqual({ error: false, data: true });
      expect(list.map(orderOf)).toEqual([1, 2, 3]);
      // the sibling grade's level, Y's and the unowned ones are where they were
      expect(db.snapshot()).toEqual(afterReorder(before, list));
    });
    it.each(IN_X)("%s: a deleted level is not part of the set: left out it is fine, named it is refused", async (who) => {
      const named = await refuses(who, "put", url(TX.grade), body([...ALL, DELETED]));
      expect(named.status).toBe(400);
      expect(named.body.fields).toEqual([{ field: "levelids", message: "The list must hold every level of this grade, once each, and nothing else: 1 not in this grade." }]);
      const res = await send(who, "put", url(TX.grade), body([EXTRA, ...[...KIDS].reverse()]));
      expect(res.status).toBe(200);
      expect(orderOf(DELETED)).toBe(9);
      expect(stored("levels", "levelid", DELETED).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: a grade with no levels takes an empty list and writes nothing", async (who) => {
      const before = db.snapshot();
      const res = await send(who, "put", url(EMPTY_PARENT), body([]));
      expect(res.status).toBe(200);
      expect(db.snapshot()).toEqual(before);
    });
    it.each(IN_X)("%s: Y's and an unowned grade answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(id), body(ALL)), TY.grade, TU.grade)).toBe(404);
    });
    it.each(IN_X)("%s: the grade in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(url(id), body(ALL)), "gradeid", TX.grade, TY.grade)).toBe(404);
    });
    it.each(IN_X)("%s: a list holding Y's level or an unowned one is the 404 an absent level gets, the whole request refused, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(TX.grade), body([id, ...ALL])), TY.level, TU.level)).toBe(404);
    });
    it.each(IN_X)("%s: a partial list is refused with what is wrong counted, and nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.grade), body([EXTRA, KIDS[0]]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "levelids", message: "The list must hold every level of this grade, once each, and nothing else: 1 missing." }]);
      const none = await refuses(who, "put", url(TX.grade), body([]));
      expect(none.status).toBe(400);
      expect(none.body.fields).toEqual([{ field: "levelids", message: "The list must hold every level of this grade, once each, and nothing else: 3 missing." }]);
    });
    it.each(IN_X)("%s: X's level of another grade is refused, with a left-out one counted too; nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.grade), body([...ALL, OTHER_PARENT_KID]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "levelids", message: "The list must hold every level of this grade, once each, and nothing else: 1 not in this grade." }]);
      const both = await refuses(who, "put", url(TX.grade), body([EXTRA, OTHER_PARENT_KID, KIDS[0]]));
      expect(both.status).toBe(400);
      expect(both.body.fields).toEqual([{ field: "levelids", message: "The list must hold every level of this grade, once each, and nothing else: 1 missing, 1 not in this grade." }]);
    });
    it.each(IN_X)("%s: a repeated level is refused, nothing written", async (who) => {
      for (const list of [[...ALL, EXTRA], [EXTRA, EXTRA, KIDS[0]]]) {
        expect((await refuses(who, "put", url(TX.grade), body(list))).status).toBe(400);
      }
    });
    it.each(IN_X)("%s: a body that is not a list of ids is refused, nothing written", async (who) => {
      for (const bad of [{}, { levelids: "x" }, { levelids: ["not-an-id"] }, { levelids: [EXTRA], extra: 1 }, { levelids: null }]) {
        expect((await refuses(who, "put", url(TX.grade), bad)).status).toBe(400);
      }
      expect((await refuses(who, "put", url("not-an-id"), body(ALL))).status).toBe(400);
    });
    it("a platform user not acting: any grade's levels, an unowned grade's too", async () => {
      expect((await send(NOT_ACTING, "put", url(TY.grade), body([TY.level2, TY.level]))).status).toBe(200);
      expect([orderOf(TY.level2), orderOf(TY.level)]).toEqual([1, 2]);
      expect((await send(NOT_ACTING, "put", url(TU.grade), body([TU.level2, TU.level]))).status).toBe(200);
      expect([orderOf(TU.level2), orderOf(TU.level)]).toEqual([1, 2]);
    });
    it("a platform user not acting: a grade or a level that is not there is the 404 an absent one gets", async () => {
      expect((await refuses(NOT_ACTING, "put", url(MISSING), body([]))).status).toBe(404);
      expect((await refuses(NOT_ACTING, "put", url(TX.grade), body([...ALL, MISSING]))).status).toBe(404);
    });
    it("a staff user who may view but not update is refused (403), nothing written", async () => {
      const viewer = bearer({ lmsuserid: "vw", lmsuserroles: [Role.admin], permissions: ["view_curriculum"], organisationid: X, isplatform: false });
      const before = db.snapshot();
      const res = await request(app.getHttpServer()).put(url(TX.grade)).set("Authorization", viewer).set("Connection", "close").send(body(ALL));
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
    });
    it("a school-user token and the server token are refused, nothing written", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        const res = await refuses(who, "put", url(TX.grade), body(ALL));
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  // One call sets the order of ALL the live lessons of a level: 1..n in the order given (the rules of a lesson's learning items).
  describe("PUT /lesson/reorder/:levelid", () => {
    const [EXTRA, OTHER_PARENT_KID, EMPTY_PARENT, DELETED] = [uuid(13101), uuid(13102), uuid(13104), uuid(13103)];
    const url = (parent: string) => `/lesson/reorder/${parent}`;
    const body = (list: string[]) => ({ lessonids: list });
    const row = (id: string, parentid: string, order: number) => ({ lessonid: id, levelid: parentid, lessonname: "Extra " + id.slice(-4), lessonorder: order, lessonstatus: true, total_points: 100, passing_points: 0 });
    const KIDS = [TX.lesson, TX.lesson2];
    const ALL = [...KIDS, EXTRA];
    const orderOf = (id: string) => stored("lessons", "lessonid", id).lessonorder;
    beforeEach(() => {
      // the level holds a third lesson (its number ties with the first, as an admin's typed numbers can leave them); a sibling level
      // holds one of its own; a third level holds none
      db.add("lessons", row(EXTRA, TX.level, 1));
      db.add("lessons", row(OTHER_PARENT_KID, TX.level2, 1));
      db.add("lessons", { ...row(DELETED, TX.level, 9), isdeleted: true });
      db.add("levels", { levelid: EMPTY_PARENT, gradeid: TX.grade, levelname: "Empty " + EMPTY_PARENT.slice(-4), levelorder: 9, levelstatus: true, quiz_points: 100, passing_points: 0 });
    });
    /** The tables as they stood, with only the order of the named lessons changed to 1..n in the order given. */
    const afterReorder = (before: Record<string, Row[]>, list: string[]) => {
      const expected = JSON.parse(JSON.stringify(before)) as Record<string, Row[]>;
      for (const [index, id] of list.entries()) expected.lessons.find((r) => r.lessonid === id)!.lessonorder = index + 1;
      return expected;
    };
    it.each(IN_X)("%s: sets the order of X's level's lessons to 1..n in the order given, and nothing else changes", async (who) => {
      const list = [EXTRA, ...[...KIDS].reverse()];
      const before = db.snapshot();
      const res = await send(who, "put", url(TX.level), body(list));
      expect(res.status).toBe(200);
      expect(withoutReference(res.body)).toEqual({ error: false, data: true });
      expect(list.map(orderOf)).toEqual([1, 2, 3]);
      // the sibling level's lesson, Y's and the unowned ones are where they were
      expect(db.snapshot()).toEqual(afterReorder(before, list));
    });
    it.each(IN_X)("%s: a deleted lesson is not part of the set: left out it is fine, named it is refused", async (who) => {
      const named = await refuses(who, "put", url(TX.level), body([...ALL, DELETED]));
      expect(named.status).toBe(400);
      expect(named.body.fields).toEqual([{ field: "lessonids", message: "The list must hold every lesson of this level, once each, and nothing else: 1 not in this level." }]);
      const res = await send(who, "put", url(TX.level), body([EXTRA, ...[...KIDS].reverse()]));
      expect(res.status).toBe(200);
      expect(orderOf(DELETED)).toBe(9);
      expect(stored("lessons", "lessonid", DELETED).isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: a level with no lessons takes an empty list and writes nothing", async (who) => {
      const before = db.snapshot();
      const res = await send(who, "put", url(EMPTY_PARENT), body([]));
      expect(res.status).toBe(200);
      expect(db.snapshot()).toEqual(before);
    });
    it.each(IN_X)("%s: Y's and an unowned level answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(id), body(ALL)), TY.level, TU.level)).toBe(404);
    });
    it.each(IN_X)("%s: the level in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(url(id), body(ALL)), "levelid", TX.level, TY.level)).toBe(404);
    });
    it.each(IN_X)("%s: a list holding Y's lesson or an unowned one is the 404 an absent lesson gets, the whole request refused, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(TX.level), body([id, ...ALL])), TY.lesson, TU.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: a partial list is refused with what is wrong counted, and nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.level), body([EXTRA, KIDS[0]]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "lessonids", message: "The list must hold every lesson of this level, once each, and nothing else: 1 missing." }]);
      const none = await refuses(who, "put", url(TX.level), body([]));
      expect(none.status).toBe(400);
      expect(none.body.fields).toEqual([{ field: "lessonids", message: "The list must hold every lesson of this level, once each, and nothing else: 3 missing." }]);
    });
    it.each(IN_X)("%s: X's lesson of another level is refused, with a left-out one counted too; nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.level), body([...ALL, OTHER_PARENT_KID]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "lessonids", message: "The list must hold every lesson of this level, once each, and nothing else: 1 not in this level." }]);
      const both = await refuses(who, "put", url(TX.level), body([EXTRA, OTHER_PARENT_KID, KIDS[0]]));
      expect(both.status).toBe(400);
      expect(both.body.fields).toEqual([{ field: "lessonids", message: "The list must hold every lesson of this level, once each, and nothing else: 1 missing, 1 not in this level." }]);
    });
    it.each(IN_X)("%s: a repeated lesson is refused, nothing written", async (who) => {
      for (const list of [[...ALL, EXTRA], [EXTRA, EXTRA, KIDS[0]]]) {
        expect((await refuses(who, "put", url(TX.level), body(list))).status).toBe(400);
      }
    });
    it.each(IN_X)("%s: a body that is not a list of ids is refused, nothing written", async (who) => {
      for (const bad of [{}, { lessonids: "x" }, { lessonids: ["not-an-id"] }, { lessonids: [EXTRA], extra: 1 }, { lessonids: null }]) {
        expect((await refuses(who, "put", url(TX.level), bad)).status).toBe(400);
      }
      expect((await refuses(who, "put", url("not-an-id"), body(ALL))).status).toBe(400);
    });
    it("a platform user not acting: any level's lessons, an unowned level's too", async () => {
      expect((await send(NOT_ACTING, "put", url(TY.level), body([TY.lesson2, TY.lesson]))).status).toBe(200);
      expect([orderOf(TY.lesson2), orderOf(TY.lesson)]).toEqual([1, 2]);
      expect((await send(NOT_ACTING, "put", url(TU.level), body([TU.lesson2, TU.lesson]))).status).toBe(200);
      expect([orderOf(TU.lesson2), orderOf(TU.lesson)]).toEqual([1, 2]);
    });
    it("a platform user not acting: a level or a lesson that is not there is the 404 an absent one gets", async () => {
      expect((await refuses(NOT_ACTING, "put", url(MISSING), body([]))).status).toBe(404);
      expect((await refuses(NOT_ACTING, "put", url(TX.level), body([...ALL, MISSING]))).status).toBe(404);
    });
    it("a staff user who may view but not update is refused (403), nothing written", async () => {
      const viewer = bearer({ lmsuserid: "vw", lmsuserroles: [Role.admin], permissions: ["view_curriculum"], organisationid: X, isplatform: false });
      const before = db.snapshot();
      const res = await request(app.getHttpServer()).put(url(TX.level)).set("Authorization", viewer).set("Connection", "close").send(body(ALL));
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
    });
    it("a school-user token and the server token are refused, nothing written", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        const res = await refuses(who, "put", url(TX.level), body(ALL));
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  // One call sets the order of ALL the live quizs of a lesson: 1..n in the order given (the rules of a lesson's learning items).
  describe("PUT /lesson/quiz/reorder/:lessonid", () => {
    const [EXTRA, OTHER_PARENT_KID, EMPTY_PARENT] = [uuid(14101), uuid(14102), uuid(14104)];
    const url = (parent: string) => `/lesson/quiz/reorder/${parent}`;
    const body = (list: string[]) => ({ lessonquizids: list });
    const row = (id: string, parentid: string, order: number) => ({ lessonquizid: id, lessonid: parentid, lessonquizname: "Extra " + id.slice(-4), lessonquizdescription: "d", lessonquizorder: order, lessonquizstatus: true, points: 10 });
    const KIDS = [TX.quiz, TX.quiz2];
    const ALL = [...KIDS, EXTRA];
    const orderOf = (id: string) => stored("lessonquizzes", "lessonquizid", id).lessonquizorder;
    beforeEach(() => {
      // the lesson holds a third quiz (its number ties with the first, as an admin's typed numbers can leave them); a sibling lesson
      // holds one of its own; a third lesson holds none
      db.add("lessonquizzes", row(EXTRA, TX.lesson, 1));
      db.add("lessonquizzes", row(OTHER_PARENT_KID, TX.lesson2, 1));
      db.add("lessons", { lessonid: EMPTY_PARENT, levelid: TX.level, lessonname: "Empty " + EMPTY_PARENT.slice(-4), lessonorder: 9, lessonstatus: true, total_points: 100, passing_points: 0 });
    });
    /** The tables as they stood, with only the order of the named quizs changed to 1..n in the order given. */
    const afterReorder = (before: Record<string, Row[]>, list: string[]) => {
      const expected = JSON.parse(JSON.stringify(before)) as Record<string, Row[]>;
      for (const [index, id] of list.entries()) expected.lessonquizzes.find((r) => r.lessonquizid === id)!.lessonquizorder = index + 1;
      return expected;
    };
    it.each(IN_X)("%s: sets the order of X's lesson's quizs to 1..n in the order given, and nothing else changes", async (who) => {
      const list = [EXTRA, ...[...KIDS].reverse()];
      const before = db.snapshot();
      const res = await send(who, "put", url(TX.lesson), body(list));
      expect(res.status).toBe(200);
      expect(withoutReference(res.body)).toEqual({ error: false, data: true });
      expect(list.map(orderOf)).toEqual([1, 2, 3]);
      // the sibling lesson's quiz, Y's and the unowned ones are where they were
      expect(db.snapshot()).toEqual(afterReorder(before, list));
    });
    it.each(IN_X)("%s: a lesson with no quizs takes an empty list and writes nothing", async (who) => {
      const before = db.snapshot();
      const res = await send(who, "put", url(EMPTY_PARENT), body([]));
      expect(res.status).toBe(200);
      expect(db.snapshot()).toEqual(before);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(id), body(ALL)), TY.lesson, TU.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(url(id), body(ALL)), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: a list holding Y's quiz or an unowned one is the 404 an absent quiz gets, the whole request refused, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(TX.lesson), body([id, ...ALL])), TY.quiz, TU.quiz)).toBe(404);
    });
    it.each(IN_X)("%s: a partial list is refused with what is wrong counted, and nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.lesson), body([EXTRA, KIDS[0]]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "lessonquizids", message: "The list must hold every quiz of this lesson, once each, and nothing else: 1 missing." }]);
      const none = await refuses(who, "put", url(TX.lesson), body([]));
      expect(none.status).toBe(400);
      expect(none.body.fields).toEqual([{ field: "lessonquizids", message: "The list must hold every quiz of this lesson, once each, and nothing else: 3 missing." }]);
    });
    it.each(IN_X)("%s: X's quiz of another lesson is refused, with a left-out one counted too; nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.lesson), body([...ALL, OTHER_PARENT_KID]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "lessonquizids", message: "The list must hold every quiz of this lesson, once each, and nothing else: 1 not in this lesson." }]);
      const both = await refuses(who, "put", url(TX.lesson), body([EXTRA, OTHER_PARENT_KID, KIDS[0]]));
      expect(both.status).toBe(400);
      expect(both.body.fields).toEqual([{ field: "lessonquizids", message: "The list must hold every quiz of this lesson, once each, and nothing else: 1 missing, 1 not in this lesson." }]);
    });
    it.each(IN_X)("%s: a repeated quiz is refused, nothing written", async (who) => {
      for (const list of [[...ALL, EXTRA], [EXTRA, EXTRA, KIDS[0]]]) {
        expect((await refuses(who, "put", url(TX.lesson), body(list))).status).toBe(400);
      }
    });
    it.each(IN_X)("%s: a body that is not a list of ids is refused, nothing written", async (who) => {
      for (const bad of [{}, { lessonquizids: "x" }, { lessonquizids: ["not-an-id"] }, { lessonquizids: [EXTRA], extra: 1 }, { lessonquizids: null }]) {
        expect((await refuses(who, "put", url(TX.lesson), bad)).status).toBe(400);
      }
      expect((await refuses(who, "put", url("not-an-id"), body(ALL))).status).toBe(400);
    });
    it("a platform user not acting: any lesson's quizs, an unowned lesson's too", async () => {
      expect((await send(NOT_ACTING, "put", url(TY.lesson), body([TY.quiz2, TY.quiz]))).status).toBe(200);
      expect([orderOf(TY.quiz2), orderOf(TY.quiz)]).toEqual([1, 2]);
      expect((await send(NOT_ACTING, "put", url(TU.lesson), body([TU.quiz2, TU.quiz]))).status).toBe(200);
      expect([orderOf(TU.quiz2), orderOf(TU.quiz)]).toEqual([1, 2]);
    });
    it("a platform user not acting: a lesson or a quiz that is not there is the 404 an absent one gets", async () => {
      expect((await refuses(NOT_ACTING, "put", url(MISSING), body([]))).status).toBe(404);
      expect((await refuses(NOT_ACTING, "put", url(TX.lesson), body([...ALL, MISSING]))).status).toBe(404);
    });
    it("a staff user who may view but not update is refused (403), nothing written", async () => {
      const viewer = bearer({ lmsuserid: "vw", lmsuserroles: [Role.admin], permissions: ["view_curriculum"], organisationid: X, isplatform: false });
      const before = db.snapshot();
      const res = await request(app.getHttpServer()).put(url(TX.lesson)).set("Authorization", viewer).set("Connection", "close").send(body(ALL));
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
    });
    it("a school-user token and the server token are refused, nothing written", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        const res = await refuses(who, "put", url(TX.lesson), body(ALL));
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  // One call sets the order of ALL the live practices of a lesson: 1..n in the order given (the rules of a lesson's learning items).
  describe("PUT /lesson/practice/reorder/:lessonid", () => {
    const [EXTRA, OTHER_PARENT_KID, EMPTY_PARENT] = [uuid(15101), uuid(15102), uuid(15104)];
    const url = (parent: string) => `/lesson/practice/reorder/${parent}`;
    const body = (list: string[]) => ({ lessonpracticeids: list });
    const row = (id: string, parentid: string, order: number) => ({ lessonpracticeid: id, lessonid: parentid, lessonpracticename: "Extra " + id.slice(-4), lessonpracticedescription: "d", lessonpracticeorder: order, lessonpracticestatus: true, points: 10 });
    const KIDS = [TX.practice, TX.practice2];
    const ALL = [...KIDS, EXTRA];
    const orderOf = (id: string) => stored("lessonpractices", "lessonpracticeid", id).lessonpracticeorder;
    beforeEach(() => {
      // the lesson holds a third practice (its number ties with the first, as an admin's typed numbers can leave them); a sibling lesson
      // holds one of its own; a third lesson holds none
      db.add("lessonpractices", row(EXTRA, TX.lesson, 1));
      db.add("lessonpractices", row(OTHER_PARENT_KID, TX.lesson2, 1));
      db.add("lessons", { lessonid: EMPTY_PARENT, levelid: TX.level, lessonname: "Empty " + EMPTY_PARENT.slice(-4), lessonorder: 9, lessonstatus: true, total_points: 100, passing_points: 0 });
    });
    /** The tables as they stood, with only the order of the named practices changed to 1..n in the order given. */
    const afterReorder = (before: Record<string, Row[]>, list: string[]) => {
      const expected = JSON.parse(JSON.stringify(before)) as Record<string, Row[]>;
      for (const [index, id] of list.entries()) expected.lessonpractices.find((r) => r.lessonpracticeid === id)!.lessonpracticeorder = index + 1;
      return expected;
    };
    it.each(IN_X)("%s: sets the order of X's lesson's practices to 1..n in the order given, and nothing else changes", async (who) => {
      const list = [EXTRA, ...[...KIDS].reverse()];
      const before = db.snapshot();
      const res = await send(who, "put", url(TX.lesson), body(list));
      expect(res.status).toBe(200);
      expect(withoutReference(res.body)).toEqual({ error: false, data: true });
      expect(list.map(orderOf)).toEqual([1, 2, 3]);
      // the sibling lesson's practice, Y's and the unowned ones are where they were
      expect(db.snapshot()).toEqual(afterReorder(before, list));
    });
    it.each(IN_X)("%s: a lesson with no practices takes an empty list and writes nothing", async (who) => {
      const before = db.snapshot();
      const res = await send(who, "put", url(EMPTY_PARENT), body([]));
      expect(res.status).toBe(200);
      expect(db.snapshot()).toEqual(before);
    });
    it.each(IN_X)("%s: Y's and an unowned lesson answer as an absent one does, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(id), body(ALL)), TY.lesson, TU.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: the lesson in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(url(id), body(ALL)), "lessonid", TX.lesson, TY.lesson)).toBe(404);
    });
    it.each(IN_X)("%s: a list holding Y's practice or an unowned one is the 404 an absent practice gets, the whole request refused, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(url(TX.lesson), body([id, ...ALL])), TY.practice, TU.practice)).toBe(404);
    });
    it.each(IN_X)("%s: a partial list is refused with what is wrong counted, and nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.lesson), body([EXTRA, KIDS[0]]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "lessonpracticeids", message: "The list must hold every practice of this lesson, once each, and nothing else: 1 missing." }]);
      const none = await refuses(who, "put", url(TX.lesson), body([]));
      expect(none.status).toBe(400);
      expect(none.body.fields).toEqual([{ field: "lessonpracticeids", message: "The list must hold every practice of this lesson, once each, and nothing else: 3 missing." }]);
    });
    it.each(IN_X)("%s: X's practice of another lesson is refused, with a left-out one counted too; nothing is written", async (who) => {
      const res = await refuses(who, "put", url(TX.lesson), body([...ALL, OTHER_PARENT_KID]));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "lessonpracticeids", message: "The list must hold every practice of this lesson, once each, and nothing else: 1 not in this lesson." }]);
      const both = await refuses(who, "put", url(TX.lesson), body([EXTRA, OTHER_PARENT_KID, KIDS[0]]));
      expect(both.status).toBe(400);
      expect(both.body.fields).toEqual([{ field: "lessonpracticeids", message: "The list must hold every practice of this lesson, once each, and nothing else: 1 missing, 1 not in this lesson." }]);
    });
    it.each(IN_X)("%s: a repeated practice is refused, nothing written", async (who) => {
      for (const list of [[...ALL, EXTRA], [EXTRA, EXTRA, KIDS[0]]]) {
        expect((await refuses(who, "put", url(TX.lesson), body(list))).status).toBe(400);
      }
    });
    it.each(IN_X)("%s: a body that is not a list of ids is refused, nothing written", async (who) => {
      for (const bad of [{}, { lessonpracticeids: "x" }, { lessonpracticeids: ["not-an-id"] }, { lessonpracticeids: [EXTRA], extra: 1 }, { lessonpracticeids: null }]) {
        expect((await refuses(who, "put", url(TX.lesson), bad)).status).toBe(400);
      }
      expect((await refuses(who, "put", url("not-an-id"), body(ALL))).status).toBe(400);
    });
    it("a platform user not acting: any lesson's practices, an unowned lesson's too", async () => {
      expect((await send(NOT_ACTING, "put", url(TY.lesson), body([TY.practice2, TY.practice]))).status).toBe(200);
      expect([orderOf(TY.practice2), orderOf(TY.practice)]).toEqual([1, 2]);
      expect((await send(NOT_ACTING, "put", url(TU.lesson), body([TU.practice2, TU.practice]))).status).toBe(200);
      expect([orderOf(TU.practice2), orderOf(TU.practice)]).toEqual([1, 2]);
    });
    it("a platform user not acting: a lesson or a practice that is not there is the 404 an absent one gets", async () => {
      expect((await refuses(NOT_ACTING, "put", url(MISSING), body([]))).status).toBe(404);
      expect((await refuses(NOT_ACTING, "put", url(TX.lesson), body([...ALL, MISSING]))).status).toBe(404);
    });
    it("a staff user who may view but not update is refused (403), nothing written", async () => {
      const viewer = bearer({ lmsuserid: "vw", lmsuserroles: [Role.admin], permissions: ["view_curriculum"], organisationid: X, isplatform: false });
      const before = db.snapshot();
      const res = await request(app.getHttpServer()).put(url(TX.lesson)).set("Authorization", viewer).set("Connection", "close").send(body(ALL));
      expect(res.status).toBe(403);
      expect(db.snapshot()).toEqual(before);
    });
    it("a school-user token and the server token are refused, nothing written", async () => {
      for (const who of ["a school-user token", "a server token"] as Who[]) {
        const res = await refuses(who, "put", url(TX.lesson), body(ALL));
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  describe("learning items: type, body and documents", () => {
    const body = (over: object = {}) => ({ documentid: TX.document2, lessonlearningname: "ថ្មី", lessonlearningdescription: "ពិពណ៌នា", lessonlearningorder: 3, ...over });
    const updateBody = (over: object = {}) => ({ documentid: TX.document2, lessonid: TX.lesson, lessonlearningname: "ឈ្មោះថ្មី", lessonlearningdescription: "ពិពណ៌នា", ...over });
    const asset = (documentid: string) => ({ documentid, role: "asset", order: 0 });
    const fieldsOf = (res: request.Response) => (res.body.fields ?? []).map((f: { field: string }) => f.field);

    it.each(IN_X)("%s: a new item is a video item with no body by default, and says so when read", async (who) => {
      expect((await send(who, "post", `/lesson/learning/${TX.lesson}`, body())).status).toBe(200);
      expect(db.createdIn("lessonlearnings")).toEqual([expect.objectContaining({ documentid: TX.document2, lessonlearningtype: "video", lessonlearningbody: null })]);
      const read = await send(who, "get", `/lesson/learning/${TX.lesson}`);
      expect(read.body.data.map((x: Row) => [x.lessonlearningid === TX.learning, x.lessonlearningtype, x.lessonlearningbody, x.documents])).toEqual(
        expect.arrayContaining([[true, "video", null, []]]),
      );
    });
    it.each(IN_X)("%s: the type may be named as video", async (who) => {
      expect((await send(who, "post", `/lesson/learning/${TX.lesson}`, body({ lessonlearningtype: "video", lessonlearningbody: null }))).status).toBe(200);
    });
    it.each(IN_X)("%s: the request validator itself refuses a type it does not know, before the item's rules are reached", async (who) => {
      const res = await refuses(who, "post", `/lesson/learning/${TX.lesson}`, body({ lessonlearningtype: "document" }));
      expect(res.status).toBe(400);
      // the validator's own wording, not the rule table's "That learning item type isn't supported."
      expect(res.body.fields).toEqual([{ field: "lessonlearningtype", message: "Lessonlearningtype must be one of the allowed values." }]);
    });
    it.each(IN_X)("%s: any other type is refused, nothing written", async (who) => {
      for (const lessonlearningtype of ["document", "audio", "gallery", "cards", "package", "link", "Video", "", "x".repeat(40)]) {
        const res = await refuses(who, "post", `/lesson/learning/${TX.lesson}`, body({ lessonlearningtype }));
        expect(res.status).toBe(400);
        expect(fieldsOf(res)).toContain("lessonlearningtype");
      }
    });
    it.each(IN_X)("%s: a video item takes no body, no extra documents and needs its document: each refused, nothing written", async (who) => {
      const bad: Array<[object, string, string]> = [
        [{ lessonlearningbody: { v: 1 } }, "lessonlearningbody", "A video item has no body."],
        [{ lessonlearningbody: {} }, "lessonlearningbody", "A video item has no body."],
        [{ documents: [asset(TX.document)] }, "documents", "A video item takes no extra documents."],
        [{ documentid: null }, "documentid", "A video item needs a document."],
        [{ documentid: undefined }, "documentid", "A video item needs a document."],
      ];
      for (const [over, field, message] of bad) {
        const res = await refuses(who, "post", `/lesson/learning/${TX.lesson}`, body(over));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([expect.objectContaining({ field, message })]);
      }
    });
    // The video rule (media library phase 0): a video item's file must have the VIDEO document type (2).
    it.each(IN_X)("%s: a video item on a document of another type is refused (400), nothing written; an mp4 is accepted", async (who) => {
      for (const documenttypeid of [1, 5, 6, 8, 9, 10]) {
        stored("documents", "documentid", TX.document2).documenttypeid = documenttypeid;
        const res = await refuses(who, "post", `/lesson/learning/${TX.lesson}`, body());
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "documentid", message: "A video item needs a video file." }]);
      }
      stored("documents", "documentid", TX.document2).documenttypeid = 2;
      expect((await send(who, "post", `/lesson/learning/${TX.lesson}`, body())).status).toBe(200);
      expect(db.createdIn("lessonlearnings")).toHaveLength(1);
    });
    it.each(IN_X)("%s: updating a video item to a document of another type is refused; leaving the document out checks the stored one", async (who) => {
      stored("documents", "documentid", TX.document2).documenttypeid = 5;
      const toPdf = await refuses(who, "put", `/lesson/learning/${TX.learning}`, updateBody());
      expect(toPdf.status).toBe(400);
      expect(toPdf.body.fields).toEqual([{ field: "documentid", message: "A video item needs a video file." }]);
      expect(stored("lessonlearnings", "lessonlearningid", TX.learning).documentid).toBe(TX.document);
      // the request names no document: the stored one (a video) is what the rule looks at
      const { documentid: _omit, ...withoutDocument } = updateBody();
      expect((await send(who, "put", `/lesson/learning/${TX.learning}`, withoutDocument)).status).toBe(200);
      // the stored document is no longer a video: the item cannot be saved again without changing it
      stored("documents", "documentid", TX.document).documenttypeid = 6;
      expect((await refuses(who, "put", `/lesson/learning/${TX.learning}`, withoutDocument)).status).toBe(400);
    });
    it.each(IN_X)("%s: Y's document on X's video item still answers as absent, before its type is compared", async (who) => {
      stored("documents", "documentid", TY.document).documenttypeid = 5;
      stored("documents", "documentid", TU.document).documenttypeid = 5;
      expect(await asAbsent(who, "post", (id) => r(`/lesson/learning/${TX.lesson}`, body({ documentid: id })), TY.document, TU.document)).toBe(400);
      expect(await asAbsent(who, "put", (id) => r(`/lesson/learning/${TX.learning}`, updateBody({ documentid: id })), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: an empty documents list is no extra documents", async (who) => {
      expect((await send(who, "post", `/lesson/learning/${TX.lesson}`, body({ documents: [] }))).status).toBe(200);
    });
    it.each(IN_X)("%s: a field the API does not know is refused, nothing written", async (who) => {
      expect((await refuses(who, "post", `/lesson/learning/${TX.lesson}`, body({ lessonlearningcolour: "red" }))).status).toBe(400);
    });
    it.each(IN_X)("%s: a document of Y or an unowned one in documents is the 404 an absent document gets, even when the type's rules are also broken", async (who) => {
      // ownership is checked before the type's rules: the answer does not depend on the (refused) body
      expect(await asAbsent(who, "post", (id) => r(`/lesson/learning/${TX.lesson}`, body({ documents: [asset(id)] })), TY.document, TU.document)).toBe(404);
      expect(await asAbsent(who, "post", (id) => r(`/lesson/learning/${TX.lesson}`, body({ documents: [asset(id)], lessonlearningbody: { v: 1 } })), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: X's own document in documents is accepted past the scope check and refused by the video rule, after it", async (who) => {
      const res = await refuses(who, "post", `/lesson/learning/${TX.lesson}`, body({ documents: [asset(TX.document)] }));
      expect(res.status).toBe(400);
      expect(fieldsOf(res)).toEqual(["documents"]);
    });
    it.each(IN_X)("%s: updating keeps the type and body when the request leaves them out, and refuses a body for a video item", async (who) => {
      expect((await send(who, "put", `/lesson/learning/${TX.learning}`, updateBody())).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TX.learning)).toMatchObject({ documentid: TX.document2, lessonlearningname: "ឈ្មោះថ្មី" });
      for (const [over, field] of [
        [{ lessonlearningbody: { v: 1 } }, "lessonlearningbody"],
        [{ documentid: null }, "documentid"],
        [{ documents: [asset(TX.document)] }, "documents"],
        [{ lessonlearningtype: "document" }, "lessonlearningtype"],
      ] as Array<[object, string]>) {
        const res = await refuses(who, "put", `/lesson/learning/${TX.learning}`, updateBody(over));
        expect(res.status).toBe(400);
        expect(fieldsOf(res)).toEqual([field]);
      }
    });
    it.each(IN_X)("%s: updating without a document leaves the item's document as it was", async (who) => {
      const { documentid, ...withoutDocument } = updateBody();
      expect(documentid).toBe(TX.document2);
      expect((await send(who, "put", `/lesson/learning/${TX.learning}`, withoutDocument)).status).toBe(200);
      expect(stored("lessonlearnings", "lessonlearningid", TX.learning).documentid).toBe(TX.document);
    });
    it.each(IN_X)("%s: a document of Y in documents on an update is the 404 an absent one gets, nothing written", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/lesson/learning/${TX.learning}`, updateBody({ documents: [asset(id)] })), TY.document, TU.document)).toBe(404);
    });

    describe("reading", () => {
      beforeEach(() => {
        // an item that is not a single file (a later type): no primary document; and link rows for X's and Y's items
        db.add("lessonlearnings", {
          lessonlearningid: uuid(7401), lessonid: TX.lesson, documentid: null, lessonlearningtype: "gallery", lessonlearningbody: { v: 1 },
          lessonlearningname: "Gallery", lessonlearningdescription: "ពិពណ៌នា", lessonlearningorder: 2, lessonlearningstatus: true,
        });
        db.add("lessonlearningdocuments", { lessonlearningdocumentid: uuid(7501), lessonlearningid: uuid(7401), documentid: TX.document2, lessonlearningdocumentrole: "asset", lessonlearningdocumentorder: 2 });
        db.add("lessonlearningdocuments", { lessonlearningdocumentid: uuid(7502), lessonlearningid: uuid(7401), documentid: TX.document, lessonlearningdocumentrole: "asset", lessonlearningdocumentorder: 1 });
        db.add("lessonlearningdocuments", { lessonlearningdocumentid: uuid(7503), lessonlearningid: TY.learning, documentid: TY.document, lessonlearningdocumentrole: "rendition", lessonlearningdocumentorder: 1 });
      });
      it.each(IN_X)("%s: an item with no document lists and reads without a crash, with its type, body and ordered documents", async (who) => {
        const list = await send(who, "get", `/lesson/learning/${TX.lesson}`);
        expect(list.status).toBe(200);
        const gallery = list.body.data.find((x: Row) => x.lessonlearningid === uuid(7401));
        expect(gallery).toMatchObject({
          documentid: null, documentname: null, documenttypeid: null, lessonlearningtype: "gallery", lessonlearningbody: { v: 1 },
          documents: [
            { documentid: TX.document, role: "asset", order: 1, documentname: `doc_${TX.tag}.png`, documenttypeid: 2 },
            { documentid: TX.document2, role: "asset", order: 2, documentname: `doc2_${TX.tag}.png`, documenttypeid: 2 },
          ],
        });
        const one = await send(who, "get", `/lesson/learning/${TX.lesson}/${uuid(7401)}`);
        expect(one.status).toBe(200);
        expect(one.body.data).toEqual(gallery);
      });
      it.each(IN_X)("%s: Y's link rows never appear in X's reads", async (who) => {
        const list = await send(who, "get", `/lesson/learning/${TX.lesson}`);
        const shown = list.body.data.flatMap((x: Row) => (x.documents as Row[]).map((d) => d.documentid));
        expect(shown.sort()).toEqual(sorted(TX.document, TX.document2));
        expect(JSON.stringify(list.body)).not.toContain(TY.document);
      });
      it("a platform user not acting: Y's item shows its own link row", async () => {
        const read = await send(NOT_ACTING, "get", `/lesson/learning/${TY.lesson}/${TY.learning}`);
        expect(read.body.data.documents).toEqual([expect.objectContaining({ documentid: TY.document, role: "rendition" })]);
      });
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
      expect(res.body.data).toMatchObject({ questionid: TX.question, questionidentifier: "qi-tagx", organisationid: X });
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
    it("a platform user not acting: the question names its owner (none for an unowned one)", async () => {
      expect((await send(NOT_ACTING, "get", `/question/${TY.question}`)).body.data.organisationid).toBe(Y);
      expect((await send(NOT_ACTING, "get", `/question/${TU.question}`)).body.data.organisationid).toBeNull();
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
    const KHMER_TITLE = "ភ្នំពេញ";
    const upload = (who: Who, filename: string, bytes: Buffer = pngBytes(), fields: Record<string, string> = {}) => {
      let req = request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).set("Connection", "close");
      for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
      return req.attach("file", bytes, filename);
    };
    const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;
    it.each(IN_X)("%s: the document is X's, stored under a generated key, with the content type of its extension", async (who) => {
      expect((await upload(who, "sample_file.png")).status).toBe(200);
      const [row] = db.createdIn("documents");
      expect(row).toEqual(expect.objectContaining({ organisationid: X, documenttypeid: 6, documenttitle: "sample_file", documentlicence: "unspecified", documentattribution: null }));
      expect(row.documentname).toMatch(KEY);
      expect(row.documentname).toBe(`${row.documentid}.png`);
      expect(uploadS3).toHaveBeenCalledTimes(1);
      expect(uploadS3).toHaveBeenCalledWith(row.documentname, expect.any(Buffer), "image/png");
    });
    it.each(IN_X)("%s: a file name with spaces around it gives the title without them and without the extension", async (who) => {
      expect((await upload(who, "a.png ")).status).toBe(200);
      expect((await upload(who, " lesson one.PNG")).status).toBe(200);
      expect(db.createdIn("documents").map((r) => r.documenttitle)).toEqual(["a", "lesson one"]);
    });
    it.each(IN_X)("%s: X and Y may upload the same file name: both succeed, with different keys that hold none of the name", async (who) => {
      const first = await upload(who, "doc_tagx.png");
      const second = await upload(who, "doc_tagx.png");
      const name = await upload(who, "doc_tagy.png");
      expect([first.status, second.status, name.status]).toEqual([200, 200, 200]);
      const keys = db.createdIn("documents").map((d) => d.documentname as string);
      expect(new Set(keys).size).toBe(3);
      for (const key of keys) {
        expect(key).toMatch(KEY);
        expect(key).not.toContain("doc_tag");
      }
      expect(db.createdIn("documents").map((d) => d.documenttitle)).toEqual(["doc_tagx", "doc_tagx", "doc_tagy"]);
    });
    it.each(IN_X)("%s: a Khmer file name is no obstacle and becomes the title; the key holds none of it", async (who) => {
      expect((await upload(who, `${KHMER_TITLE}.png`)).status).toBe(200);
      const [row] = db.createdIn("documents");
      expect(row.documenttitle).toBe(KHMER_TITLE);
      expect(row.documentname).toMatch(KEY);
    });
    it.each(IN_X)("%s: a title, licence and attribution sent with the file are stored as sent", async (who) => {
      const attribution = { v: 1, author: "ក្រុមអ្នកនិពន្ធ", sourceurl: "https://example.org/a", adaptedfrom: "Un titre" };
      const res = await upload(who, "sample_file.png", pngBytes(), { documenttitle: `  ${KHMER_TITLE}  `, documentlicence: "CC-BY-4.0", documentattribution: JSON.stringify(attribution) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ error: false, data: true });
      expect(db.createdIn("documents")).toEqual([
        expect.objectContaining({ documenttitle: KHMER_TITLE, documentlicence: "CC-BY-4.0", documentattribution: attribution }),
      ]);
    });
    it.each(IN_X)("%s: every whitelisted type is accepted with its type id, content type and extension", async (who) => {
      const files: Array<[string, Buffer, number, string]> = [
        ["a.mp4", mp4Bytes(), 2, "video/mp4"], ["a.mp3", mp3Bytes(), 1, "audio/mpeg"], ["a.jpg", jpgBytes(), 6, "image/jpeg"],
        ["a.JPEG", jpgBytes(), 6, "image/jpeg"], ["a.gif", gifBytes(), 6, "image/gif"], ["a.pdf", pdfBytes(), 5, "application/pdf"],
        ["a.pptx", ooxmlBytes("pptx"), 8, "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        ["a.odp", odfBytes("odp"), 8, "application/vnd.oasis.opendocument.presentation"],
        ["a.docx", ooxmlBytes("docx"), 9, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        ["a.odt", odfBytes("odt"), 9, "application/vnd.oasis.opendocument.text"],
        ["a.xlsx", ooxmlBytes("xlsx"), 10, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        ["a.csv", csvBytes(`ឈ្មោះ,${KHMER_TITLE}\n`), 10, "text/csv"],
      ];
      for (const [name, bytes, typeid, contentType] of files) {
        expect((await upload(who, name, bytes)).status).toBe(200);
        const row = db.createdIn("documents").slice(-1)[0];
        expect(row.documenttypeid).toBe(typeid);
        expect(row.documentname).toBe(`${row.documentid}.${name.split(".")[1].toLowerCase()}`);
        expect(uploadS3).toHaveBeenLastCalledWith(row.documentname, expect.any(Buffer), contentType);
      }
    });
    it.each(IN_X)("%s: a file that is not what its name says is refused (400), nothing stored", async (who) => {
      const NOT_VALID = (ext: string) => `This file isn't a valid .${ext}. Export it again as a real ${ext.toUpperCase()} and try again.`;
      const refused: Array<[string, Buffer, string]> = [
        ["sample_file.png", Buffer.from("png"), NOT_VALID("png")], // the old fixture: three letters
        ["sample.pdf", pngBytes(), NOT_VALID("pdf")],
        ["sample.pptx", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64)]), NOT_VALID("pptx")], // an executable under an Office name
        ["sample.pptx", ooxmlBytes("docx"), NOT_VALID("pptx")],
        ["sample.docx", ooxmlBytes("docx", { type: "application/vnd.ms-word.document.macroEnabled.main+xml" }), NOT_VALID("docx")],
        ["sample.odt", odfBytes("odp"), NOT_VALID("odt")],
        ["sample.csv", Buffer.from([0x61, 0x00, 0x62]), NOT_VALID("csv")],
        ["evil<script>.png", pdfBytes(), NOT_VALID("png")], // nothing of the name comes back
      ];
      for (const [name, bytes, message] of refused) {
        const res = await upload(who, name, bytes);
        expect([res.status, res.body.code, res.body.errormessage]).toEqual([400, "FILE_REJECTED", message]);
      }
      expect(uploadS3).not.toHaveBeenCalled();
      expect(db.created).toEqual([]);
    });
    it.each(IN_X)("%s: an archive that declares more than 10000 entries is refused (400) whatever else it holds, nothing stored", async (who) => {
      const flood = new AdmZip();
      flood.addFile("[Content_Types].xml", Buffer.from('<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'));
      for (let i = 1; i <= 10000; i++) flood.addFile(`ppt/media/e${i}.bin`, Buffer.alloc(0));
      const res = await upload(who, "flood.pptx", flood.toBuffer());
      expect([res.status, res.body.code, res.body.errormessage]).toEqual([400, "FILE_REJECTED", "This .pptx is damaged or unusually large inside. Re-save it and try again."]);
      expect(uploadS3).not.toHaveBeenCalled();
      expect(db.created).toEqual([]);
    });
    it.each(IN_X)("%s: an extension that is not on the list is refused (400), nothing stored", async (who) => {
      for (const name of ["sample.log", "sample.doc", "sample.zip", "sample.svg", "sample.html", "sample.exe", "sample.webp", "sample"]) {
        const res = await upload(who, name, pdfBytes());
        expect([res.status, res.body.code, res.body.errormessage]).toEqual([
          400,
          "FILE_REJECTED",
          "This file type isn't supported. You can upload mp4, mp3, jpg, png, gif, pdf, pptx, docx, xlsx, odp, odt or csv.",
        ]);
      }
      expect(uploadS3).not.toHaveBeenCalled();
      expect(db.created).toEqual([]);
    });
    it.each(IN_X)("%s: two files, no file, or a name of only spaces are refused (400) with a message that says what to send, nothing stored", async (who) => {
      const two = await request(app.getHttpServer())
        .post("/document/upload")
        .set("Authorization", callers[who])
        .set("Connection", "close")
        .attach("file", pngBytes(), "a.png")
        .attach("file2", pngBytes(), "b.png");
      expect([two.status, two.body.code, two.body.errormessage]).toEqual([400, "FILE_REJECTED", "Upload one file at a time."]);
      const post = () => request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).set("Connection", "close");
      const noFile: Array<[string, request.Test]> = [
        ["fields only", post().field("documenttitle", "no file here")],
        ["an empty POST", post()],
        ["a JSON body", post().send({ documenttitle: "no file here" })],
        ["a file part with no file name", post().attach("file", pngBytes(), "")],
      ];
      for (const [, req] of noFile) {
        const res = await req;
        expect([res.status, res.body.code, res.body.errormessage]).toEqual([400, "FILE_REJECTED", "Choose a file to upload."]);
      }
      const unnamed = await upload(who, "  ", pngBytes());
      expect([unnamed.status, unnamed.body.code, unnamed.body.errormessage]).toEqual([400, "FILE_REJECTED", "The file needs a name."]);
      expect(uploadS3).not.toHaveBeenCalled();
      expect(db.created).toEqual([]);
    });
    describe("a declared size over the limit is refused before the body is read", () => {
      // 201 MB declared, a few bytes sent, and a body multer would call malformed: only a check ahead of multer answers 413
      const declared = (who: Who, length: number | string) =>
        request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).set("Connection", "close")
          .set("Content-Type", "multipart/form-data").set("Content-Length", String(length)).send("tiny");
      it.each(IN_X)("%s: a Content-Length of 201 MB is 413 with the 200 MB wording, nothing stored or sent", async (who) => {
        const res = await declared(who, 201 * 1024 * 1024);
        expect([res.status, res.body.code, res.body.errormessage]).toEqual([413, "FILE_REJECTED", "This file is larger than 200 MB."]);
        expect(uploadS3).not.toHaveBeenCalled();
        expect(db.created).toEqual([]);
      });
      it.each(IN_X)("%s: a small request is not refused on its size: the same body without the declared 201 MB reaches multer (400)", async (who) => {
        const res = await request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).set("Connection", "close")
          .set("Content-Type", "multipart/form-data").send("tiny");
        expect(res.status).toBe(400); // multer's own answer to a body that is not multipart
        expect(res.body.errormessage).not.toBe("This file is larger than 200 MB.");
      });
      it("who may upload is decided first: a school-user token is 403, not 413", async () => {
        expect((await declared("a school-user token", 201 * 1024 * 1024)).status).toBe(403);
      });
    });
    it("the filter's 200 MB wording is bound to this route (the controller's own path)", () => {
      const joined = `/${Reflect.getMetadata("path", DocumentController)}/${Reflect.getMetadata("path", DocumentController.prototype.uploadFile)}`;
      expect(joined.replace(/\/+/g, "/")).toBe(DOCUMENT_UPLOAD_ROUTE);
    });
    it.each(IN_X)("%s: a title, licence or attribution that is not allowed is refused (400), nothing stored, and the message does not repeat it", async (who) => {
      const bad: Array<[Record<string, string>, string]> = [
        [{ documenttitle: "ក".repeat(256) }, "documenttitle"],
        [{ documenttitle: "a\u0000b" }, "documenttitle"],
        [{ documentlicence: "GPL-3.0" }, "documentlicence"],
        [{ documentlicence: "cc0-1.0" }, "documentlicence"],
        [{ documentattribution: "not json" }, "documentattribution"],
        [{ documentattribution: JSON.stringify({ v: 1, licence: "x" }) }, "documentattribution"],
        [{ documentattribution: JSON.stringify({ v: 1, sourceurl: "javascript:alert(1)" }) }, "documentattribution"],
        [{ documentattribution: JSON.stringify({ author: "no version" }) }, "documentattribution"],
      ];
      for (const [fields, field] of bad) {
        const res = await upload(who, "sample_file.png", pngBytes(), fields);
        expect(res.status).toBe(400);
        expect((res.body.fields ?? []).map((f: { field: string }) => f.field)).toEqual([field]);
        expect(JSON.stringify(res.body)).not.toContain("GPL");
        expect(JSON.stringify(res.body)).not.toContain("javascript");
      }
      expect(uploadS3).not.toHaveBeenCalled();
      expect(db.created).toEqual([]);
    });
    it.each(IN_X)("%s: the refusals name the field by its label, and keep its key in fields[]", async (who) => {
      const said = async (fields: Record<string, string>) => (await upload(who, "sample_file.png", pngBytes(), fields)).body.fields;
      expect(await said({ documentattribution: JSON.stringify({ v: 1, sourceurl: "javascript:alert(1)" }) })).toEqual([
        { field: "documentattribution", message: "The source address must start with http:// or https://." },
      ]);
      expect(await said({ documentattribution: JSON.stringify({ v: 1, adaptedfrom: 5 }) })).toEqual([
        { field: "documentattribution", message: "The adapted-from must be text." },
      ]);
      const twice = await request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).set("Connection", "close")
        .field("documenttitle", "one").field("documenttitle", "two").attach("file", pngBytes(), "sample_file.png");
      expect([twice.status, twice.body.fields]).toEqual([400, [{ field: "documenttitle", message: "Send the title once, as text." }]]);
      expect(db.created).toEqual([]);
    });
    it.each(IN_X)("%s: a file name that cannot be a title is refused unless a title is given", async (who) => {
      const long = `${"ក".repeat(256)}.png`;
      expect((await upload(who, long)).status).toBe(400);
      expect(db.created).toEqual([]);
      expect((await upload(who, long, pngBytes(), { documenttitle: KHMER_TITLE })).status).toBe(200);
      expect(db.createdIn("documents")[0].documenttitle).toBe(KHMER_TITLE);
    });
    it.each(IN_X)("%s: the browser's MIME type is not looked at", async (who) => {
      const res = await request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).set("Connection", "close")
        .attach("file", pdfBytes(), { filename: "sample.png", contentType: "image/png" });
      expect(res.status).toBe(400);
      const ok = await request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).set("Connection", "close")
        .attach("file", pngBytes(), { filename: "sample.png", contentType: "text/html" });
      expect(ok.status).toBe(200);
      expect(uploadS3).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), "image/png");
    });
    it.each(IN_X)("%s: one line is logged for an accepted upload: the type id and the bytes, and nothing of the file, title, key or owner", async (who) => {
      const info = jest.spyOn(Logger, "info").mockImplementation(() => Logger);
      const bytes = pngBytes();
      await upload(who, `${KHMER_TITLE}.png`, bytes, { documenttitle: KHMER_TITLE });
      expect(info.mock.calls).toEqual([["Document uploaded", { documenttypeid: 6, bytes: bytes.length }]]);
      info.mockClear();
      await upload(who, "sample.exe", pdfBytes());
      expect(info).not.toHaveBeenCalled();
    });
    it("a school-user token is refused (403) before anything is read or stored", async () => {
      const res = await upload("a school-user token", "sample_file.png");
      expect(res.status).toBe(403);
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
    it.each(IN_X)("%s: each row carries the title, licence and attribution", async (who) => {
      stored("documents", "documentid", TX.document).documenttitle = "ភ្នំពេញ";
      stored("documents", "documentid", TX.document).documentlicence = "CC0-1.0";
      stored("documents", "documentid", TX.document).documentattribution = { v: 1, author: "ក" };
      const rows = (await list(who)).body.data.data as Row[];
      const byId = (id: string) => rows.find((x) => x.documentid === id)!;
      expect(byId(TX.document)).toEqual({
        documentid: TX.document, documentname: `doc_${TX.tag}.png`, documenttypeid: 2, isdeleted: false, documenttags: [],
        documenttitle: "ភ្នំពេញ", documentlicence: "CC0-1.0", documentattribution: { v: 1, author: "ក" }, organisationid: X,
      });
      expect(byId(TX.document2)).toMatchObject({ documenttitle: null, documentattribution: null });
    });
    it.each(IN_X)("%s: a documentname filter finds a document by its key or by its title, and still nothing of another organisation", async (who) => {
      stored("documents", "documentid", TX.document).documenttitle = "ភ្នំពេញ";
      stored("documents", "documentid", TX.document2).documenttitle = "កម្ពុជា";
      stored("documents", "documentid", TY.document).documenttitle = "ភ្នំពេញ";
      expect(idsOf((await list(who, [{ key: "documentname", value: "ភ្នំ" }])).body.data.data, "documentid")).toEqual([TX.document]);
      expect(idsOf((await list(who, [{ key: "documentname", value: "doc2_tagx" }])).body.data.data, "documentid")).toEqual([TX.document2]);
      expect(idsOf((await list(who, [{ key: "documentname", value: "កម្ពុជា" }])).body.data.data, "documentid")).toEqual([TX.document2]);
      // comma-separated parts must each match the key or the title
      expect(idsOf((await list(who, [{ key: "documentname", value: "doc_tagx, ភ្នំ" }])).body.data.data, "documentid")).toEqual([TX.document]);
      expect(idsOf((await list(who, [{ key: "documentname", value: "doc_tagx, កម្ពុជា" }])).body.data.data, "documentid")).toEqual([]);
    });
    it.each(IN_X)("%s: a documenttags filter finds a document by a tag or part of one, never one it lacks, and nothing of another organisation", async (who) => {
      stored("documents", "documentid", TX.document).documenttags = ["demo", "ភ្នំពេញ"];
      stored("documents", "documentid", TX.document2).documenttags = ["other"];
      stored("documents", "documentid", TY.document).documenttags = ["demo", "ភ្នំពេញ"];
      stored("documents", "documentid", TU.document).documenttags = ["demo"];
      const found = async (value: string) => idsOf((await list(who, [{ key: "documenttags", value }])).body.data.data, "documentid");
      expect(await found("demo")).toEqual([TX.document]);
      expect(await found("dem")).toEqual([TX.document]);
      expect(await found("ភ្នំ")).toEqual([TX.document]);
      expect(await found("xyz")).toEqual([]);
      expect(await found("DEM")).toEqual([TX.document]);
      expect(await found("Demo")).toEqual([TX.document]);
      expect(await found("OTHER")).toEqual([TX.document2]);
      expect(await found("other")).toEqual([TX.document2]);
      // comma-separated parts must each be found in a tag
      expect(await found("demo, ភ្នំ")).toEqual([TX.document]);
      expect(await found("demo, other")).toEqual([]);
    });
    it.each(IN_X)("%s: a documenttags filter takes %, _, ! and a quote literally", async (who) => {
      stored("documents", "documentid", TX.document).documenttags = ['50%_off!', 'say "hi"'];
      stored("documents", "documentid", TX.document2).documenttags = ["500xoffx", "say hi"];
      const found = async (value: string) => idsOf((await list(who, [{ key: "documenttags", value }])).body.data.data, "documentid");
      expect(await found("50%")).toEqual([TX.document]);
      expect(await found("%")).toEqual([TX.document]);
      expect(await found("_")).toEqual([TX.document]);
      expect(await found("50%_off!")).toEqual([TX.document]);
      expect(await found("0_o")).toEqual([]);
      expect(await found("!")).toEqual([TX.document]);
      expect(await found('"hi"')).toEqual([TX.document]);
      expect(await found("x")).toEqual([TX.document2]);
    });
    it.each(IN_X)("%s: the documenttypeid filter is an exact match: type 1 does not return type 10", async (who) => {
      stored("documents", "documentid", TX.document).documenttypeid = 10;
      stored("documents", "documentid", TX.document2).documenttypeid = 1;
      expect(idsOf((await list(who, [{ key: "documenttypeid", value: "1" }])).body.data.data, "documentid")).toEqual([TX.document2]);
      expect(idsOf((await list(who, [{ key: "documenttypeid", value: "10" }])).body.data.data, "documentid")).toEqual([TX.document]);
      expect(idsOf((await list(who, [{ key: "documenttypeid", value: "1,10" }])).body.data.data, "documentid")).toEqual(sorted(TX.document, TX.document2));
      expect(idsOf((await list(who, [{ key: "documenttypeid", value: "2" }])).body.data.data, "documentid")).toEqual([]);
    });
    it.each(IN_X)("%s: a documenttypeid filter that is not ids is refused (400)", async (who) => {
      for (const value of ["abc", "1;2", "1,", "-1", "1 or 1"]) {
        expect((await list(who, [{ key: "documenttypeid", value }])).status).toBe(400);
      }
    });
    it("a platform user not acting: every document, owned or not", async () => {
      expect(idsOf((await list(NOT_ACTING)).body.data.data, "documentid")).toEqual(sorted(TX.document, TX.document2, TY.document, TY.document2, TU.document, TU.document2));
    });
  });

  describe("PUT /document/:documentid", () => {
    const KHMER_TITLE = "កម្ពុជា";
    const edit = (who: Who, id: string, body: object) => send(who, "put", `/document/${id}`, body);
    it.each(IN_X)("%s: edits X's document: title, licence and attribution, and nothing else", async (who) => {
      const before = { ...stored("documents", "documentid", TX.document) };
      const attribution = { v: 1, author: "ក្រុម", sourceurl: "https://example.org/x" };
      const res = await edit(who, TX.document, { documenttitle: `  ${KHMER_TITLE} `, documentlicence: "CC-BY-SA-3.0", documentattribution: attribution });
      expect([res.status, res.body]).toEqual([200, { error: false, data: true }]);
      const after = stored("documents", "documentid", TX.document);
      expect(after).toMatchObject({ documenttitle: KHMER_TITLE, documentlicence: "CC-BY-SA-3.0", documentattribution: attribution });
      for (const unchanged of ["documentname", "documenttypeid", "documents3meta", "documenttags", "organisationid", "isdeleted"]) {
        expect(after[unchanged]).toEqual(before[unchanged]);
      }
      expect(after.updated_by).toBe(who === "X's Organisation Admin" ? "oa" : who === "X's Admin" ? "ad" : "p");
    });
    it.each(IN_X)("%s: a blank title clears it, as the student API's import would normalise it", async (who) => {
      stored("documents", "documentid", TX.document).documenttitle = "មុន";
      expect((await edit(who, TX.document, { documenttitle: "   " })).status).toBe(200);
      expect(stored("documents", "documentid", TX.document).documenttitle).toBeNull();
    });
    it.each(IN_X)("%s: only the fields sent change", async (who) => {
      stored("documents", "documentid", TX.document).documenttitle = "មុន";
      stored("documents", "documentid", TX.document).documentlicence = "CC0-1.0";
      expect((await edit(who, TX.document, { documentlicence: "CC-BY-4.0" })).status).toBe(200);
      expect(stored("documents", "documentid", TX.document)).toMatchObject({ documenttitle: "មុន", documentlicence: "CC-BY-4.0" });
    });
    it.each(IN_X)("%s: null clears the title and the attribution; the licence is cleared by setting 'unspecified', and null is refused for it", async (who) => {
      Object.assign(stored("documents", "documentid", TX.document), { documenttitle: "មុន", documentlicence: "CC0-1.0", documentattribution: { v: 1, author: "x" } });
      expect((await edit(who, TX.document, { documenttitle: null, documentattribution: null })).status).toBe(200);
      expect(stored("documents", "documentid", TX.document)).toMatchObject({ documenttitle: null, documentattribution: null, documentlicence: "CC0-1.0" });
      const nullLicence = await refuses(who, "put", `/document/${TX.document}`, { documentlicence: null });
      expect([nullLicence.status, nullLicence.body.fields]).toEqual([400, [{ field: "documentlicence", message: "That licence isn't one of the allowed values." }]]);
      expect((await edit(who, TX.document, { documentlicence: "unspecified" })).status).toBe(200);
      expect(stored("documents", "documentid", TX.document).documentlicence).toBe("unspecified");
    });
    it.each(IN_X)("%s: Y's and an unowned document answer as an absent one does (404), changing nothing", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/document/${id}`, { documenttitle: "x" }), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: the absent answer comes first: a body that breaks the rules gets it too", async (who) => {
      expect(await asAbsent(who, "put", (id) => r(`/document/${id}`, { documentlicence: "nonsense", documenttypeid: 5 }), TY.document, TU.document)).toBe(404);
    });
    it.each(IN_X)("%s: a deleted document is as an absent one", async (who) => {
      stored("documents", "documentid", TX.document).isdeleted = true;
      expect((await refuses(who, "put", `/document/${TX.document}`, { documenttitle: "x" })).status).toBe(404);
    });
    it.each(IN_X)("%s: the document in the path is the one checked", async (who) => {
      expect(await asAbsentPath(who, "put", (id) => r(`/document/${id}`, { documenttitle: "x" }), "documentid", TX.document, TY.document)).toBe(404);
    });
    it.each(IN_X)("%s: a title, licence or attribution that is not allowed is refused (400), nothing changed, and the answer does not repeat it", async (who) => {
      const bad: Array<[object, string]> = [
        [{ documenttitle: "ក".repeat(256) }, "documenttitle"],
        [{ documenttitle: "a\nb" }, "documenttitle"],
        [{ documenttitle: 5 }, "documenttitle"],
        [{ documentlicence: "GPL-3.0" }, "documentlicence"],
        [{ documentlicence: "" }, "documentlicence"],
        [{ documentattribution: { v: 1, extra: "x" } }, "documentattribution"],
        [{ documentattribution: { v: 2 } }, "documentattribution"],
        [{ documentattribution: { v: 1, sourceurl: "ftp://example.org" } }, "documentattribution"],
        [{ documentattribution: "text" }, "documentattribution"],
      ];
      for (const [body, field] of bad) {
        const res = await refuses(who, "put", `/document/${TX.document}`, body);
        expect(res.status).toBe(400);
        expect((res.body.fields ?? []).map((f: { field: string }) => f.field)).toEqual([field]);
        expect(JSON.stringify(res.body)).not.toContain("GPL");
        expect(JSON.stringify(res.body)).not.toContain("ftp:");
      }
    });
    it.each(IN_X)("%s: the refusals name the field by its label, and keep its key in fields[]", async (who) => {
      const fieldsOf = async (body: object) => (await refuses(who, "put", `/document/${TX.document}`, body)).body.fields;
      expect(await fieldsOf({ documentattribution: { v: 1, sourceurl: "ftp://example.org" } })).toEqual([
        { field: "documentattribution", message: "The source address must start with http:// or https://." },
      ]);
      expect(await fieldsOf({ documentattribution: { v: 1, adaptedfrom: "a".repeat(1025) } })).toEqual([
        { field: "documentattribution", message: "The adapted-from is too long." },
      ]);
      expect(await fieldsOf({ documenttitle: 5 })).toEqual([{ field: "documenttitle", message: "The title must be text." }]);
      expect(await fieldsOf({ documentlicence: "GPL-3.0" })).toEqual([{ field: "documentlicence", message: "That licence isn't one of the allowed values." }]);
    });
    it.each(IN_X)("%s: the file, key, type, tags and owner cannot be sent: each field is refused (400), nothing changed", async (who) => {
      for (const field of ["documentname", "documenttypeid", "documents3meta", "documenttags", "organisationid", "isdeleted", "documentid"]) {
        const res = await refuses(who, "put", `/document/${TX.document}`, { documenttitle: "x", [field]: "y" });
        expect([res.status, res.body.fields]).toEqual([400, [{ field, message: "That field can't be changed here." }]]);
      }
    });
    it.each(IN_X)("%s: a body with nothing to change is refused (400)", async (who) => {
      expect((await refuses(who, "put", `/document/${TX.document}`, {})).status).toBe(400);
    });
    it("a platform user not acting: any document, as the other document routes allow", async () => {
      expect((await edit(NOT_ACTING, TY.document, { documenttitle: "ភ្នំពេញ" })).status).toBe(200);
      expect(stored("documents", "documentid", TY.document).documenttitle).toBe("ភ្នំពេញ");
    });
    it("a school-user token is refused (403), changing nothing", async () => {
      expect((await refuses("a school-user token", "put", `/document/${TX.document}`, { documenttitle: "x" })).status).toBe(403);
    });
    it("a server token is refused, changing nothing", async () => {
      expect([401, 403]).toContain((await refuses("a server token", "put", `/document/${TX.document}`, { documenttitle: "x" })).status);
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
    it.each(IN_X)("%s: the student API is asked with X's id in X-Organisation-Id", async (who) => {
      expect((await send(who, "get", `/curriculumbaseline/${TX.baseline}/download`)).status).toBe(200);
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect((axios.get as jest.Mock).mock.calls[0][0]).toMatch(new RegExp(`/curriculum/${TX.baseline}/getstudentresult$`));
      expect((axios.get as jest.Mock).mock.calls[0][1]).toEqual({ headers: { Authorization: Config.fortyk.api.serversynckey, "X-Organisation-Id": X } });
    });
    it.each([401, 403])("the student API answering %i is a 502 BAD_GATEWAY that names the student server, never the caller's 401 or 403 (edtech-lms-api#150)", async (upstream) => {
      (axios.get as jest.Mock).mockRejectedValue({
        isAxiosError: true,
        status: upstream,
        response: { status: upstream, data: { error: true, errormessage: "the sync key is wrong: secret-detail" } },
      });
      const res = await send(NOT_ACTING, "get", `/curriculumbaseline/${TU.baseline}/download`);
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(502);
      expect(JSON.parse(Buffer.isBuffer(res.body) ? res.body.toString("utf8") : JSON.stringify(res.body))).toMatchObject({
        code: "BAD_GATEWAY",
        errormessage: "The student server refused this server's request.",
      });
      expect(JSON.stringify(res.body)).not.toContain("secret-detail");
    });
    it("a platform user not acting: the student API is asked with X-Organisation-Id: platform", async () => {
      expect((await send(NOT_ACTING, "get", `/curriculumbaseline/${TU.baseline}/download`)).status).toBe(200);
      expect((axios.get as jest.Mock).mock.calls[0][1]).toEqual({ headers: { Authorization: Config.fortyk.api.serversynckey, "X-Organisation-Id": "platform" } });
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
  // ───────────────────── translations of content text (bilingual content) ─────────────────────
  // A translation belongs to the organisation that owns the row it translates. The row in the path is the one checked;
  // another organisation's row and an unowned one answer as an absent one does; the permission of the row's own kind
  // (update_lesson, update_question, ...) is asked first. The organisation's content language is what a translation differs from.
  describe("translations", () => {
    const OPT1 = "11111111-1111-4111-8111-111111111111-opt-1";
    const OPT2 = "22222222-2222-4222-8222-222222222222-opt-2";
    const DIS1 = "33333333-3333-4333-8333-333333333333";
    // a text the other specs already use (Khmer, with subscript marks); a translation keeps it byte for byte
    const KM_TEXT = "ពិពណ៌នា";
    const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
    const url = (table: string, id: string) => `/translations/${table}/${id}`;
    const lessonName = (t: Tree) => t.names.lesson + t.tag;
    const BODY = { language: "km", fields: { lessonname: KM_TEXT } };
    const translationsOf = (rows: Row[] = db.tables.contenttranslations) => rows.map((t) => ({ table: t.tablename, row: t.rowid, field: t.field, subkey: t.subkey, language: t.language, text: t.text }));
    const asUser = (permissions: string[], organisationid: string | null = X) =>
      bearer({ lmsuserid: "u", lmsuserroles: [Role.admin], permissions, organisationid, isplatform: false });
    const sendAs = (token: string, method: Method, path: string, body?: object) => {
      const r2 = request(app.getHttpServer())[method](path).set("Authorization", token).set("Connection", "close");
      return body ? r2.send(body) : r2;
    };
    const addTranslation = (t: Tree, table: string, rowid: string, field: string, subkey: string, language: string, text: string, base: string) =>
      db.add("contenttranslations", {
        translationid: uuid(Number(rowid.slice(-12)) * 10 + (field.length % 7) + (language === "km" ? 0 : 5) + subkey.length),
        organisationid: t.owner, tablename: table, rowid, field, subkey, language, text, sourcehash: sha(base), lastupdated: new Date("2026-10-01"),
      });

    beforeEach(() => {
      db.add("organisations", { organisationid: X, contentlanguage: "en" });
      db.add("organisations", { organisationid: Y, contentlanguage: "en" });
      for (const t of [TX, TY]) {
        const q = stored("questions", "questionid", t.question);
        q.questionheading = { headingtext: "Heading" };
        q.questionoptions = [
          { questionoptionid: OPT1, questionoptiontext: "Cat", questionoptioniscorrect: true, questionoptionsequence: 1 },
          { questionoptionid: OPT2, questionoptiontext: "Dog", questionoptioniscorrect: false, questionoptionsequence: 2, questionassociate: { questionoptionid: OPT2, questionassociatetext: "Bark" } },
        ];
        q.questiondistractors = [{ questiondistractorid: DIS1, questiondistractortext: "Fish" }];
        q.questionfeedback = { correctmessage: "Well done", incorrectmessage: "Try again" };
      }
    });

    describe("PUT /translations/:tablename/:rowid", () => {
      it.each(IN_X)("%s: saves a translation of X's lesson name in X's name, with the hash of the name as it is now", async (who) => {
        const res = await send(who, "put", url("lessons", TX.lesson), BODY);
        expect(res.status).toBe(200);
        expect(db.created).toHaveLength(1);
        expect(db.createdIn("contenttranslations")).toEqual([
          {
            translationid: expect.stringMatching(/^[0-9a-f-]{36}$/), organisationid: X, tablename: "lessons", rowid: TX.lesson, field: "lessonname", subkey: "",
            language: "km", text: KM_TEXT, sourcehash: sha(lessonName(TX)), lastupdated: expect.any(Date),
          },
        ]);
        expect(withoutReference(res.body)).toEqual({
          error: false,
          data: {
            tablename: "lessons", rowid: TX.lesson, contentlanguage: "en",
            translations: [expect.objectContaining({ field: "lessonname", subkey: "", language: "km", text: KM_TEXT, sourcehash: sha(lessonName(TX)), stale: false })],
          },
        });
      });
      it.each(IN_X)("%s: a question's option, partner, distractor, heading and feedback are translated by their ids, each with the hash of its own text", async (who) => {
        const fields = {
          [`questionoptiontext.${OPT1}`]: "Cat in km",
          [`questionassociatetext.${OPT2}`]: "Bark in km",
          [`questiondistractortext.${DIS1}`]: "Fish in km",
          headingtext: "Heading in km",
          "feedback.correctmessage": "Well done in km",
          "feedback.incorrectmessage": "Try again in km",
          questiontext: "Hello in km",
        };
        const res = await send(who, "put", url("questions", TX.question), { language: "km", fields });
        expect(res.status).toBe(200);
        const byKey = Object.fromEntries(db.createdIn("contenttranslations").map((t) => [t.subkey ? `${t.field}.${t.subkey}` : t.field, t]));
        expect(Object.keys(byKey).sort()).toEqual(Object.keys(fields).sort());
        expect(byKey[`questionoptiontext.${OPT1}`]).toMatchObject({ organisationid: X, tablename: "questions", rowid: TX.question, text: "Cat in km", sourcehash: sha("Cat") });
        expect(byKey[`questionassociatetext.${OPT2}`]).toMatchObject({ sourcehash: sha("Bark") });
        expect(byKey[`questiondistractortext.${DIS1}`]).toMatchObject({ sourcehash: sha("Fish") });
        expect(byKey.headingtext).toMatchObject({ sourcehash: sha("Heading") });
        expect(byKey["feedback.correctmessage"]).toMatchObject({ sourcehash: sha("Well done") });
        expect(byKey["feedback.incorrectmessage"]).toMatchObject({ sourcehash: sha("Try again") });
        expect(byKey.questiontext).toMatchObject({ sourcehash: sha("សួស្តី") });
      });
      it.each(IN_X)("%s: saving again updates the row in place (the same id) with the new text and the hash of the text now", async (who) => {
        await send(who, "put", url("lessons", TX.lesson), BODY);
        const first = { ...db.tables.contenttranslations[0] };
        stored("lessons", "lessonid", TX.lesson).lessonname = "Renamed";
        const res = await send(who, "put", url("lessons", TX.lesson), { language: "km", fields: { lessonname: "Second text" } });
        expect(res.status).toBe(200);
        expect(db.tables.contenttranslations).toHaveLength(1);
        expect(db.created).toHaveLength(1);
        expect(db.tables.contenttranslations[0]).toMatchObject({ translationid: first.translationid, text: "Second text", sourcehash: sha("Renamed") });
        expect(res.body.data.translations[0].stale).toBe(false);
      });
      it.each(IN_X)("%s: Y's lesson and an unowned lesson answer as an absent one does, nothing written", async (who) => {
        expect(await asAbsent(who, "put", (id) => r(url("lessons", id), BODY), TY.lesson, TU.lesson)).toBe(404);
        expect(await asAbsent(who, "put", (id) => r(url("questions", id), { language: "km", fields: { questiontext: "x" } }), TY.question, TU.question)).toBe(404);
      });
      it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
        expect(await asAbsentPath(who, "put", (id) => r(url("lessons", id), BODY), "rowid", TX.lesson, TY.lesson)).toBe(404);
      });
      it.each(IN_X)("%s: a deleted lesson answers as an absent one does", async (who) => {
        stored("lessons", "lessonid", TX.lesson).isdeleted = true;
        const res = await refuses(who, "put", url("lessons", TX.lesson), BODY);
        expect(res.status).toBe(404);
      });
      it("a platform user not acting: Y's lesson is translated under Y; an unowned lesson is refused (400), nothing written", async () => {
        const res = await send(NOT_ACTING, "put", url("lessons", TY.lesson), BODY);
        expect(res.status).toBe(200);
        expect(db.createdIn("contenttranslations")).toEqual([expect.objectContaining({ organisationid: Y, rowid: TY.lesson, sourcehash: sha(lessonName(TY)) })]);
        const refused = await refuses(NOT_ACTING, "put", url("lessons", TU.lesson), BODY);
        expect(refused.status).toBe(400);
      });
      it.each(IN_X)("%s: an organisation with no content language is refused (400), nothing written", async (who) => {
        stored("organisations", "organisationid", X).contentlanguage = null;
        const res = await refuses(who, "put", url("lessons", TX.lesson), BODY);
        expect(res.status).toBe(400);
        expect(res.body.errormessage).toBe("Set the organisation's content language first.");
      });
      it.each([["en"], ["EN"], ["En"]])("the organisation's own content language (%s, in any case) is refused (400), nothing written", async (language) => {
        const res = await refuses("X's Organisation Admin", "put", url("lessons", TX.lesson), { language, fields: { lessonname: "x" } });
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "language", message: "That is the organisation's own content language: its text is the row's own text, not a translation." }]);
      });
      it("a language is stored as its primary subtag in lower case", async () => {
        await send("X's Organisation Admin", "put", url("lessons", TX.lesson), { language: "KM", fields: { lessonname: "x" } });
        await send("X's Organisation Admin", "put", url("lessons", TX.lesson2), { language: "PT-BR", fields: { lessonname: "x" } });
        expect(db.createdIn("contenttranslations").map((t) => t.language)).toEqual(["km", "pt-BR"]);
      });
      it.each([
        [21, "questionoptiontext", `questionoptiontext.${OPT1}`],
        [21, "questiontext", "questiontext"],
        [8, "questiontext", "questiontext"],
        [23, "questiontext", "questiontext"],
      ])("a text an answer is graded by is refused (400), nothing written: template %s %s", async (template, _field, key) => {
        stored("questions", "questionid", TX.question).templatetypeid = template;
        const res = await refuses("X's Organisation Admin", "put", url("questions", TX.question), { language: "km", fields: { [key]: "x" } });
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: `fields.${key}`, message: "A text that an answer is graded by can't be translated." }]);
      });
      it("the option text of template 23 and of a template that grades by id is translatable", async () => {
        stored("questions", "questionid", TX.question).templatetypeid = 23;
        expect((await send("X's Organisation Admin", "put", url("questions", TX.question), { language: "km", fields: { [`questionoptiontext.${OPT1}`]: "x" } })).status).toBe(200);
      });
      it.each([
        ["a field that is not on the list", { lessonstatus: "x" }],
        ["a subkey on a plain field", { "lessonname.extra": "x" }],
        ["an empty text", { lessonname: "" }],
        ["a text of more than 65535 bytes", { lessonname: "x".repeat(65536) }],
        ["a lesson with no description to translate", { lessondescription: "x" }],
      ])("%s is refused (400), nothing written", async (_what, fields) => {
        // the second lesson of the tree has no description
        const target = _what === "a lesson with no description to translate" ? TX.lesson2 : TX.lesson;
        const res = await refuses("X's Organisation Admin", "put", url("lessons", target), { language: "km", fields });
        expect(res.status).toBe(400);
      });
      it.each([
        ["an option the question does not have", { "questionoptiontext.nope": "x" }],
        ["an option with no id named", { questionoptiontext: "x" }],
        ["a feedback message that does not exist", { "feedback.otherkey": "x" }],
        ["feedback with no message named", { feedback: "x" }],
        ["a subkey longer than 64 characters", { [`questionoptiontext.${"a".repeat(65)}`]: "x" }],
        ["a partner of an option that has none", { [`questionassociatetext.${OPT1}`]: "x" }],
        ["a distractor the question does not have", { "questiondistractortext.nope": "x" }],
      ])("a question's %s is refused (400), nothing written", async (_what, fields) => {
        const res = await refuses("X's Organisation Admin", "put", url("questions", TX.question), { language: "km", fields });
        expect(res.status).toBe(400);
      });
      it("a request that translates one text wrongly saves none of the others", async () => {
        const res = await refuses("X's Organisation Admin", "put", url("questions", TX.question), { language: "km", fields: { headingtext: "ok", "feedback.otherkey": "x" } });
        expect(res.status).toBe(400);
      });
      it.each([
        [{ language: "x", fields: { lessonname: "x" } }],
        [{ language: "km" }],
        [{ language: "km", fields: {} }],
        [{ fields: { lessonname: "x" } }],
        [{ language: "km", fields: { lessonname: 5 } }],
        [{ language: "km", fields: { lessonname: "x" }, organisationid: Y }],
      ])("a malformed body %j is refused (400), nothing written", async (body) => {
        const res = await refuses("X's Organisation Admin", "put", url("lessons", TX.lesson), body);
        expect(res.status).toBe(400);
      });
      it("a table that is not translatable, and an id that is not an id, are refused (400)", async () => {
        expect((await refuses("X's Organisation Admin", "put", url("documents", TX.document), BODY)).status).toBe(400);
        expect((await refuses("X's Organisation Admin", "put", url("lessons", "not-an-id"), BODY)).status).toBe(400);
      });
      it("a body naming __proto__ is refused, nothing written", async () => {
        const res = await refuses("X's Organisation Admin", "put", url("lessons", TX.lesson), JSON.parse('{"language":"km","fields":{"__proto__":"x"}}'));
        expect(res.status).toBe(400);
      });
      it("the permission of the row's own kind is asked: update_lesson allows a lesson (200) and not a question (403), and update_question the reverse", async () => {
        const lessonEditor = asUser(["update_lesson"]);
        expect((await sendAs(lessonEditor, "put", url("lessons", TX.lesson), BODY)).status).toBe(200);
        const before = db.snapshot();
        const refused = await sendAs(lessonEditor, "put", url("questions", TX.question), { language: "km", fields: { questiontext: "x" } });
        expect(refused.status).toBe(403);
        expect(db.snapshot()).toEqual(before);
        const questionEditor = asUser(["update_question"]);
        expect((await sendAs(questionEditor, "put", url("questions", TX.question), { language: "km", fields: { headingtext: "x" } })).status).toBe(200);
        expect((await sendAs(questionEditor, "put", url("lessons", TX.lesson2), BODY)).status).toBe(403);
      });
      it("a lesson plan is translated with the learning-item permission, as the plan routes are written", async () => {
        const res = await sendAs(asUser(["update_lessonlearning"]), "put", url("lessonplans", TX.plan), { language: "km", fields: { lessonplanname: "x" } });
        expect(res.status).toBe(200);
        expect(db.createdIn("contenttranslations")).toEqual([expect.objectContaining({ tablename: "lessonplans", field: "lessonplanname", sourcehash: sha("Plan " + TX.tag) })]);
      });
      it("a staff user who may only view is refused (403) before the row is looked up: an absent id and a real one answer alike", async () => {
        const viewer = asUser(["view_lesson", "view_question"]);
        const real = await sendAs(viewer, "put", url("lessons", TX.lesson), BODY);
        const absent = await sendAs(viewer, "put", url("lessons", MISSING), BODY);
        expect(real.status).toBe(403);
        expect(said(absent)).toEqual(said(real));
        expect(db.created).toEqual([]);
      });
      it("a school-user token and the server token are refused, nothing written", async () => {
        for (const who of ["a school-user token", "a server token"] as Who[]) {
          const res = await refuses(who, "put", url("lessons", TX.lesson), BODY);
          expect([401, 403]).toContain(res.status);
        }
      });
    });

    describe("GET /translations/:tablename/:rowid", () => {
      beforeEach(() => {
        addTranslation(TX, "lessons", TX.lesson, "lessonname", "", "km", KM_TEXT, lessonName(TX));
        addTranslation(TX, "lessons", TX.lesson, "lessonname", "", "fr", "Leçon", lessonName(TX));
        addTranslation(TX, "lessons", TX.lesson, "lessondescription", "", "km", "x", "ពិពណ៌នា");
        addTranslation(TX, "lessons", TX.lesson2, "lessonname", "", "km", "other lesson", "Second " + TX.tag);
        addTranslation(TY, "lessons", TY.lesson, "lessonname", "", "km", "Y's", lessonName(TY));
      });
      it.each(IN_X)("%s: lists the row's translations in every language, none of another row's or another organisation's", async (who) => {
        const res = await send(who, "get", url("lessons", TX.lesson));
        expect(res.status).toBe(200);
        expect(res.body.data.contentlanguage).toBe("en");
        expect(res.body.data.translations.map((t: Row) => [t.language, t.field, t.text, t.stale])).toEqual([
          ["fr", "lessonname", "Leçon", false],
          ["km", "lessondescription", "x", false],
          ["km", "lessonname", KM_TEXT, false],
        ]);
        expect(JSON.stringify(res.body)).not.toContain("Y's");
        expect(JSON.stringify(res.body)).not.toContain("other lesson");
      });
      it.each(IN_X)("%s: a translation whose text has changed is stale, and one whose text is unchanged is not", async (who) => {
        stored("lessons", "lessonid", TX.lesson).lessonname = "Renamed";
        const res = await send(who, "get", url("lessons", TX.lesson));
        expect(res.body.data.translations.map((t: Row) => [t.language, t.field, t.stale])).toEqual([
          ["fr", "lessonname", true],
          ["km", "lessondescription", false],
          ["km", "lessonname", true],
        ]);
      });
      it.each(IN_X)("%s: Y's lesson and an unowned lesson answer as an absent one does", async (who) => {
        expect(await asAbsent(who, "get", (id) => r(url("lessons", id)), TY.lesson, TU.lesson)).toBe(404);
      });
      it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
        expect(await asAbsentPath(who, "get", (id) => r(url("lessons", id)), "rowid", TX.lesson, TY.lesson)).toBe(404);
      });
      it("a translation of an option that has since been removed is stale", async () => {
        addTranslation(TX, "questions", TX.question, "questionoptiontext", OPT1, "km", "Cat in km", "Cat");
        addTranslation(TX, "questions", TX.question, "questionoptiontext", OPT2, "km", "Dog in km", "Dog");
        const q = stored("questions", "questionid", TX.question);
        q.questionoptions = (q.questionoptions as Row[]).filter((o) => o.questionoptionid !== OPT2);
        const res = await send("X's Organisation Admin", "get", url("questions", TX.question));
        expect(res.body.data.translations.map((t: Row) => [t.subkey, t.stale])).toEqual([[OPT1, false], [OPT2, true]]);
      });
      it("a platform user not acting reads any organisation's row, an unowned row has none", async () => {
        const y = await send(NOT_ACTING, "get", url("lessons", TY.lesson));
        expect(y.body.data.translations.map((t: Row) => t.text)).toEqual(["Y's"]);
        const unowned = await send(NOT_ACTING, "get", url("lessons", TU.lesson));
        expect(unowned.body.data).toEqual({ tablename: "lessons", rowid: TU.lesson, contentlanguage: null, translations: [] });
      });
      it("the view permission of the row's own kind is asked (403 without it)", async () => {
        expect((await sendAs(asUser(["view_lesson"]), "get", url("lessons", TX.lesson))).status).toBe(200);
        expect((await sendAs(asUser(["view_lesson"]), "get", url("questions", TX.question))).status).toBe(403);
        expect((await sendAs(asUser(["update_lesson"]), "get", url("lessons", TX.lesson))).status).toBe(403);
      });
      it("a school-user token and the server token are refused", async () => {
        for (const who of ["a school-user token", "a server token"] as Who[]) {
          expect([401, 403]).toContain((await send(who, "get", url("lessons", TX.lesson))).status);
        }
      });
    });

    describe("DELETE /translations/:tablename/:rowid/:language", () => {
      beforeEach(() => {
        addTranslation(TX, "lessons", TX.lesson, "lessonname", "", "km", KM_TEXT, lessonName(TX));
        addTranslation(TX, "lessons", TX.lesson, "lessondescription", "", "km", "x", "ពិពណ៌នា");
        addTranslation(TX, "lessons", TX.lesson, "lessonname", "", "fr", "Leçon", lessonName(TX));
        addTranslation(TX, "lessons", TX.lesson2, "lessonname", "", "km", "other lesson", "Second " + TX.tag);
        addTranslation(TY, "lessons", TY.lesson, "lessonname", "", "km", "Y's", lessonName(TY));
      });
      it.each(IN_X)("%s: removes every translation of the row in that language, and nothing else", async (who) => {
        const res = await send(who, "delete", `${url("lessons", TX.lesson)}/km`);
        expect(res.status).toBe(200);
        expect(withoutReference(res.body)).toEqual({ error: false, data: { tablename: "lessons", rowid: TX.lesson, language: "km", deleted: 2 } });
        expect(translationsOf().map((t) => [t.row, t.language])).toEqual([
          [TX.lesson, "fr"],
          [TX.lesson2, "km"],
          [TY.lesson, "km"],
        ]);
      });
      it("a language in capitals names the stored one; deleting none is not an error", async () => {
        expect((await send("X's Organisation Admin", "delete", `${url("lessons", TX.lesson)}/KM`)).body.data.deleted).toBe(2);
        const none = await refuses("X's Organisation Admin", "delete", `${url("lessons", TX.lesson)}/de`);
        expect(none.status).toBe(200);
        expect(none.body.data.deleted).toBe(0);
      });
      it.each(IN_X)("%s: Y's lesson and an unowned lesson answer as an absent one does, nothing deleted", async (who) => {
        expect(await asAbsent(who, "delete", (id) => r(`${url("lessons", id)}/km`), TY.lesson, TU.lesson)).toBe(404);
      });
      it.each(IN_X)("%s: the row in the path is the one checked", async (who) => {
        expect(await asAbsentPath(who, "delete", (id) => r(`${url("lessons", id)}/km`), "rowid", TX.lesson, TY.lesson)).toBe(404);
      });
      it("a platform user not acting deletes any organisation's", async () => {
        expect((await send(NOT_ACTING, "delete", `${url("lessons", TY.lesson)}/km`)).body.data.deleted).toBe(1);
        expect(translationsOf().filter((t) => t.row === TY.lesson)).toEqual([]);
      });
      it("the update permission of the row's own kind is asked (403 without it), nothing deleted", async () => {
        const before = db.snapshot();
        expect((await sendAs(asUser(["view_lesson"]), "delete", `${url("lessons", TX.lesson)}/km`)).status).toBe(403);
        expect((await sendAs(asUser(["update_question"]), "delete", `${url("lessons", TX.lesson)}/km`)).status).toBe(403);
        expect(db.snapshot()).toEqual(before);
        expect((await sendAs(asUser(["update_lesson"]), "delete", `${url("lessons", TX.lesson)}/km`)).status).toBe(200);
      });
      it("a school-user token and the server token are refused, nothing deleted", async () => {
        for (const who of ["a school-user token", "a server token"] as Who[]) {
          const res = await refuses(who, "delete", `${url("lessons", TX.lesson)}/km`);
          expect([401, 403]).toContain(res.status);
        }
      });
    });
  });


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


  // ───────────────────── the owning organisation on every list row ─────────────────────
  // The admin's platform view shows which organisation owns each row and can narrow a list to one organisation.
  describe("the owning organisation on the rows of a list", () => {
    type Listing = { name: string; path: string; key: string; owned: (t: Tree) => string[] };
    const LISTS: Listing[] = [
      { name: "POST /document", path: "/document", key: "documentid", owned: (t) => [t.document, t.document2] },
      { name: "POST /documenttag", path: "/documenttag", key: "documenttagid", owned: (t) => [t.documentTag] },
      { name: "POST /questiontag", path: "/questiontag", key: "questiontagid", owned: (t) => [t.questionTag] },
      { name: "POST /curriculum", path: "/curriculum", key: "curriculumid", owned: (t) => [t.curriculum, t.curriculum2] },
      { name: "POST /subject", path: "/subject", key: "subjectid", owned: (t) => [t.subject, t.subject2] },
      { name: "POST /question", path: "/question", key: "questionid", owned: (t) => [t.question, t.question2] },
      { name: "POST /question/search", path: "/question/search", key: "questionid", owned: (t) => [t.question, t.question2] },
      { name: "POST /grade", path: "/grade", key: "gradeid", owned: (t) => [t.grade, t.grade2] },
      { name: "POST /level", path: "/level", key: "levelid", owned: (t) => [t.level, t.level2] },
      { name: "POST /feedback", path: "/feedback", key: "feedbackid", owned: (t) => [t.feedback] },
    ];
    const ownerOfRows = (rows: Row[], key: string) => Object.fromEntries(rows.map((r) => [r[key] as string, r.organisationid]));
    const listOf = (who: Who, path: string, filter: object[] = []) => send(who, "post", path, { pageindex: 1, pagesize: 50, filter });
    /** What an organisation filter may not be: one organisation id, nothing else. A refusal, never "no filter". */
    const NOT_ONE_ID: Array<[string, unknown]> = [
      ["blank", "   "],
      ["empty", ""],
      ["a list holding an id", [Y]],
      ["an empty list", []],
      ["an object", {}],
      ["a list holding an object", [{}]],
      ["a number", 5],
      ["text that is not an id", "not-an-organisation-id"],
    ];

    describe.each(LISTS)("$name", ({ path, key, owned }) => {
      it.each(IN_X)("%s: every row names X as its owner", async (who) => {
        const res = await listOf(who, path);
        expect(res.status).toBe(200);
        expect(ownerOfRows(res.body.data.data, key)).toEqual(Object.fromEntries(owned(TX).map((id) => [id, X])));
      });
      it("a platform user not acting: each row names its own owner, and none for an unowned row", async () => {
        const res = await listOf(NOT_ACTING, path);
        expect(res.status).toBe(200);
        expect(ownerOfRows(res.body.data.data, key)).toEqual({
          ...Object.fromEntries(owned(TX).map((id) => [id, X])),
          ...Object.fromEntries(owned(TY).map((id) => [id, Y])),
          ...Object.fromEntries(owned(TU).map((id) => [id, null])),
        });
      });
      it("a platform user not acting: an organisation filter narrows the list to that organisation's rows, and the total with it", async () => {
        const res = await listOf(NOT_ACTING, path, [{ key: "organisationid", value: Y }]);
        expect(res.status).toBe(200);
        expect(idsOf(res.body.data.data, key)).toEqual(sorted(...owned(TY)));
        expect(res.body.data.total).toBe(owned(TY).length);
        expect(idsOf((await listOf(NOT_ACTING, path, [{ key: "organisationid", value: X }])).body.data.data, key)).toEqual(sorted(...owned(TX)));
      });
      it.each(NOT_ONE_ID)("an organisation filter that is %s is refused (400), for the platform too, and lists nothing", async (what, value) => {
        // (The feedback list's request rule is switched off on main, so only the business class's strictness applies to it:
        // text that is a well-formed string but no organisation lists nothing there.)
        if (path === "/feedback" && what === "text that is not an id") {
          expect((await listOf(NOT_ACTING, path, [{ key: "organisationid", value }])).body.data.data).toEqual([]);
          return;
        }
        for (const who of [NOT_ACTING, ...IN_X]) {
          const res = await listOf(who, path, [{ key: "organisationid", value }]);
          expect(res.status).toBe(400);
          expect(res.body.data).toBe(false);
        }
      });
      it("a platform user not acting: an organisation that does not exist leaves nothing", async () => {
        const res = await listOf(NOT_ACTING, path, [{ key: "organisationid", value: MISSING }]);
        expect(res.status).toBe(200);
        expect(res.body.data.data).toEqual([]);
      });
      it.each(IN_X)("%s: the filter can only narrow the list, never widen it (another organisation's id leaves nothing)", async (who) => {
        expect(idsOf((await listOf(who, path, [{ key: "organisationid", value: Y }])).body.data.data, key)).toEqual([]);
        expect(idsOf((await listOf(who, path, [{ key: "organisationid", value: X }])).body.data.data, key)).toEqual(sorted(...owned(TX)));
      });
    });

    // Lessons carry their owner but have no organisation filter: the admin narrows its whole lesson list itself.
    describe("POST /lesson", () => {
      it.each(IN_X)("%s: every lesson names X as its owner", async (who) => {
        const res = await listOf(who, "/lesson");
        expect(res.status).toBe(200);
        expect(ownerOfRows(res.body.data.data, "lessonid")).toEqual({ [TX.lesson]: X, [TX.lesson2]: X });
      });
      it("a platform user not acting: each lesson names the owner of its curriculum (none for an unowned one)", async () => {
        const res = await listOf(NOT_ACTING, "/lesson");
        expect(ownerOfRows(res.body.data.data, "lessonid")).toEqual({
          [TX.lesson]: X, [TX.lesson2]: X, [TY.lesson]: Y, [TY.lesson2]: Y, [TU.lesson]: null, [TU.lesson2]: null,
        });
      });
    });

    describe("GET /curriculumbaseline/all", () => {
      it.each(IN_X)("%s: every baseline names X as its owner", async (who) => {
        const res = await send(who, "get", "/curriculumbaseline/all");
        expect(res.status).toBe(200);
        expect(ownerOfRows(res.body.data, "curriculumbaselineid")).toEqual({ [TX.baseline]: X, [TX.baseline2]: X });
      });
      it("a platform user not acting: each baseline names its owner", async () => {
        const res = await send(NOT_ACTING, "get", "/curriculumbaseline/all");
        expect(ownerOfRows(res.body.data, "curriculumbaselineid")).toEqual({
          [TX.baseline]: X, [TX.baseline2]: X, [TY.baseline]: Y, [TY.baseline2]: Y, [TU.baseline]: null, [TU.baseline2]: null,
        });
      });
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
});
