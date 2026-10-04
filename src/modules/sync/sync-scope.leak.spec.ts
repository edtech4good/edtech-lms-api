import AdmZip from "adm-zip";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import axios from "axios";
import FormData from "form-data";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { contentProblems, TABLE_KEYS, HEADER_KEYS } from "src/test-support/student-api-content-contract";
import { StudentController } from "../students/student.controller";
import { TeacherController } from "../teachers/teacher.controller";
import { SyncController } from "./sync.controller";

/**
 * The content sync is one organisation's: `GET sync/content` and `POST sync/cloud` (format 3), `GET sync` (the
 * older shape), `POST sync/cloud/:schoolname/students`, and the roster pushes of `?cloud=true`. Driven over real
 * HTTP through the real strategy, guards, controllers and business classes; replaced are the models (an in-memory
 * copy of the tables), the token lookup and the cloud server (axios).
 *
 * Fixtures: organisations X and Y each have two schools (one in a country the organisation is linked to, one in a
 * country nobody is linked to), a class, a learner and a teacher, and a full content tree (subject, curriculum, grade,
 * level, lesson, practice, quiz, learning and plan with documents, questions and their attach rows, a level quiz
 * question, a baseline with a question); a third tree has no organisation (legacy content).
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

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MISSING_ORGANISATION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CODE = { [X]: "xorg", [Y]: "yorg" } as const;
const C_X = uuid(101); // linked to X
const C_Y = uuid(102); // linked to Y
const C_FREE = uuid(103); // linked to nobody, named by one school of each organisation
const C_FREE_Y = uuid(104);
const C_U = uuid(105);
const MISSING = uuid(999999);

type Owner = string | null;
const treeOf = (owner: Owner, base: number, country: string, freeCountry: string) => {
  const id = (n: number) => uuid(base + n);
  return {
    owner, country, freeCountry,
    subject: id(1), curriculum: id(2), grade: id(3), level: id(4), lesson: id(5), practice: id(6), quiz: id(7),
    learning: id(8), plan: id(9), document: id(10), document2: id(11), question: id(12), question2: id(13),
    practiceQuestion: id(14), quizQuestion: id(15), levelQuestion: id(16), baseline: id(17), baselineQuestion: id(18),
    school: id(20), school2: id(21), standard: id(22), login: id(23), student: id(24), teacherLogin: id(25),
    names: { school: "សាលា " + base, school2: "សាលាទី២ " + base, curriculum: "ភាសាខ្មែរ " + base },
  };
};
type Tree = ReturnType<typeof treeOf>;
const TX = treeOf(X, 1000, C_X, C_FREE);
const TY = treeOf(Y, 2000, C_Y, C_FREE_Y);
const TU = treeOf(null, 3000, C_U, C_U);

const db = new ContentFake();
const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002];
const callers = {
  "X's Organisation Admin": bearer({ lmsuserid: "oa", lmsuserroles: [Role.organisationadmin], permissions: PERMS, organisationid: X, isplatform: false }),
  "X's Admin": bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false }),
  "a platform user acting as X": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: X, isplatform: true }),
  "a platform user not acting": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: null, isplatform: true }),
  "a server token": `Bearer ${Config.fortyk.api.applicationapikey}`,
  "a school-user token": bearer({ schooluserid: uuid(499), schooluserrole: SchoolRole.TEACHER }),
} as const;
type Who = keyof typeof callers;
const IN_X: Who[] = ["X's Organisation Admin", "X's Admin", "a platform user acting as X"];
const PUSHERS_IN_X: Who[] = ["X's Admin", "a platform user acting as X"];
const NOT_ACTING: Who = "a platform user not acting";

type Row = Record<string, unknown>;
type Method = "get" | "post" | "put" | "delete";
const ids = (rows: Row[], key: string) => rows.map((r) => r[key] as string).sort();
const sorted = (...list: string[]) => [...list].sort();
const withoutReference = (body: Row) => {
  const { reference, logid, stack, ...rest } = body;
  return rest;
};

const textOf = (res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};
const unzip = (zip: Buffer, entry: string) => new AdmZip(zip).readAsText(entry);

const seedTree = (t: Tree) => {
  const o = t.owner;
  const tag = String(t.subject).slice(-4);
  db.add("subjects", { subjectid: t.subject, subjectname: "វិទ្យាសាស្ត្រ " + tag, organisationid: o, subjectstatus: true });
  db.add("curriculums", { curriculumid: t.curriculum, curriculumname: t.names.curriculum, organisationid: o, subjectid: t.subject, curriculumstatus: true });
  db.add("grades", { gradeid: t.grade, gradename: "ថ្នាក់ " + tag, gradeorder: 1, gradestatus: true, curriculumid: t.curriculum });
  db.add("levels", { levelid: t.level, levelname: "កម្រិត " + tag, levelorder: 1, levelstatus: true, gradeid: t.grade });
  db.add("lessons", { lessonid: t.lesson, lessonname: "មេរៀន " + tag, lessonorder: 1, lessonstatus: true, levelid: t.level });
  db.add("lessonpractices", { lessonpracticeid: t.practice, lessonid: t.lesson, lessonpracticename: "Practice " + tag, lessonpracticeorder: 1, lessonpracticestatus: true });
  db.add("lessonquizzes", { lessonquizid: t.quiz, lessonid: t.lesson, lessonquizname: "Quiz " + tag, lessonquizorder: 1, lessonquizstatus: true });
  db.add("documents", { documentid: t.document, documentname: `doc_${tag}.png`, documenttypeid: 1, organisationid: o, documenttags: [] });
  db.add("documents", { documentid: t.document2, documentname: `doc2_${tag}.png`, documenttypeid: 1, organisationid: o, documenttags: [] });
  db.add("lessonlearnings", { lessonlearningid: t.learning, lessonid: t.lesson, documentid: t.document, lessonlearningname: "Learning " + tag, lessonlearningorder: 1, lessonlearningstatus: true });
  db.add("lessonplans", { lessonplanid: t.plan, lessonid: t.lesson, documentid: t.document2, lessonplanname: "Plan " + tag, lessonplanorder: 1, lessonplanstatus: true });
  db.add("questions", { questionid: t.question, questionidentifier: `qi-${tag}`, questiontext: "សួស្តី", templatetypeid: 1, organisationid: o, questionstatus: true });
  db.add("questions", { questionid: t.question2, questionidentifier: `qi2-${tag}`, questiontext: "សួស្តី", templatetypeid: 1, organisationid: o, questionstatus: true });
  db.add("lessonpracticequestions", { lessonpracticequestionid: t.practiceQuestion, lessonpracticeid: t.practice, questionid: t.question, lessonpracticequestionorder: 1, lessonpracticequestionstatus: true });
  db.add("lessonquizquestions", { lessonquizquestionid: t.quizQuestion, lessonquizid: t.quiz, questionid: t.question2, lessonquizquestionorder: 1, lessonquizquestionstatus: true });
  db.add("levelquizquestions", { levelquizquestionid: t.levelQuestion, levelid: t.level, questionid: t.question, lessonid: t.lesson, levelquizquestionorder: 1, levelquizquestionstatus: true });
  db.add("curriculumbaseline", { curriculumbaselineid: t.baseline, curriculumid: t.curriculum, baselineid: t.curriculum, baselinename: "Baseline " + tag, baselinetype: 1, baselinestatus: true, schoolid: [], created_by: null });
  db.add("baselinequestion", { baselinequestionid: t.baselineQuestion, curriculumbaselineid: t.baseline, questionid: t.question, baselinequestionorder: 1, baselinequestionstatus: true });
  db.add("schools", { schoolid: t.school, schoolname: t.names.school, organisationid: o, countryid: t.country, curriculums: [t.curriculum] });
  db.add("schools", { schoolid: t.school2, schoolname: t.names.school2, organisationid: o, countryid: t.freeCountry, curriculums: [] });
  db.add("standards", { standardid: t.standard, standardname: "ថ្នាក់ទី១", schoolid: t.school, schoolname: t.names.school });
  db.add("schoolusers", {
    schooluserid: t.login, schoolusername: "learner" + tag, schooluserrole: SchoolRole.STUDENT, schoolid: t.school, schoolname: t.names.school,
    schooluserstatus: true, schooluserpasswordhash: "hash",
  });
  db.add("schoolusers", {
    schooluserid: t.teacherLogin, schoolusername: "teacher" + tag, schooluserrole: SchoolRole.TEACHER, schoolid: t.school, schoolname: t.names.school,
    schooluserstatus: true, schooluserpasswordhash: "hash",
  });
  db.add("students", {
    studentid: t.student, schooluserid: t.login, schoolid: t.school, schoolname: t.names.school, studentfirstname: "សុខា", standard: t.standard,
    curriculumid: t.curriculum, curriculumids: [t.curriculum], genderid: 1, isactive: 1, is_teacher_acc: false, type: "online",
  });
};

/** The id of every row of every table of a tree that belongs to the organisation: what each table must hold for it. */
const expectedIds = (t: Tree) => ({
  countries: sorted(t.country, t.freeCountry),
  schools: sorted(t.school, t.school2),
  standards: [t.standard],
  subjects: [t.subject],
  curriculums: [t.curriculum],
  questions: sorted(t.question, t.question2),
  documents: sorted(t.document, t.document2),
  curriculumbaselines: [t.baseline],
  baselinequestion: [t.baselineQuestion],
  grades: [t.grade],
  levels: [t.level],
  lessons: [t.lesson],
  lessonlearnings: [t.learning],
  lessonplans: [t.plan],
  lessonpractices: [t.practice],
  lessonquizzes: [t.quiz],
  lessonpracticequestions: [t.practiceQuestion],
  lessonquizquestions: [t.quizQuestion],
  levelquizquestions: [t.levelQuestion],
});
const PK: Record<keyof ReturnType<typeof expectedIds>, string> = {
  countries: "countryid", schools: "schoolid", standards: "standardid", subjects: "subjectid", curriculums: "curriculumid",
  questions: "questionid", documents: "documentid", curriculumbaselines: "curriculumbaselineid", baselinequestion: "baselinequestionid",
  grades: "gradeid", levels: "levelid", lessons: "lessonid", lessonlearnings: "lessonlearningid", lessonplans: "lessonplanid",
  lessonpractices: "lessonpracticeid", lessonquizzes: "lessonquizid", lessonpracticequestions: "lessonpracticequestionid",
  lessonquizquestions: "lessonquizquestionid", levelquizquestions: "levelquizquestionid",
};
const OWNED = ["schools", "curriculums", "questions", "documents", "subjects"] as const;
const everyIdOf = (t: Tree) => Object.values(expectedIds(t)).flat().filter((i) => i !== C_U);

const ORGANISATION_ROW = (organisationid: string) => ({
  organisationid,
  organisationname: organisationid === X ? "អង្គការ ក" : "អង្គការ ខ",
  organisationcode: CODE[organisationid as keyof typeof CODE],
  organisationstatus: true,
  uitheme: organisationid === X ? "kids" : "corporate",
  brandingconfig: organisationid === X ? { displayname: "អង្គការ ក", tilecolour: "#aabbcc" } : null,
  settingsconfig: { weeklygoal: 3 },
  isdeleted: false,
});

describe("the content sync is one organisation's", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController, StudentController, TeacherController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0);
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(Logger, "info").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    // the format of organisations' content (format 3): the setting an operator makes once the student API reads it
    process.env.SYNC_FORMAT_DEFAULT = "3";
    tokenExists.mockResolvedValue(true);
    db.install();
    for (const t of [TX, TY, TU]) seedTree(t);
    db.add("organisations", ORGANISATION_ROW(X));
    db.add("organisations", ORGANISATION_ROW(Y));
    for (const [countryid, countryname] of [[C_X, "កម្ពុជា"], [C_Y, "Laos"], [C_FREE, "Vietnam"], [C_FREE_Y, "Thailand"], [C_U, "Burma"]]) {
      db.add("countries", { countryid, countryname });
    }
    db.add("organisationcountry", { organisationcountryid: uuid(701), organisationid: X, countryid: C_X });
    db.add("organisationcountry", { organisationcountryid: uuid(702), organisationid: Y, countryid: C_Y });
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    (axios.put as jest.Mock).mockReset().mockResolvedValue({ status: 200 });
  });
  afterEach(() => {
    delete process.env.SYNC_FORMAT_DEFAULT;
  });

  const send = (who: Who, method: Method, path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](path).set("Authorization", callers[who]).set("Connection", "close");
    return body ? r.send(body) : r;
  };
  /** A download: the zip's `syncfile.ini`, parsed. */
  const download = async (who: Who, path: string) => {
    const res = await send(who, "get", path).buffer().parse(textOf);
    return { res, status: res.status, json: res.status === 200 ? JSON.parse(unzip(res.body as Buffer, "syncfile.ini")) : undefined, raw: res.status === 200 ? unzip(res.body as Buffer, "syncfile.ini") : "" };
  };
  const said = (res: request.Response) => ({ status: res.status, body: withoutReference(res.body) });

  /** What was PUT to the cloud, call `n`: the url, the headers, and the file inside the zip. */
  const pushed = (n = 0) => {
    const [url, form, options] = (axios.put as jest.Mock).mock.calls[n] as [string, FormData, { headers: Record<string, string> }];
    const buffer = form.getBuffer();
    const start = buffer.indexOf("\r\n\r\n") + 4;
    const end = buffer.lastIndexOf(`\r\n--${form.getBoundary()}--`);
    const zip = new AdmZip(buffer.subarray(start, end));
    const entries = zip.getEntries().map((e) => e.entryName);
    return { url, headers: options.headers, entries, json: JSON.parse(zip.readAsText(entries[0])) };
  };

  // ───────────────────────────── GET /sync/content ─────────────────────────────
  describe("GET /sync/content", () => {
    it.each(IN_X)("%s: X's content only, in format 3 with the header the student API reads", async (who) => {
      const { status, json, raw } = await download(who, "/sync/content");
      expect(status).toBe(200);
      expect(json.format).toBe(3);
      expect(json.organisationid).toBe(X);
      expect(json.organisationcode).toBe("xorg");
      expect(json.scope).toBe("organisation");
      expect(json.organisations).toEqual([JSON.parse(JSON.stringify(ORGANISATION_ROW(X)))]);
      expect(Object.keys(json).sort()).toEqual([...HEADER_KEYS, ...TABLE_KEYS].sort());
      const want = expectedIds(TX);
      for (const table of Object.keys(want) as Array<keyof typeof want>) {
        expect(ids(json[table], PK[table])).toEqual(want[table]);
      }
      // the rows of an owned table carry X's id; the rows that hang from them carry no owner of their own
      for (const table of Object.keys(want) as Array<keyof typeof want>) {
        for (const row of json[table] as Row[]) {
          if ((OWNED as readonly string[]).includes(table)) expect(row.organisationid).toBe(X);
          else expect(row.organisationid ?? null).toBeNull();
        }
      }
      // nothing of Y's or of the unowned content is anywhere in the file, by id or by name
      for (const id of [...everyIdOf(TY), ...everyIdOf(TU)]) expect(raw).not.toContain(id);
      expect(raw).not.toContain(Y);
      expect(raw).not.toContain(TY.names.curriculum);
      expect(raw).not.toContain(TU.names.school);
    });

    it("a platform user acting as X, a platform user not acting that names X, and X's own staff get the same payload", async () => {
      const own = (await download("X's Organisation Admin", "/sync/content")).json;
      expect((await download("a platform user acting as X", "/sync/content")).json).toEqual(own);
      expect((await download(NOT_ACTING, `/sync/content?organisationid=${X}`)).json).toEqual(own);
    });

    it("a platform user not acting names Y: Y's content only", async () => {
      const { status, json, raw } = await download(NOT_ACTING, `/sync/content?organisationid=${Y}`);
      expect(status).toBe(200);
      expect(json.organisationid).toBe(Y);
      expect(json.organisationcode).toBe("yorg");
      expect(json.organisations[0].uitheme).toBe("corporate");
      const want = expectedIds(TY);
      for (const table of Object.keys(want) as Array<keyof typeof want>) expect(ids(json[table], PK[table])).toEqual(want[table]);
      for (const id of [...everyIdOf(TX), ...everyIdOf(TU)]) expect(raw).not.toContain(id);
    });

    it("a platform user not acting that names no organisation is asked to choose one (400), and nothing is read for it", async () => {
      const { res } = await download(NOT_ACTING, "/sync/content");
      expect(res.status).toBe(400);
      const body = JSON.parse((res.body as Buffer).toString("utf8"));
      expect(body.errormessage).toBe("Choose an organisation.");
      expect(body.fields).toEqual([{ field: "organisationid", message: "Choose an organisation." }]);
    });

    it.each(["X's Organisation Admin" as Who, "a platform user acting as X" as Who])("%s: naming another organisation is the 404 an organisation that is not there gets, and naming its own is fine", async (who) => {
      const foreign = await send(who, "get", `/sync/content?organisationid=${Y}`);
      const absent = await send(who, "get", `/sync/content?organisationid=${MISSING_ORGANISATION}`);
      expect(foreign.status).toBe(404);
      expect(said(foreign)).toEqual(said(absent));
      expect((await send(who, "get", `/sync/content?organisationid=${X}`)).status).toBe(200);
    });

    it("a platform user not acting that names an organisation that is not there: 404; one that is not an id: 400", async () => {
      expect((await send(NOT_ACTING, "get", `/sync/content?organisationid=${MISSING_ORGANISATION}`)).status).toBe(404);
      expect((await send(NOT_ACTING, "get", `/sync/content?organisationid=${X}&organisationid=${Y}`)).status).toBe(400);
    });

    it("an organisation that is deleted is not there", async () => {
      db.tables.organisations.find((o) => o.organisationid === Y)!.isdeleted = true;
      expect((await send(NOT_ACTING, "get", `/sync/content?organisationid=${Y}`)).status).toBe(404);
    });

    it.each(["a server token", "a school-user token"] as Who[])("%s is not admitted", async (who) => {
      expect((await send(who, "get", "/sync/content")).status).toBe(401);
    });

    it("the payload passes the student API's own check for one organisation's content", async () => {
      for (const [who, path] of [["X's Organisation Admin", "/sync/content"], [NOT_ACTING, `/sync/content?organisationid=${Y}`]] as Array<[Who, string]>) {
        expect(contentProblems((await download(who, path)).json)).toEqual([]);
      }
    });
  });

  // ───────────────────────────── the student API's own check ─────────────────────────────
  describe("GET /sync/content against the student API's validator", () => {
    it("the check rejects a payload with a header key, a table, a school or an owner missing (so the acceptance above can fail)", async () => {
      const good = (await download("X's Admin", "/sync/content")).json;
      expect(contentProblems(good)).toEqual([]);
      const without = (key: string) => {
        const copy = JSON.parse(JSON.stringify(good));
        delete copy[key];
        return copy;
      };
      for (const key of [...HEADER_KEYS, ...TABLE_KEYS]) expect(contentProblems(without(key))).not.toEqual([]);
      const foreignOwner = JSON.parse(JSON.stringify(good));
      foreignOwner.questions[0].organisationid = Y;
      expect(contentProblems(foreignOwner)).not.toEqual([]);
      const orphan = JSON.parse(JSON.stringify(good));
      orphan.grades[0].curriculumid = MISSING;
      expect(contentProblems(orphan)).not.toEqual([]);
      const dangling = JSON.parse(JSON.stringify(good));
      dangling.lessonquizquestions[0].questionid = TY.question;
      expect(contentProblems(dangling)).not.toEqual([]);
      expect(contentProblems({ ...good, students: [] })).not.toEqual([]);
    });

    it("the check applies the student API's rules for the organisation row: display text, branding and the size of the settings (so these can fail)", async () => {
      const good = (await download("X's Admin", "/sync/content")).json;
      const withOrganisation = (change: (row: Row) => void) => {
        const copy = JSON.parse(JSON.stringify(good));
        change(copy.organisations[0]);
        return contentProblems(copy);
      };
      expect(withOrganisation(() => undefined)).toEqual([]);
      // a name with a control character, with a bidirectional control, or with no letter or digit in it
      for (const name of ["ក\u0007ខ", "ក\u202Eខ", "ក\u2067ខ", "---", "   "]) {
        expect(withOrganisation((o) => { o.organisationname = name; })).not.toEqual([]);
      }
      // a joiner in a Khmer name is fine
      expect(withOrganisation((o) => { o.organisationname = "ក\u200Dខ"; })).toEqual([]);
      for (const displayname of ["ក\u0007ខ", "ក\u202Aខ", "..."]) {
        expect(withOrganisation((o) => { o.brandingconfig = { displayname }; })).not.toEqual([]);
      }
      // 64 KB is BYTES of the JSON: 25 000 Khmer characters are under 64 K characters and over 64 KB
      expect(withOrganisation((o) => { o.settingsconfig = { note: "ក".repeat(25000) }; })).not.toEqual([]);
      expect(withOrganisation((o) => { o.settingsconfig = { note: "a".repeat(60000) }; })).toEqual([]);
      expect(withOrganisation((o) => { o.settingsconfig = { note: "a".repeat(70000) }; })).not.toEqual([]);
      // a list of ids that is not a list of ids
      const school = JSON.parse(JSON.stringify(good));
      school.schools[0].curriculums = "not a list";
      expect(contentProblems(school)).not.toEqual([]);
      school.schools[0].curriculums = [7];
      expect(contentProblems(school)).not.toEqual([]);
    });
  });

  // ───────────────────────────── format 2 ─────────────────────────────
  describe("GET /sync/content?format=2", () => {
    it("the platform, not acting as an organisation, gets the whole platform's content in the shape it always had (no header)", async () => {
      const { status, json } = await download(NOT_ACTING, "/sync/content?format=2");
      expect(status).toBe(200);
      expect(Object.keys(json).sort()).toEqual(
        ["curriculums", "curriculumbaselines", "baselinequestion", "grades", "levels", "lessons", "lessonlearnings", "lessonpractices", "lessonpracticequestions", "lessonquizzes", "lessonquizquestions", "levelquizquestions", "questions", "documents", "standards", "schools", "countries", "lessonplans", "subjects"].sort(),
      );
      expect(ids(json.curriculums, "curriculumid")).toEqual(sorted(TX.curriculum, TY.curriculum, TU.curriculum));
      expect(ids(json.questions, "questionid")).toEqual(sorted(TX.question, TX.question2, TY.question, TY.question2, TU.question, TU.question2));
      // (that the content rows carry no owner column is pinned on the SQL, in content-api-payloads.spec.ts: the in-memory
      // tables serialise a whole row through `JSON.stringify` whatever columns were asked for, so it cannot be seen here)
    });

    it.each(["X's Organisation Admin", "X's Admin", "a platform user acting as X"] as Who[])("%s: format 2 is the platform's only (400)", async (who) => {
      const res = await send(who, "get", "/sync/content?format=2");
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "format", message: "Format 2 is for the platform, not acting as an organisation, only." }]);
    });

    it("format 2 does not take an organisation (400); a format that is neither 2 nor 3 is refused (400)", async () => {
      expect((await send(NOT_ACTING, "get", `/sync/content?format=2&organisationid=${X}`)).status).toBe(400);
      for (const format of ["1", "4", "two", ""]) {
        const res = await send(NOT_ACTING, "get", `/sync/content?format=${format}&organisationid=${X}`);
        expect(res.status).toBe(format === "" ? 200 : 400);
      }
    });
  });

  // ───────────────────────────── SYNC_FORMAT_DEFAULT ─────────────────────────────
  describe.each([["2"], [undefined]])("while the student API in service may not read format 3 (SYNC_FORMAT_DEFAULT=%s: 2 is the default)", (setting) => {
    beforeEach(() => {
      if (setting === undefined) delete process.env.SYNC_FORMAT_DEFAULT;
      else process.env.SYNC_FORMAT_DEFAULT = setting;
    });

    it("a request that does not say gets format 2 if the caller is the platform not acting, and a 400 for anyone else", async () => {
      expect(Object.keys((await download(NOT_ACTING, "/sync/content")).json)).not.toContain("format");
      for (const who of IN_X) {
        const res = await send(who, "get", "/sync/content");
        expect(res.status).toBe(400);
        expect(res.body.errormessage).toMatch(/whole platform's content only/);
      }
    });

    it("format 3 is still there when asked for", async () => {
      expect((await download(NOT_ACTING, `/sync/content?format=3&organisationid=${X}`)).json.format).toBe(3);
      expect((await download("X's Admin", "/sync/content?format=3")).json.format).toBe(3);
    });
  });

  // ───────────────────────────── cross-owner references ─────────────────────────────
  describe("content that names another organisation's rows cannot be exported", () => {
    const cases: Array<[string, () => void, string]> = [
      ["a practice question pointing at another organisation's question", () => { db.tables.lessonpracticequestions[0].questionid = TY.question; }, "lessonpracticequestions: 1 row names a question"],
      ["a quiz question pointing at an unowned question", () => { db.tables.lessonquizquestions[0].questionid = TU.question; }, "lessonquizquestions: 1 row names a question"],
      ["a level quiz question pointing at another organisation's question", () => { db.tables.levelquizquestions[0].questionid = TY.question; }, "levelquizquestions: 1 row names a question"],
      ["a baseline question pointing at another organisation's question", () => { db.tables.baselinequestion[0].questionid = TY.question; }, "baselinequestion: 1 row names a question"],
      ["a lesson learning pointing at another organisation's document", () => { db.tables.lessonlearnings[0].documentid = TY.document; }, "lessonlearnings: 1 row names a document"],
      ["a lesson plan pointing at an unowned document", () => { db.tables.lessonplans[0].documentid = TU.document; }, "lessonplans: 1 row names a document"],
      ["a curriculum pointing at another organisation's subject", () => { db.tables.curriculums[0].subjectid = TY.subject; }, "curriculums: 1 row names a subject"],
      ["a school in a country that is not there", () => { db.tables.schools[0].countryid = MISSING; }, "schools: 1 row names a country"],
      ["a level quiz question pointing at another organisation's lesson", () => { db.tables.levelquizquestions[0].lessonid = TY.lesson; }, "levelquizquestions: 1 row names a lesson"],
    ];
    it.each(cases)("%s: 400 naming the table and the number of rows, and no id", async (_name, setUp, message) => {
      // the first rows of each table in the fake are X's (it is seeded first)
      setUp();
      const { res } = await download(NOT_ACTING, `/sync/content?organisationid=${X}`);
      expect(res.status).toBe(400);
      const text = (res.body as Buffer).toString("utf8");
      expect(JSON.parse(text).errormessage).toContain(message);
      for (const id of [...everyIdOf(TY), ...everyIdOf(TU), MISSING]) expect(text).not.toContain(id);
    });

    it("POST /sync/cloud sends nothing when the export is refused", async () => {
      db.tables.lessonpracticequestions[0].questionid = TY.question;
      const res = await send("X's Admin", "post", "/sync/cloud");
      expect(res.status).toBe(400);
      expect(axios.put).not.toHaveBeenCalled();
    });

    it("a baseline question under a baseline that is deleted is left out, not refused", async () => {
      db.tables.curriculumbaseline[0].isdeleted = true;
      const { status, json } = await download("X's Admin", "/sync/content");
      expect(status).toBe(200);
      expect(json.curriculumbaselines).toEqual([]);
      expect(json.baselinequestion).toEqual([]);
      expect(contentProblems(json)).toEqual([]);
    });

    it("the lists of ids a school and a baseline hold are trimmed to the rows of the payload (another organisation's, unknown, and the organisation's own stay as they should)", async () => {
      // X's school lists its curriculum, Y's curriculum, an unowned one and one that is not there; X's baseline lists X's school, Y's, and one that is not there
      db.tables.schools.find((r) => r.schoolid === TX.school)!.curriculums = [TX.curriculum, TY.curriculum, TU.curriculum, MISSING];
      db.tables.schools.find((r) => r.schoolid === TX.school2)!.curriculums = JSON.stringify([TX.curriculum, TY.curriculum]);
      db.tables.curriculumbaseline.find((r) => r.curriculumbaselineid === TX.baseline)!.schoolid = [TX.school, TY.school, MISSING, TX.school2];
      const { status, json, raw } = await download("X's Admin", "/sync/content");
      expect(status).toBe(200);
      const school = (id: string) => (json.schools as Row[]).find((r) => r.schoolid === id)!;
      expect(school(TX.school).curriculums).toEqual([TX.curriculum]);
      expect(school(TX.school2).curriculums).toEqual([TX.curriculum]);
      expect((json.curriculumbaselines as Row[])[0].schoolid).toEqual([TX.school, TX.school2]);
      expect(contentProblems(json)).toEqual([]);
      for (const id of [...everyIdOf(TY), ...everyIdOf(TU), MISSING]) expect(raw).not.toContain(id);
      // what the database holds is not changed by the export
      expect(db.tables.schools.find((r) => r.schoolid === TX.school)!.curriculums).toEqual([TX.curriculum, TY.curriculum, TU.curriculum, MISSING]);
    });

    it("the student API's check (with the rule on the lists) rejects a list that names a row outside the payload", async () => {
      const good = (await download("X's Admin", "/sync/content")).json;
      const school = JSON.parse(JSON.stringify(good));
      school.schools[0].curriculums = [TY.curriculum];
      expect(contentProblems(school)).not.toEqual([]);
      const baseline = JSON.parse(JSON.stringify(good));
      baseline.curriculumbaselines[0].schoolid = [TY.school];
      expect(contentProblems(baseline)).not.toEqual([]);
    });

    it("an organisation with no content exports empty tables, every key present", async () => {
      const Z = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
      db.add("organisations", { ...ORGANISATION_ROW(Y), organisationid: Z, organisationcode: "zorg" });
      const { status, json } = await download(NOT_ACTING, `/sync/content?organisationid=${Z}`);
      expect(status).toBe(200);
      for (const table of TABLE_KEYS) expect(json[table]).toEqual([]);
      expect(contentProblems(json)).toEqual([]);
    });
  });

  // ───────────────────────────── GET /sync ─────────────────────────────
  describe("GET /sync", () => {
    const V1_KEYS = ["curriculums", "curriculumbaselines", "grades", "levels", "lessons", "lessonlearnings", "lessonpractices", "lessonpracticequestions", "lessonquizzes", "lessonquizquestions", "levelquizquestions", "questions", "documents", "standards", "schools", "countries"].sort();

    // The file has no header naming an organisation, and the student API reads such a file as the whole platform's content:
    // one organisation's rows in it would replace everything else a Pi holds. So it is the platform's, or nobody's.
    it("the platform, not acting as an organisation, gets the whole platform's content in the older shape", async () => {
      const { status, json } = await download(NOT_ACTING, "/sync");
      expect(status).toBe(200);
      expect(Object.keys(json).sort()).toEqual(V1_KEYS);
      expect(ids(json.curriculums, "curriculumid")).toEqual(sorted(TX.curriculum, TY.curriculum, TU.curriculum));
      expect(ids(json.questions, "questionid")).toEqual(sorted(TX.question, TX.question2, TY.question, TY.question2, TU.question, TU.question2));
      expect(ids(json.schools, "schoolid")).toEqual(sorted(TX.school, TX.school2, TY.school, TY.school2, TU.school, TU.school2));
    });

    it.each(IN_X)("%s: refused (400), the same refusal as format 2 of sync/content: nothing is served", async (who) => {
      const res = await send(who, "get", "/sync");
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "format", message: "Format 2 is for the platform, not acting as an organisation, only." }]);
      expect(said(res)).toEqual(said(await send(who, "get", "/sync/content?format=2")));
    });

    it("naming an organisation does not make it one organisation's: the platform is refused (400), and so is an organisation's staff", async () => {
      expect((await send(NOT_ACTING, "get", `/sync?organisationid=${Y}`)).status).toBe(400);
      expect((await send("X's Admin", "get", `/sync?organisationid=${Y}`)).status).toBe(400);
    });

    it.each(["a server token", "a school-user token"] as Who[])("%s is not admitted", async (who) => {
      expect((await send(who, "get", "/sync")).status).toBe(401);
    });
  });

  // ───────────────────────────── POST /sync/cloud ─────────────────────────────
  describe("POST /sync/cloud", () => {
    it.each(PUSHERS_IN_X)("%s: pushes X's content (format 3) to the student API, with X's id in the header", async (who) => {
      await send(who, "post", "/sync/cloud").expect(200);
      expect(axios.put).toHaveBeenCalledTimes(1);
      const call = pushed();
      expect(call.url).toBe(`${Config.fortyk.api.rpi.cloud}/import/master`);
      expect(call.headers).toMatchObject({ Authorization: Config.fortyk.api.serversynckey, "X-Organisation-Id": X });
      expect(call.entries).toEqual(["syncfile.ini"]);
      expect(call.json.format).toBe(3);
      expect(call.json.organisationid).toBe(X);
      expect(ids(call.json.curriculums, "curriculumid")).toEqual([TX.curriculum]);
      expect(contentProblems(call.json)).toEqual([]);
      expect(JSON.stringify(call.json)).not.toContain(Y);
    });

    it("X's Organisation Admin is not admitted to the push, and a school-user token is not either (403)", async () => {
      expect((await send("X's Organisation Admin", "post", "/sync/cloud")).status).toBe(403);
      expect((await send("a school-user token", "post", "/sync/cloud")).status).toBe(403);
      expect(axios.put).not.toHaveBeenCalled();
    });

    it("a platform user not acting names the organisation in the body: that organisation's content, with its id in the header", async () => {
      await send(NOT_ACTING, "post", "/sync/cloud", { organisationid: Y }).expect(200);
      const call = pushed();
      expect(call.headers["X-Organisation-Id"]).toBe(Y);
      expect(call.json.organisationid).toBe(Y);
      expect(ids(call.json.curriculums, "curriculumid")).toEqual([TY.curriculum]);
    });

    it("a platform user not acting that names none is asked to choose (400): nothing is sent", async () => {
      const res = await send(NOT_ACTING, "post", "/sync/cloud");
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe("Choose an organisation.");
      expect(axios.put).not.toHaveBeenCalled();
    });

    it.each(PUSHERS_IN_X)("%s: another organisation named in the body is the 404 of an absent one: nothing is sent", async (who) => {
      const foreign = await send(who, "post", "/sync/cloud", { organisationid: Y });
      expect(foreign.status).toBe(404);
      expect(said(foreign)).toEqual(said(await send(who, "post", "/sync/cloud", { organisationid: MISSING_ORGANISATION })));
      expect(axios.put).not.toHaveBeenCalled();
    });

    it("format 2 in the body: the platform, not acting, pushes the whole platform's content (no organisation in the header); an organisation's Admin is refused (400)", async () => {
      await send(NOT_ACTING, "post", "/sync/cloud", { format: 2 }).expect(200);
      const call = pushed();
      expect(call.headers).not.toHaveProperty("X-Organisation-Id");
      expect(call.json).not.toHaveProperty("format");
      expect(ids(call.json.curriculums, "curriculumid")).toEqual(sorted(TX.curriculum, TY.curriculum, TU.curriculum));
      (axios.put as jest.Mock).mockClear();
      expect((await send("X's Admin", "post", "/sync/cloud", { format: 2 })).status).toBe(400);
      expect((await send("a platform user acting as X", "post", "/sync/cloud", { format: 2 })).status).toBe(400);
      expect(axios.put).not.toHaveBeenCalled();
    });

    it("while SYNC_FORMAT_DEFAULT is not 3 (unset, or 2) an organisation's Admin pushes nothing (400) and the platform pushes the whole platform's content", async () => {
      delete process.env.SYNC_FORMAT_DEFAULT;
      expect((await send("X's Admin", "post", "/sync/cloud")).status).toBe(400);
      expect(axios.put).not.toHaveBeenCalled();
      await send(NOT_ACTING, "post", "/sync/cloud").expect(200);
      expect(pushed().json).not.toHaveProperty("format");
    });
  });

  // ───────────────────────────── POST /sync/cloud/:schoolname/students ─────────────────────────────
  describe("POST /sync/cloud/:schoolname/students", () => {
    it.each(PUSHERS_IN_X)("%s: pushes the school's learners as { schoolid, studentusers }, each row carrying its school, with the school's organisation in the header", async (who) => {
      await send(who, "post", `/sync/cloud/${encodeURIComponent(TX.names.school)}/students`).expect(200);
      expect(axios.put).toHaveBeenCalledTimes(1);
      const call = pushed();
      expect(call.url).toBe(`${Config.fortyk.api.rpi.cloud}/import/students`);
      expect(call.headers).toMatchObject({ Authorization: Config.fortyk.api.serversynckey, "X-Organisation-Id": X });
      expect(call.entries).toEqual(["students.ini"]);
      expect(Object.keys(call.json).sort()).toEqual(["schoolid", "studentusers"]);
      expect(call.json.schoolid).toBe(TX.school);
      expect(ids(call.json.studentusers, "schooluserid")).toEqual([TX.login]);
      for (const row of call.json.studentusers as Row[]) {
        expect(row.schoolid).toBe(TX.school);
        expect((row.student as Row).schoolid).toBe(TX.school);
      }
    });

    it("the school can be named by its id", async () => {
      await send("X's Admin", "post", `/sync/cloud/${TX.school}/students`).expect(200);
      expect(pushed().json.schoolid).toBe(TX.school);
    });

    it.each(PUSHERS_IN_X)("%s: another organisation's school, and a school with no organisation, are the 404 of a school that is not there: nothing is sent", async (who) => {
      const absent = await send(who, "post", `/sync/cloud/${MISSING}/students`);
      expect(absent.status).toBe(404);
      for (const school of [TY.names.school, TY.school, TU.names.school]) {
        expect(said(await send(who, "post", `/sync/cloud/${encodeURIComponent(school)}/students`))).toEqual(said(absent));
      }
      expect(axios.put).not.toHaveBeenCalled();
    });

    it("a platform user not acting reaches any school; the header names that school's organisation", async () => {
      await send(NOT_ACTING, "post", `/sync/cloud/${encodeURIComponent(TY.names.school)}/students`).expect(200);
      expect(pushed().headers["X-Organisation-Id"]).toBe(Y);
      expect(pushed().json.schoolid).toBe(TY.school);
    });

    it("a school with no organisation has none to name in the header", async () => {
      await send(NOT_ACTING, "post", `/sync/cloud/${encodeURIComponent(TU.names.school)}/students`).expect(200);
      expect(pushed().headers).not.toHaveProperty("X-Organisation-Id");
    });

    it("X's Organisation Admin is not admitted (403)", async () => {
      expect((await send("X's Organisation Admin", "post", `/sync/cloud/${TX.school}/students`)).status).toBe(403);
    });

    it("while SYNC_FORMAT_DEFAULT is not 3 (unset) the file is the older { studentusers } with no school id on any row", async () => {
      delete process.env.SYNC_FORMAT_DEFAULT;
      await send("X's Admin", "post", `/sync/cloud/${TX.school}/students`).expect(200);
      const call = pushed();
      expect(Object.keys(call.json)).toEqual(["studentusers"]);
      for (const row of call.json.studentusers as Row[]) {
        expect(row).not.toHaveProperty("schoolid");
        expect(row.student as Row).not.toHaveProperty("schoolid");
      }
    });
  });

  // ───────────────────────────── the roster pushes of ?cloud=true ─────────────────────────────
  describe("the roster pushes", () => {
    const newStudent = (n: number) => ({
      city: "ភ្នំពេញ", country: "Cambodia", dateofjoin: "01-01-2026", studentfirstname: `សុខា${n}`, genderid: "1", state: "Phnom Penh",
      schoolusername: `newlearner${n}`, schooluserpasswordhash: "pass1234",
    });
    const studentBody = (schoolid: string, standard: string, curriculumid: string) => ({ schoolid, standard, curriculumid: [curriculumid], students: [newStudent(1)] });

    it.each(PUSHERS_IN_X)("%s: POST /student/create?cloud=true pushes only the learners it created, as { schoolid, studentusers }, with the school's organisation in the header", async (who) => {
      await send(who, "post", "/student/create?cloud=true", studentBody(TX.school, TX.standard, TX.curriculum)).expect(200);
      expect(axios.put).toHaveBeenCalledTimes(1);
      const call = pushed();
      expect(call.url).toBe(`${Config.fortyk.api.rpi.cloud}/import/students`);
      expect(call.headers["X-Organisation-Id"]).toBe(X);
      expect(Object.keys(call.json).sort()).toEqual(["schoolid", "studentusers"]);
      expect(call.json.schoolid).toBe(TX.school);
      expect(call.json.studentusers).toHaveLength(1);
      const row = call.json.studentusers[0];
      expect(row.schoolusername).toBe("newlearner1");
      expect(row.schoolid).toBe(TX.school);
      expect(row.student.schoolid).toBe(TX.school);
    });

    it.each(PUSHERS_IN_X)("%s: POST /teacher/create?cloud=true pushes { schoolid, teachers }, each teacher carrying its school, with the school's organisation in the header", async (who) => {
      await send(who, "post", "/teacher/create?cloud=true", { schoolname: TX.names.school, teachers: [{ schoolusername: "newteacher1", schooluserpasswordhash: "pass1234" }] }).expect(200);
      expect(axios.put).toHaveBeenCalledTimes(1);
      const call = pushed();
      expect(call.url).toBe(`${Config.fortyk.api.rpi.cloud}/import/teachers`);
      expect(call.headers).toMatchObject({ Authorization: Config.fortyk.api.serversynckey, "X-Organisation-Id": X });
      expect(call.entries).toEqual(["teachers.ini"]);
      expect(Object.keys(call.json).sort()).toEqual(["schoolid", "teachers"]);
      expect(call.json.schoolid).toBe(TX.school);
      expect(call.json.teachers).toHaveLength(1);
      expect(call.json.teachers[0]).toMatchObject({ schoolusername: "newteacher1", schoolid: TX.school, schoolname: TX.names.school });
    });

    it.each([["2"], [undefined]])("while SYNC_FORMAT_DEFAULT is %s (not 3) the rosters keep the shape they had: no school id, the teachers a bare list", async (setting) => {
      if (setting === undefined) delete process.env.SYNC_FORMAT_DEFAULT;
      else process.env.SYNC_FORMAT_DEFAULT = setting;
      await send("X's Admin", "post", "/student/create?cloud=true", studentBody(TX.school, TX.standard, TX.curriculum)).expect(200);
      const students = pushed(0);
      expect(Object.keys(students.json)).toEqual(["studentusers"]);
      expect(students.json.studentusers[0]).not.toHaveProperty("schoolid");
      expect(students.json.studentusers[0].student).not.toHaveProperty("schoolid");
      await send("X's Admin", "post", "/teacher/create?cloud=true", { schoolname: TX.names.school, teachers: [{ schoolusername: "newteacher2", schooluserpasswordhash: "pass1234" }] }).expect(200);
      const teachers = pushed(1);
      expect(Array.isArray(teachers.json)).toBe(true);
      expect(teachers.json[0]).not.toHaveProperty("schoolid");
    });

    it("Y's school is a 404 and nothing is sent", async () => {
      const res = await send("X's Admin", "post", "/student/create?cloud=true", studentBody(TY.school, TY.standard, TY.curriculum));
      expect(res.status).toBe(404);
      expect(axios.put).not.toHaveBeenCalled();
    });
  });
});
