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
import { Default_Test_Student_ID } from "src/models/enums/user.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { ContentFake } from "src/test-support/content-fake";
import { ReportController } from "./report/report.controller";

/**
 * The reports are confined to the caller's organisation (report-scope.ts, report-proxy.ts). Driven over real HTTP
 * through the real strategy, guards, controller, validators and business classes; replaced are the models (an
 * in-memory copy of the tables the reports read), the token lookup, and the student API (the cloud server).
 *
 * Fixtures: organisations X and Y each have a school with a class, learners (with their logins, progress, sign-in
 * and usage rows), teacher logins, a curriculum with a grade, a level, a lesson and a quiz, feedback and sync records;
 * a third school, with learners, a class and a curriculum, belongs to no organisation. Callers: X's Organisation
 * Admin, X's Admin, a platform user acting as X, and a platform user not acting.
 *
 * Reports read from this server: the caller's own filter answers 200 with only X's rows; another organisation's
 * school, class, learner, curriculum or country in the filter, and one that belongs to no organisation, answers
 * exactly as one that is not there does (the whole answer); a request with no filter lists X's rows and none of the
 * others; a platform user not acting reaches every row. Reports asked of the student API: what is sent is pinned
 * exactly (the body and the headers), and for another organisation's school, learner or class nothing is sent.
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
const MISSING = uuid(999999);
const MISSING_NAME = "សាលាដែលមិនមាន";

interface Learner {
  id: string;
  login: string;
  loginname: string;
  first: string;
  gender: number;
  wg: number | null;
  type: "online" | "offline";
}
interface Tree {
  owner: string | null;
  country: string;
  countryname: string;
  school: string;
  schoolname: string;
  klass: string;
  classname: string;
  curriculum: string;
  grade: string;
  level: string;
  lesson: string;
  quiz: string;
  teachers: string[];
  learners: Learner[];
  feedbacks: Array<{ id: string; flagged: string }>;
  syncs: string[];
}

/** One school's whole set of rows; the ids differ by `base`. */
const treeOf = (
  owner: string | null,
  base: number,
  tag: string,
  names: { country: string; school: string; klass: string; learners: string[] },
  shape: { teachers: number; genders: number[]; wg: Array<number | null>; types: Array<"online" | "offline">; flagged: string[]; syncs: number },
  /** A school in a country another tree already has (countries are shared between organisations). */
  sharedCountry?: { id: string; name: string },
): Tree => ({
  owner,
  country: sharedCountry?.id ?? uuid(base + 1),
  countryname: sharedCountry?.name ?? names.country,
  school: uuid(base + 2),
  schoolname: names.school,
  klass: uuid(base + 3),
  classname: names.klass,
  curriculum: uuid(base + 4),
  grade: uuid(base + 5),
  level: uuid(base + 6),
  lesson: uuid(base + 7),
  quiz: uuid(base + 8),
  teachers: Array.from({ length: shape.teachers }, (_, i) => uuid(base + 10 + i)),
  learners: names.learners.map((first, i) => ({
    id: uuid(base + 20 + i),
    login: uuid(base + 30 + i),
    loginname: `learner-${tag}-${i + 1}`,
    first,
    gender: shape.genders[i],
    wg: shape.wg[i],
    type: shape.types[i],
  })),
  feedbacks: shape.flagged.map((flagged, i) => ({ id: uuid(base + 40 + i), flagged })),
  syncs: Array.from({ length: shape.syncs }, (_, i) => uuid(base + 50 + i)),
});

const TX = treeOf(X, 1000, "x", { country: "កម្ពុជា", school: "សាលា ក", klass: "ថ្នាក់ ក", learners: ["សុខា", "សុភា"] }, {
  teachers: 1, genders: [1, 1], wg: [3, null], types: ["online", "offline"], flagged: ["rpi"], syncs: 1,
});
const TY = treeOf(Y, 2000, "y", { country: "Laos", school: "សាលា ខ", klass: "ថ្នាក់ ខ", learners: ["ដារា", "ដាលីន", "ដានី"] }, {
  teachers: 2, genders: [2, 2, 2], wg: [1, 1, 1], types: ["online", "online", "online"], flagged: ["rpi", "router"], syncs: 2,
});
// Y's second school is in X's country: organisations share countries
const TY2 = treeOf(Y, 2500, "y2", { country: "", school: "សាលា ខ២", klass: "ថ្នាក់ ខ២", learners: ["ដារិទ្ធ"] }, {
  teachers: 1, genders: [2], wg: [1], types: ["online"], flagged: [], syncs: 0,
}, { id: TX.country, name: TX.countryname });
const TU = treeOf(null, 3000, "u", { country: "Vietnam", school: "សាលា គ", klass: "ថ្នាក់ គ", learners: ["វិបុល", "វិមាន", "វិចិត្រ", "វិសាល"] }, {
  teachers: 3, genders: [1, 2, 2, 1], wg: [4, 4, 4, 4], types: ["offline", "offline", "offline", "offline"], flagged: ["general"], syncs: 3,
});
const TREES = [TX, TY, TY2, TU];

const db = new ContentFake();

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002];
const callers = {
  "X's Organisation Admin": bearer({ lmsuserid: "oa", lmsuserroles: [Role.organisationadmin], permissions: PERMS, organisationid: X, isplatform: false }),
  "X's Admin": bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false }),
  "a platform user acting as X": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: X, isplatform: true }),
  "a platform user not acting": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: null, isplatform: true }),
} as const;
type Who = keyof typeof callers;
const IN_X: Who[] = ["X's Organisation Admin", "X's Admin", "a platform user acting as X"];
const NOT_ACTING: Who = "a platform user not acting";

type Row = Record<string, unknown>;
type Method = "get" | "post";
const sorted = (...ids: string[]) => [...ids].sort();
const idsOf = (rows: Row[], key: string) => rows.map((r) => r[key] as string).sort();
const withoutReference = (body: Row) => {
  const { reference, logid, stack, ...rest } = body;
  return rest;
};
const textOf = (res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

const NEVER = new Date("2024-01-15T10:00:00Z");

/** Every table, as the reports find it. */
const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("organisationcountry", { organisationcountryid: uuid(701), organisationid: X, countryid: TX.country });
  db.add("organisationcountry", { organisationcountryid: uuid(702), organisationid: Y, countryid: TY.country });
  for (const t of TREES) {
    const o = t.owner;
    if (!db.tables.countries.some((c) => c.countryid === t.country)) {
      db.add("countries", { countryid: t.country, countryname: t.countryname, expectedusage: 7 });
    }
    db.add("schools", { schoolid: t.school, schoolname: t.schoolname, organisationid: o, countryid: t.country, curriculums: [t.curriculum], created_at: NEVER });
    db.add("standards", { standardid: t.klass, standardname: t.classname, schoolid: t.school, schoolname: t.schoolname });
    // the content the learners study
    db.add("curriculums", { curriculumid: t.curriculum, curriculumname: `ភាសាខ្មែរ ${t.schoolname}`, organisationid: o, curriculumstatus: true });
    db.add("grades", { gradeid: t.grade, gradename: `ថ្នាក់ទី១ ${t.schoolname}`, gradeorder: 1, gradestatus: true, curriculumid: t.curriculum });
    db.add("levels", { levelid: t.level, levelname: `កម្រិត ${t.schoolname}`, levelorder: 1, levelstatus: true, gradeid: t.grade });
    db.add("lessons", { lessonid: t.lesson, lessonname: `មេរៀន ${t.schoolname}`, lessonorder: 1, lessonstatus: true, levelid: t.level });
    db.add("lessonquizzes", { lessonquizid: t.quiz, lessonid: t.lesson, lessonquizname: "Quiz", lessonquizorder: 1 });
    db.add("lessonquizquestions", { lessonquizquestionid: uuid(Number(t.quiz.slice(-12)) + 100), lessonquizid: t.quiz });
    db.add("levelquizquestions", { levelquizquestionid: uuid(Number(t.level.slice(-12)) + 100), levelid: t.level });
    t.teachers.forEach((id, i) =>
      db.add("schoolusers", { schooluserid: id, schoolusername: `teacher-${t.owner === X ? "x" : t.owner === Y ? "y" : "u"}-${i + 1}`, schooluserrole: SchoolRole.TEACHER, schoolid: t.school, schoolname: t.schoolname, created_at: NEVER }),
    );
    t.learners.forEach((l, i) => {
      db.add("schoolusers", { schooluserid: l.login, schoolusername: l.loginname, schooluserrole: SchoolRole.STUDENT, schoolid: t.school, schoolname: t.schoolname, created_at: NEVER });
      db.add("students", {
        studentid: l.id, schooluserid: l.login, schoolid: t.school, schoolname: t.schoolname, studentfirstname: l.first, studentlastname: "ចាន់",
        standard: t.klass, curriculumid: t.curriculum, curriculumids: [t.curriculum], genderid: l.gender, wg_seeing: l.wg, isactive: 1, is_teacher_acc: false,
        type: l.type, country: t.countryname, created_at: NEVER,
      });
      const n = Number(l.id.slice(-12)) * 10;
      db.add("studentlessonsprogress", { studentlessonprogressid: uuid(n + 1), studentid: l.id, lessonid: t.lesson, levelid: t.level, gradeid: t.grade, curid: t.curriculum });
      db.add("studentlevelsprogress", { studentlevelprogressid: uuid(n + 2), studentid: l.id, levelid: t.level, gradeid: t.grade, curid: t.curriculum });
      db.add("studentgradesprogress", { studentgradeprogressid: uuid(n + 3), studentid: l.id, gradeid: t.grade, curriculumid: t.curriculum });
      // a lesson quiz result (progresstype 2) and a level quiz result
      db.add("studentprogress", {
        studentprogressid: uuid(n + 4), studentid: l.id, progresstype: 2, studentprogressreferenceid: t.quiz, ispass: 1, scores: 9, resultpercentage: 90, marks: 9,
        starttime: new Date("2024-02-01T10:00:00Z"), verified: true,
      });
      db.add("studentprogress", {
        studentprogressid: uuid(n + 5), studentid: l.id, progresstype: 1, studentprogressreferenceid: t.level, ispass: 1, scores: 8, resultpercentage: 80, marks: 8,
        starttime: new Date("2024-02-02T10:00:00Z"), verified: true,
      });
      db.add("rpiuseraccess", { rpiuseraccessid: uuid(n + 6), userid: l.login, logintime: new Date() });
      db.add("studentappusages", { studentappusageid: uuid(n + 7), schooluserid: l.login, time_spent: 600 * (i + 1), created_at: new Date() });
    });
    t.feedbacks.forEach((f) => {
      const part = (on: boolean) => ({ feedback: on ? "មិនដំណើរការ" : "", images: [], selected_error: [] });
      db.add("feedbacks", {
        feedbackid: f.id, curriculumid: t.curriculum, created_by: t.teachers[0], teachername: "គ្រូ", image: [], created_at: new Date("2024-06-10T10:00:00Z"),
        feedback: { rpi: part(f.flagged === "rpi"), router: part(f.flagged === "router"), content: part(false), tablet: part(false), app: part(false), general: part(f.flagged === "general") },
      });
    });
    t.syncs.forEach((id, i) => db.add("syncs", { syncid: id, filename: `sync-${i}.zip`, type: 1, offlineonline: true, created_by: t.teachers[0], created_at: new Date("2024-03-01T10:00:00Z") }));
  }
};

/** The learner the reports answer for when they are told no learner and no class (a fixed id), placed in a school. */
const placeFixedLearner = (t: Tree, first = "សាកល្បង") => {
  db.add("schoolusers", { schooluserid: uuid(8801), schoolusername: "fixed-learner", schooluserrole: SchoolRole.STUDENT, schoolid: t.school, schoolname: t.schoolname, created_at: NEVER });
  db.add("students", {
    studentid: Default_Test_Student_ID, schooluserid: uuid(8801), schoolid: t.school, schoolname: t.schoolname, studentfirstname: first, studentlastname: "ចាន់",
    standard: t.klass, curriculumid: t.curriculum, curriculumids: [t.curriculum], genderid: 1, isactive: 1, is_teacher_acc: false, type: "online", country: t.countryname, created_at: NEVER,
  });
};

describe("reports are confined to the caller's organisation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportController],
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
    jest.spyOn(Logger, "error").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    tokenExists.mockResolvedValue(true);
    db.install();
    seed();
    (axios.post as jest.Mock).mockReset().mockRejectedValue(new Error("no student API in a test"));
  });

  const send = (who: Who, method: Method, path: string, body?: object) => {
    // one connection per request
    const r = request(app.getHttpServer())[method](path).set("Authorization", callers[who]).set("Connection", "close");
    return body ? r.send(body) : r;
  };
  /** The whole answer (status and body), without what differs per request. */
  const said = (res: request.Response) => ({ status: res.status, body: withoutReference(res.body) });
  const enc = encodeURIComponent;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const csvOf = async (who: Who, path: string, body: object) => {
    const res = await send(who, "post", path, body).buffer(true).parse(textOf as never);
    return { res, text: Buffer.isBuffer(res.body) ? (res.body as Buffer).toString("utf8") : "" };
  };
  /** A page body for a report. */
  const page = (filter: Array<{ key: string; value: unknown }> = []) => ({ pageindex: 1, pagesize: 20, filter });
  const data = (res: request.Response) => (res.body.data as { data: Row[] }).data;

  /**
   * A reference that is not in the caller's scope answers exactly as one that is not there does: the same status and
   * body (the whole answer). Returns the answer for the missing one.
   */
  const asAbsent = async (who: Who, method: Method, reqOf: (ref: string) => { path: string; body?: object }, foreign: string[], missing: string = MISSING) => {
    const ask = async (ref: string) => {
      const q = reqOf(ref);
      return said(await send(who, method, q.path, q.body));
    };
    const absent = await ask(missing);
    for (const ref of foreign) {
      expect(await ask(ref)).toEqual(absent);
    }
    return absent;
  };

  /** The tokens no report admits: the application's own key, and a school-user (teacher) token. */
  const refusedTokens = async (method: Method, path: string, body?: object) => {
    const ask = (authorization: string) => {
      const r = request(app.getHttpServer())[method](path).set("Authorization", authorization).set("Connection", "close");
      return body ? r.send(body) : r;
    };
    return {
      key: (await ask(`Bearer ${Config.fortyk.api.applicationapikey}`)).status,
      teacher: (await ask(bearer({ schooluserid: uuid(499), schooluserrole: SchoolRole.TEACHER }))).status,
    };
  };
  /** X's learner enrolled on another curriculum (as inconsistent data can leave one). */
  const enrolOn = (curriculum: string) => {
    db.tables.students.find((r) => r.studentid === TX.learners[0].id)!.curriculumid = curriculum;
  };
  /**
   * What a report answers, as text, for X's learner when the learner is enrolled on another organisation's curriculum
   * and on one that belongs to no organisation. The curriculums' names (and their grades', levels' and lessons') carry
   * the name of the school whose tree they are.
   */
  const enrolments = async (answerOf: () => Promise<unknown>) => {
    enrolOn(TY.curriculum);
    const y = JSON.stringify(await answerOf());
    enrolOn(TU.curriculum);
    const u = JSON.stringify(await answerOf());
    enrolOn(TX.curriculum);
    return [y, u];
  };
  /** X's own school, with a login and a learner, in a country X is not linked to. */
  const addXSchoolInUnlinkedCountry = () => {
    const school = uuid(1900);
    db.add("schools", { schoolid: school, schoolname: "សាលា ក២", organisationid: X, countryid: TU.country, curriculums: [], created_at: NEVER });
    db.add("schoolusers", { schooluserid: uuid(1901), schoolusername: "teacher-x-far", schooluserrole: SchoolRole.TEACHER, schoolid: school, schoolname: "សាលា ក២", created_at: NEVER });
    db.add("schoolusers", { schooluserid: uuid(1902), schoolusername: "learner-x-far", schooluserrole: SchoolRole.STUDENT, schoolid: school, schoolname: "សាលា ក២", created_at: NEVER });
    db.add("students", {
      studentid: uuid(1903), schooluserid: uuid(1902), schoolid: school, schoolname: "សាលា ក២", studentfirstname: "សុវណ្ណ", standard: TX.klass, curriculumid: TX.curriculum,
      genderid: 2, wg_seeing: 4, isactive: 1, is_teacher_acc: false, type: "offline", country: TU.countryname, created_at: NEVER,
    });
  };

  // ───────────────────────────── the reach charts and the dashboards ─────────────────────────────

  describe("GET /report/dashboard", () => {
    const last = (res: request.Response) =>
      Object.fromEntries((res.body.data as Array<{ name: string; series: Array<{ value: number }> }>).map((s) => [s.name, s.series[s.series.length - 1].value]));
    it("the application's own key and a school-user token are not admitted", async () => {
      expect(await refusedTokens("get", "/report/dashboard?countryid=all&year=2024")).toEqual({ key: 401, teacher: 403 });
    });
    it.each(IN_X)("%s: counts X's schools, learners and teachers, none of Y's or the unowned", async (who) => {
      const res = await send(who, "get", "/report/dashboard?countryid=all&year=2024").expect(200);
      expect(last(res)).toEqual({ Schools: 1, Students: 2, Teachers: 1 });
    });
    it.each(IN_X)("%s: X's country counts X's; another organisation's country, and the unowned one, answer as one that is not there", async (who) => {
      const own = await send(who, "get", `/report/dashboard?countryid=${TX.country}&year=2024`).expect(200);
      expect(last(own)).toEqual({ Schools: 1, Students: 2, Teachers: 1 });
      await asAbsent(who, "get", (id) => ({ path: `/report/dashboard?countryid=${id}&year=2024` }), [TY.country, TU.country]);
    });
    it.each(IN_X)("%s: X's own school in a country X is not linked to is not reached through that country", async (who) => {
      addXSchoolInUnlinkedCountry();
      const absent = said(await send(who, "get", `/report/dashboard?countryid=${MISSING}&year=2024`));
      expect(said(await send(who, "get", `/report/dashboard?countryid=${TU.country}&year=2024`))).toEqual(absent);
    });
    it("a platform user not acting: counts every organisation's, and the unowned school's", async () => {
      const all = await send(NOT_ACTING, "get", "/report/dashboard?countryid=all&year=2024").expect(200);
      expect(last(all)).toEqual({ Schools: 4, Students: 10, Teachers: 7 });
      // X's country holds a school of Y's too
      const shared = await send(NOT_ACTING, "get", `/report/dashboard?countryid=${TX.country}&year=2024`).expect(200);
      expect(last(shared)).toEqual({ Schools: 2, Students: 3, Teachers: 2 });
      const y = await send(NOT_ACTING, "get", `/report/dashboard?countryid=${TY.country}&year=2024`).expect(200);
      expect(last(y)).toEqual({ Schools: 1, Students: 3, Teachers: 2 });
    });
  });

  describe("GET /report/dashboard/country/:countryid", () => {
    const counts = (res: request.Response) => Object.fromEntries((res.body.data as Array<{ name: string; value: number }>).map((c) => [c.name, c.value]));
    it.each(IN_X)("%s: X's country counts X's schools and logins", async (who) => {
      const res = await send(who, "get", `/report/dashboard/country/${TX.country}`).expect(200);
      expect(counts(res)).toEqual({ Teachers: 1, Schools: 1, Students: 2 });
    });
    it.each(IN_X)("%s: another organisation's country, and the unowned one, answer as one that is not there", async (who) => {
      const absent = await asAbsent(who, "get", (id) => ({ path: `/report/dashboard/country/${id}` }), [TY.country, TU.country]);
      expect(absent.status).toBe(200);
      expect(counts({ body: absent.body } as request.Response)).toEqual({ Teachers: 0, Schools: 0, Students: 0 });
    });
    it.each(IN_X)("%s: X's own school in a country X is not linked to is not reached through that country", async (who) => {
      addXSchoolInUnlinkedCountry();
      const absent = said(await send(who, "get", `/report/dashboard/country/${MISSING}`));
      expect(said(await send(who, "get", `/report/dashboard/country/${TU.country}`))).toEqual(absent);
    });
    it("a platform user not acting: reaches every organisation's country, and the unowned one", async () => {
      const y = await send(NOT_ACTING, "get", `/report/dashboard/country/${TY.country}`).expect(200);
      expect(counts(y)).toEqual({ Teachers: 2, Schools: 1, Students: 3 });
      const u = await send(NOT_ACTING, "get", `/report/dashboard/country/${TU.country}`).expect(200);
      expect(counts(u)).toEqual({ Teachers: 3, Schools: 1, Students: 4 });
      // X's country holds a school of Y's too
      const shared = await send(NOT_ACTING, "get", `/report/dashboard/country/${TX.country}`).expect(200);
      expect(counts(shared)).toEqual({ Teachers: 2, Schools: 2, Students: 3 });
    });
  });

  describe("GET /report/dashboard/school/:schoolname", () => {
    const counts = (res: request.Response) => Object.fromEntries((res.body.data as Array<{ name: string; value: number }>).map((c) => [c.name, c.value]));
    it.each(IN_X)("%s: X's school, by name and by id", async (who) => {
      const byName = await send(who, "get", `/report/dashboard/school/${enc(TX.schoolname)}`).expect(200);
      expect(counts(byName)).toEqual({ Teachers: 1, Students: 2 });
      const byId = await send(who, "get", `/report/dashboard/school/${TX.school}`).expect(200);
      expect(counts(byId)).toEqual({ Teachers: 1, Students: 2 });
    });
    it.each(IN_X)("%s: another organisation's school, and the unowned one, by name or by id, answer as one that is not there", async (who) => {
      const byName = await asAbsent(who, "get", (n) => ({ path: `/report/dashboard/school/${enc(n)}` }), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      const byId = await asAbsent(who, "get", (id) => ({ path: `/report/dashboard/school/${id}` }), [TY.school, TU.school]);
      expect(byId).toEqual(byName);
    });
    it("a platform user not acting: reaches every organisation's school, and the unowned one", async () => {
      expect(counts(await send(NOT_ACTING, "get", `/report/dashboard/school/${enc(TY.schoolname)}`).expect(200))).toEqual({ Teachers: 2, Students: 3 });
      expect(counts(await send(NOT_ACTING, "get", `/report/dashboard/school/${TU.school}`).expect(200))).toEqual({ Teachers: 3, Students: 4 });
    });
  });

  describe("GET /report/gender", () => {
    const chart = (res: request.Response) => Object.fromEntries((res.body.data as Array<{ name: string; value: number }>).map((c) => [c.name, c.value]));
    it.each(IN_X)("%s: counts X's learners with no filter, and by X's school (id or name) or country", async (who) => {
      expect(chart(await send(who, "get", "/report/gender").expect(200))).toEqual({ girls: 0, boys: 2 });
      expect(chart(await send(who, "get", `/report/gender?schoolid=${TX.school}`).expect(200))).toEqual({ girls: 0, boys: 2 });
      expect(chart(await send(who, "get", `/report/gender?schoolname=${enc(TX.schoolname)}`).expect(200))).toEqual({ girls: 0, boys: 2 });
      expect(chart(await send(who, "get", `/report/gender?countryid=${TX.country}`).expect(200))).toEqual({ girls: 0, boys: 2 });
    });
    it.each(IN_X)("%s: another organisation's school, and the unowned one, by id or name, answer as one that is not there", async (who) => {
      const byId = await asAbsent(who, "get", (id) => ({ path: `/report/gender?schoolid=${id}` }), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await asAbsent(who, "get", (n) => ({ path: `/report/gender?schoolname=${enc(n)}` }), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName).toEqual(byId);
    });
    it.each(IN_X)("%s: another organisation's country, and the unowned one, answer as one that is not there", async (who) => {
      const absent = await asAbsent(who, "get", (id) => ({ path: `/report/gender?countryid=${id}` }), [TY.country, TU.country]);
      expect(absent.status).toBe(200);
    });
    it.each(IN_X)("%s: X's own school in a country X is not linked to is not reached through that country", async (who) => {
      addXSchoolInUnlinkedCountry();
      const absent = said(await send(who, "get", `/report/gender?countryid=${MISSING}`));
      expect(said(await send(who, "get", `/report/gender?countryid=${TU.country}`))).toEqual(absent);
    });
    it("a platform user not acting: counts every organisation's learners, and any school", async () => {
      expect(chart(await send(NOT_ACTING, "get", "/report/gender").expect(200))).toEqual({ girls: 6, boys: 4 });
      expect(chart(await send(NOT_ACTING, "get", `/report/gender?countryid=${TX.country}`).expect(200))).toEqual({ girls: 1, boys: 2 });
      expect(chart(await send(NOT_ACTING, "get", `/report/gender?schoolid=${TY.school}`).expect(200))).toEqual({ girls: 3, boys: 0 });
      expect(chart(await send(NOT_ACTING, "get", `/report/gender?schoolname=${enc(TU.schoolname)}`).expect(200))).toEqual({ girls: 2, boys: 2 });
    });
  });

  describe("GET /report/disability", () => {
    const chart = (res: request.Response) => Object.fromEntries((res.body.data as Array<{ name: string; value: number }>).map((c) => [c.name, c.value]));
    it.each(IN_X)("%s: counts X's learners with no filter, and by X's school or country", async (who) => {
      const own = { "with disability": 1, "no disability": 0, "not collected": 1 };
      expect(chart(await send(who, "get", "/report/disability").expect(200))).toEqual(own);
      expect(chart(await send(who, "get", `/report/disability?schoolid=${TX.school}`).expect(200))).toEqual(own);
      expect(chart(await send(who, "get", `/report/disability?schoolname=${enc(TX.schoolname)}`).expect(200))).toEqual(own);
      expect(chart(await send(who, "get", `/report/disability?countryid=${TX.country}`).expect(200))).toEqual(own);
    });
    it.each(IN_X)("%s: another organisation's school and country, and the unowned ones, answer as ones that are not there", async (who) => {
      const byId = await asAbsent(who, "get", (id) => ({ path: `/report/disability?schoolid=${id}` }), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await asAbsent(who, "get", (n) => ({ path: `/report/disability?schoolname=${enc(n)}` }), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName).toEqual(byId);
      const country = await asAbsent(who, "get", (id) => ({ path: `/report/disability?countryid=${id}` }), [TY.country, TU.country]);
      expect(country.status).toBe(200);
    });
    it.each(IN_X)("%s: X's own school in a country X is not linked to is not reached through that country", async (who) => {
      addXSchoolInUnlinkedCountry();
      const absent = said(await send(who, "get", `/report/disability?countryid=${MISSING}`));
      expect(said(await send(who, "get", `/report/disability?countryid=${TU.country}`))).toEqual(absent);
    });
    it("a platform user not acting: counts every organisation's learners, and any school", async () => {
      expect(chart(await send(NOT_ACTING, "get", "/report/disability").expect(200))).toEqual({ "with disability": 5, "no disability": 4, "not collected": 1 });
      expect(chart(await send(NOT_ACTING, "get", `/report/disability?countryid=${TX.country}`).expect(200))).toEqual({ "with disability": 1, "no disability": 1, "not collected": 1 });
      expect(chart(await send(NOT_ACTING, "get", `/report/disability?schoolid=${TY.school}`).expect(200))).toEqual({ "with disability": 0, "no disability": 3, "not collected": 0 });
    });
  });

  describe("GET /report/offlineonline", () => {
    const chart = (res: request.Response) => Object.fromEntries((res.body.data as Array<{ name: string; value: number }>).map((c) => [c.name, c.value]));
    it.each(IN_X)("%s: counts X's learners with no filter, and by X's school or country", async (who) => {
      const own = { Online: 1, Offline: 1 };
      expect(chart(await send(who, "get", "/report/offlineonline").expect(200))).toEqual(own);
      expect(chart(await send(who, "get", `/report/offlineonline?schoolid=${TX.school}`).expect(200))).toEqual(own);
      expect(chart(await send(who, "get", `/report/offlineonline?schoolname=${enc(TX.schoolname)}`).expect(200))).toEqual(own);
      expect(chart(await send(who, "get", `/report/offlineonline?countryid=${TX.country}`).expect(200))).toEqual(own);
    });
    it.each(IN_X)("%s: another organisation's school and country, and the unowned ones, answer as ones that are not there", async (who) => {
      const byId = await asAbsent(who, "get", (id) => ({ path: `/report/offlineonline?schoolid=${id}` }), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await asAbsent(who, "get", (n) => ({ path: `/report/offlineonline?schoolname=${enc(n)}` }), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName).toEqual(byId);
      await asAbsent(who, "get", (id) => ({ path: `/report/offlineonline?countryid=${id}` }), [TY.country, TU.country]);
    });
    it.each(IN_X)("%s: X's own school in a country X is not linked to is not reached through that country", async (who) => {
      addXSchoolInUnlinkedCountry();
      const absent = said(await send(who, "get", `/report/offlineonline?countryid=${MISSING}`));
      expect(said(await send(who, "get", `/report/offlineonline?countryid=${TU.country}`))).toEqual(absent);
    });
    it("a platform user not acting: counts every organisation's learners, and any school", async () => {
      expect(chart(await send(NOT_ACTING, "get", "/report/offlineonline").expect(200))).toEqual({ Online: 5, Offline: 5 });
      expect(chart(await send(NOT_ACTING, "get", `/report/offlineonline?countryid=${TX.country}`).expect(200))).toEqual({ Online: 2, Offline: 1 });
      expect(chart(await send(NOT_ACTING, "get", `/report/offlineonline?schoolid=${TU.school}`).expect(200))).toEqual({ Online: 0, Offline: 4 });
    });
  });

  describe("GET /report/studentusage", () => {
    const countries = (res: request.Response) => (res.body.data as Array<{ name: string }>).map((c) => c.name);
    it.each(IN_X)("%s: lists the countries X is linked to, none of the others", async (who) => {
      const res = await send(who, "get", "/report/studentusage").expect(200);
      expect(countries(res)).toEqual([TX.countryname]);
    });
    it("a platform user not acting: lists every country", async () => {
      const res = await send(NOT_ACTING, "get", "/report/studentusage").expect(200);
      expect(countries(res)).toEqual([TX.countryname, TY.countryname, TU.countryname]);
    });
  });

  // ───────────────────────────── the learner reports ─────────────────────────────

  // a request that names one thing (a learner, a class, a curriculum) in the filter
  const asking = (path: string, key: string, more: Array<{ key: string; value: unknown }> = []) => (ref: string) => ({
    path,
    body: page([{ key, value: ref }, ...more]),
  });
  const removeFixedLearner = () => {
    db.tables.students = db.tables.students.filter((r) => r.studentid !== Default_Test_Student_ID);
    db.tables.schoolusers = db.tables.schoolusers.filter((r) => r.schooluserid !== uuid(8801));
  };
  /**
   * A report told neither a learner nor a class answers for one fixed test learner. That learner is reached only
   * when the caller may read the learner: elsewhere the answer is the one for no such learner at all.
   */
  const fixedLearner = (path: string, body: object, platformSees: (res: request.Response) => void, xSees: (res: request.Response) => void) => {
    it.each(IN_X)("%s: told no learner or class, never answers for a fixed test learner who is another organisation's or no organisation's", async (who) => {
      const none = said(await send(who, "post", path, body));
      placeFixedLearner(TY);
      expect(said(await send(who, "post", path, body))).toEqual(none);
      removeFixedLearner();
      placeFixedLearner(TU);
      expect(said(await send(who, "post", path, body))).toEqual(none);
    });
    it.each(IN_X)("%s: told no learner or class, answers for the fixed test learner when the learner is X's", async (who) => {
      placeFixedLearner(TX);
      xSees(await send(who, "post", path, body).expect(200));
    });
    it("a platform user not acting: told no learner or class, answers for the fixed test learner wherever the learner is", async () => {
      placeFixedLearner(TY);
      platformSees(await send(NOT_ACTING, "post", path, body).expect(200));
    });
  };
  const FIXED = Default_Test_Student_ID;

  describe("POST /report/student-grade-progress", () => {
    const path = "/report/student-grade-progress";
    it.each(IN_X)("%s: X's class lists X's learners, none of Y's or the unowned", async (who) => {
      const res = await send(who, "post", path, page([{ key: "standard", value: TX.klass }])).expect(200);
      expect(idsOf(data(res), "studentid")).toEqual(sorted(...TX.learners.map((l) => l.id)));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: another organisation's class, and the unowned one, answer as one that is not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "standard"), [TY.klass, TU.klass]);
      expect(absent.status).toBe(200);
      expect(absent.body.data).toEqual({ data: [], total: 0, pageindex: 1, pagesize: 20 });
    });
    it.each(IN_X)("%s: another organisation's grade, and the unowned one, answer as one that is not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "gradeid", [{ key: "standard", value: TX.klass }]), [TY.grade, TU.grade]);
      expect(absent.status).toBe(200);
    });
    it("a platform user not acting: reaches every organisation's class, and the unowned one", async () => {
      const y = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TY.klass }])).expect(200);
      expect(idsOf(data(y), "studentid")).toEqual(sorted(...TY.learners.map((l) => l.id)));
      const u = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TU.klass }])).expect(200);
      expect(idsOf(data(u), "studentid")).toEqual(sorted(...TU.learners.map((l) => l.id)));
    });
    it.each(IN_X)("%s: a learner of X enrolled on a curriculum that is not X's reads none of its content", async (who) => {
      const [y, u] = await enrolments(async () => said(await send(who, "post", path, page([{ key: "standard", value: TX.klass }]))));
      expect(y).not.toContain(TY.schoolname);
      expect(u).not.toContain(TU.schoolname);
    });
    fixedLearner(
      path,
      page(),
      (res) => expect(idsOf(data(res), "studentid")).toEqual(sorted(FIXED, ...TY.learners.map((l) => l.id))),
      (res) => expect(idsOf(data(res), "studentid")).toEqual(sorted(FIXED, ...TX.learners.map((l) => l.id))),
    );
  });

  describe("POST /report/student-level-progress", () => {
    const path = "/report/student-level-progress";
    const learnerOf = (res: request.Response) => (res.body.data as { student: Row | null }).student;
    it.each(IN_X)("%s: X's learner lists X's content and the learner, none of Y's", async (who) => {
      const res = await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }])).expect(200);
      expect(idsOf(data(res), "levelid")).toEqual([TX.level]);
      expect(learnerOf(res)).toMatchObject({ studentfirstname: TX.learners[0].first });
    });
    it.each(IN_X)("%s: another organisation's learner, and the unowned one, answer as one that is not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "studentid"), [TY.learners[0].id, TU.learners[0].id]);
      expect(absent.status).toBe(200);
      expect(absent.body.data).toEqual({ data: [], total: 0, student: null, pageindex: 1, pagesize: 20 });
    });
    it.each(IN_X)("%s: a grade of another organisation, with X's learner, answers as a grade that is not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "gradeid", [{ key: "studentid", value: TX.learners[0].id }]), [TY.grade, TU.grade]);
      expect(absent.status).toBe(200);
    });
    it("a platform user not acting: reaches every organisation's learners, and the unowned one", async () => {
      const y = await send(NOT_ACTING, "post", path, page([{ key: "studentid", value: TY.learners[0].id }])).expect(200);
      expect(idsOf(data(y), "levelid")).toEqual([TY.level]);
      expect(learnerOf(y)).toMatchObject({ studentfirstname: TY.learners[0].first });
      const u = await send(NOT_ACTING, "post", path, page([{ key: "studentid", value: TU.learners[0].id }])).expect(200);
      expect(learnerOf(u)).toMatchObject({ studentfirstname: TU.learners[0].first });
    });
    it.each(IN_X)("%s: a learner of X enrolled on a curriculum that is not X's reads none of its content", async (who) => {
      const [y, u] = await enrolments(async () => said(await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }]))));
      expect(y).not.toContain(TY.schoolname);
      expect(u).not.toContain(TU.schoolname);
    });
    fixedLearner(
      path,
      page(),
      (res) => expect(learnerOf(res)).toMatchObject({ studentfirstname: "សាកល្បង" }),
      (res) => expect(learnerOf(res)).toMatchObject({ studentfirstname: "សាកល្បង" }),
    );
  });

  describe("POST /report/student-lesson-progress", () => {
    const path = "/report/student-lesson-progress";
    const learnerOf = (res: request.Response) => (res.body.data as { student: Row | null }).student;
    it.each(IN_X)("%s: X's learner lists X's content and the learner, none of Y's", async (who) => {
      const res = await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }])).expect(200);
      expect(idsOf(data(res), "lessonid")).toEqual([TX.lesson]);
      expect(learnerOf(res)).toMatchObject({ studentfirstname: TX.learners[0].first });
    });
    it.each(IN_X)("%s: another organisation's learner, and the unowned one, answer as one that is not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "studentid"), [TY.learners[0].id, TU.learners[0].id]);
      expect(absent.status).toBe(200);
      expect(absent.body.data).toEqual({ data: [], total: 0, student: null, pageindex: 1, pagesize: 20 });
    });
    it.each(IN_X)("%s: a grade of another organisation, with X's learner, answers as a grade that is not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "gradeid", [{ key: "studentid", value: TX.learners[0].id }]), [TY.grade, TU.grade]);
      expect(absent.status).toBe(200);
    });
    it("a platform user not acting: reaches every organisation's learners, and the unowned one", async () => {
      const y = await send(NOT_ACTING, "post", path, page([{ key: "studentid", value: TY.learners[0].id }])).expect(200);
      expect(idsOf(data(y), "lessonid")).toEqual([TY.lesson]);
      expect(learnerOf(y)).toMatchObject({ studentfirstname: TY.learners[0].first });
      const u = await send(NOT_ACTING, "post", path, page([{ key: "studentid", value: TU.learners[0].id }])).expect(200);
      expect(learnerOf(u)).toMatchObject({ studentfirstname: TU.learners[0].first });
    });
    it.each(IN_X)("%s: a learner of X enrolled on a curriculum that is not X's reads none of its content", async (who) => {
      const [y, u] = await enrolments(async () => said(await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }]))));
      expect(y).not.toContain(TY.schoolname);
      expect(u).not.toContain(TU.schoolname);
    });
    fixedLearner(
      path,
      page(),
      (res) => expect(learnerOf(res)).toMatchObject({ studentfirstname: "សាកល្បង" }),
      (res) => expect(learnerOf(res)).toMatchObject({ studentfirstname: "សាកល្បង" }),
    );
  });

  // ─────────── the reports of one learner's lessons or levels (with a download), and of a class's learners ───────────

  describe("POST /report/studentprogress", () => {
    const path = "/report/studentprogress";
    const about = (res: request.Response) => idsOf(data(res).map((r) => r.student as Row), "studentid");
    it("the application's own key and a school-user token are not admitted", async () => {
      expect(await refusedTokens("post", path, page([{ key: "studentid", value: TX.learners[0].id }]))).toEqual({ key: 401, teacher: 403 });
    });
    it.each(IN_X)("%s: X's learner lists X's content for X's learner", async (who) => {
      const byLearner = await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }])).expect(200);
      expect(idsOf(data(byLearner), "lessonid")).toEqual([TX.lesson]);
      expect(about(byLearner)).toEqual([TX.learners[0].id]);
      const own = await send(who, "post", path, page([{ key: "studentid", value: TX.learners[1].id }, { key: "curriculumid", value: TX.curriculum }])).expect(200);
      expect(about(own)).toEqual([TX.learners[1].id]);
      const byClass = await send(who, "post", path, page([{ key: "standard", value: TX.klass }])).expect(200);
      expect(about(byClass)).toEqual([TX.learners[0].id]);
    });
    it.each(IN_X)("%s: another organisation's learner, and the unowned one, answer as one that is not there", async (who) => {
      const learner = await asAbsent(who, "post", asking(path, "studentid"), [TY.learners[0].id, TU.learners[0].id]);
      expect(learner.status).toBe(200);
      expect((learner.body.data as { data: Row[]; total: number }).data).toEqual([]);
    });
    it.each(IN_X)("%s: another organisation's class, curriculum, grade and level, and the unowned ones, answer as ones that are not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "standard"), [TY.klass, TU.klass]);
      expect(absent.status).toBe(200);
      for (const [key, field] of [["curriculumid", "curriculum"], ["gradeid", "grade"], ["levelid", "level"]] as const) {
        const one = await asAbsent(who, "post", asking(path, key, [{ key: "studentid", value: TX.learners[0].id }]), [TY[field], TU[field]]);
        expect(one.status).toBe(200);
      }
    });
    it("a platform user not acting: reaches every organisation's learner, and the unowned one", async () => {
      const y = await send(NOT_ACTING, "post", path, page([{ key: "studentid", value: TY.learners[2].id }])).expect(200);
      expect(about(y)).toEqual([TY.learners[2].id]);
      const u = await send(NOT_ACTING, "post", path, page([{ key: "studentid", value: TU.learners[3].id }])).expect(200);
      expect(about(u)).toEqual([TU.learners[3].id]);
    });
    it.each(IN_X)("%s: a learner of X enrolled on a curriculum that is not X's reads none of its content", async (who) => {
      const [y, u] = await enrolments(async () => said(await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }]))));
      expect(y).not.toContain(TY.schoolname);
      expect(u).not.toContain(TU.schoolname);
    });
    fixedLearner(
      path,
      page(),
      (res) => expect(about(res)).toEqual([FIXED]),
      (res) => expect(about(res)).toEqual([FIXED]),
    );
  });

  describe("POST /report/studentprogress/download", () => {
    const file = "/report/studentprogress/download";
    it.each(IN_X)("%s: X's learner is in the file, none of Y's or the unowned", async (who) => {
      const { res, text } = await csvOf(who, file, page([{ key: "studentid", value: TX.learners[0].id }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      expect(text).toContain(TX.learners[0].loginname);
      expect(text).toContain(TX.schoolname);
      for (const other of [TY, TU]) {
        expect(text).not.toContain(other.schoolname);
        for (const l of other.learners) expect(text).not.toContain(l.loginname);
      }
    });
    it.each(IN_X)("%s: another organisation's learner, and the unowned one, give the file of one that is not there", async (who) => {
      const absent = await csvOf(who, file, page([{ key: "studentid", value: MISSING }]));
      for (const other of [TY, TU]) {
        const got = await csvOf(who, file, page([{ key: "studentid", value: other.learners[0].id }]));
        expect(csvAnswer(got.res)).toEqual(csvAnswer(absent.res));
      }
    });
    it("a platform user not acting: any learner is in the file", async () => {
      const { text } = await csvOf(NOT_ACTING, file, page([{ key: "studentid", value: TY.learners[0].id }]));
      expect(text).toContain(TY.learners[0].loginname);
    });
  });

  describe("POST /report/studentlevelquiz", () => {
    const path = "/report/studentlevelquiz";
    const about = (res: request.Response) => idsOf(data(res).map((r) => r.student as Row), "studentid");
    it.each(IN_X)("%s: X's learner lists X's content for X's learner", async (who) => {
      const byLearner = await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }])).expect(200);
      expect(idsOf(data(byLearner), "levelid")).toEqual([TX.level]);
      expect(about(byLearner)).toEqual([TX.learners[0].id]);
      const own = await send(who, "post", path, page([{ key: "studentid", value: TX.learners[1].id }, { key: "curriculumid", value: TX.curriculum }])).expect(200);
      expect(about(own)).toEqual([TX.learners[1].id]);
    });
    it.each(IN_X)("%s: another organisation's learner, and the unowned one, answer as one that is not there", async (who) => {
      const learner = await asAbsent(who, "post", asking(path, "studentid"), [TY.learners[0].id, TU.learners[0].id]);
      expect(learner.status).toBe(200);
      expect((learner.body.data as { data: Row[]; total: number }).data).toEqual([]);
    });
    it.each(IN_X)("%s: another organisation's curriculum, grade and level, and the unowned ones, answer as ones that are not there", async (who) => {
      for (const [key, field] of [["curriculumid", "curriculum"], ["gradeid", "grade"], ["levelid", "level"]] as const) {
        const one = await asAbsent(who, "post", asking(path, key, [{ key: "studentid", value: TX.learners[0].id }]), [TY[field], TU[field]]);
        expect(one.status).toBe(200);
      }
    });
    it("a platform user not acting: reaches every organisation's learner, and the unowned one", async () => {
      const y = await send(NOT_ACTING, "post", path, page([{ key: "studentid", value: TY.learners[2].id }])).expect(200);
      expect(about(y)).toEqual([TY.learners[2].id]);
      const u = await send(NOT_ACTING, "post", path, page([{ key: "studentid", value: TU.learners[3].id }])).expect(200);
      expect(about(u)).toEqual([TU.learners[3].id]);
    });
    it.each(IN_X)("%s: a learner of X enrolled on a curriculum that is not X's reads none of its content", async (who) => {
      const [y, u] = await enrolments(async () => said(await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }]))));
      expect(y).not.toContain(TY.schoolname);
      expect(u).not.toContain(TU.schoolname);
    });
    fixedLearner(
      path,
      page(),
      (res) => expect(about(res)).toEqual([FIXED]),
      (res) => expect(about(res)).toEqual([FIXED]),
    );
  });

  describe("POST /report/studentlevelquiz/download", () => {
    const file = "/report/studentlevelquiz/download";
    it.each(IN_X)("%s: X's learner is in the file, none of Y's or the unowned", async (who) => {
      const { res, text } = await csvOf(who, file, page([{ key: "studentid", value: TX.learners[0].id }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      expect(text).toContain(TX.learners[0].loginname);
      expect(text).toContain(TX.schoolname);
      for (const other of [TY, TU]) {
        expect(text).not.toContain(other.schoolname);
        for (const l of other.learners) expect(text).not.toContain(l.loginname);
      }
    });
    it.each(IN_X)("%s: another organisation's learner, and the unowned one, give the file of one that is not there", async (who) => {
      const absent = await csvOf(who, file, page([{ key: "studentid", value: MISSING }]));
      for (const other of [TY, TU]) {
        const got = await csvOf(who, file, page([{ key: "studentid", value: other.learners[0].id }]));
        expect(csvAnswer(got.res)).toEqual(csvAnswer(absent.res));
      }
    });
    it("a platform user not acting: any learner is in the file", async () => {
      const { text } = await csvOf(NOT_ACTING, file, page([{ key: "studentid", value: TY.learners[0].id }]));
      expect(text).toContain(TY.learners[0].loginname);
    });
  });

  describe("POST /report/studentprogress/class", () => {
    const path = "/report/studentprogress/class";
    it.each(IN_X)("%s: X's class lists X's learners, none of Y's or the unowned", async (who) => {
      const res = await send(who, "post", path, page([{ key: "standard", value: TX.klass }])).expect(200);
      expect(idsOf(data(res), "studentid")).toEqual(sorted(...TX.learners.map((l) => l.id)));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: another organisation's class, lesson and level, and the unowned ones, answer as ones that are not there", async (who) => {
      await asAbsent(who, "post", asking(path, "standard"), [TY.klass, TU.klass]);
      const lesson = await asAbsent(who, "post", asking(path, "lessonid", [{ key: "standard", value: TX.klass }]), [TY.lesson, TU.lesson]);
      expect(lesson.status).toBe(200);
      const level = await asAbsent(who, "post", asking(path, "levelid", [{ key: "standard", value: TX.klass }]), [TY.level, TU.level]);
      expect(level.status).toBe(200);
    });
    it("a platform user not acting: reaches every organisation's class, and the unowned one", async () => {
      const y = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TY.klass }])).expect(200);
      expect(idsOf(data(y), "studentid")).toEqual(sorted(...TY.learners.map((l) => l.id)));
      const u = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TU.klass }])).expect(200);
      expect(idsOf(data(u), "studentid")).toEqual(sorted(...TU.learners.map((l) => l.id)));
    });
    it.each(IN_X)("%s: a learner of X enrolled on a curriculum that is not X's reads none of its content", async (who) => {
      const [y, u] = await enrolments(async () => said(await send(who, "post", path, page([{ key: "standard", value: TX.klass }]))));
      expect(y).not.toContain(TY.schoolname);
      expect(u).not.toContain(TU.schoolname);
    });
    fixedLearner(
      path,
      page(),
      (res) => expect(idsOf(data(res), "studentid")).toEqual(sorted(FIXED, ...TY.learners.map((l) => l.id))),
      (res) => expect(idsOf(data(res), "studentid")).toEqual(sorted(FIXED, ...TX.learners.map((l) => l.id))),
    );
  });

  describe("POST /report/studentprogress/class/download", () => {
    const file = "/report/studentprogress/class/download";
    it.each(IN_X)("%s: X's class is in the file, none of Y's or the unowned", async (who) => {
      const { res, text } = await csvOf(who, file, page([{ key: "standard", value: TX.klass }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      for (const l of TX.learners) expect(text).toContain(l.loginname);
      for (const other of [TY, TU]) {
        expect(text).not.toContain(other.schoolname);
        for (const l of other.learners) expect(text).not.toContain(l.loginname);
      }
    });
    it.each(IN_X)("%s: another organisation's class, and the unowned one, give the file of one that is not there", async (who) => {
      const absent = await csvOf(who, file, page([{ key: "standard", value: MISSING }]));
      for (const other of [TY, TU]) {
        const got = await csvOf(who, file, page([{ key: "standard", value: other.klass }]));
        expect(csvAnswer(got.res)).toEqual(csvAnswer(absent.res));
      }
    });
    it("a platform user not acting: any class is in the file", async () => {
      const { text } = await csvOf(NOT_ACTING, file, page([{ key: "standard", value: TY.klass }]));
      for (const l of TY.learners) expect(text).toContain(l.loginname);
    });
  });

  describe("POST /report/studentlevelquiz/class", () => {
    const path = "/report/studentlevelquiz/class";
    it.each(IN_X)("%s: X's class lists X's learners, none of Y's or the unowned", async (who) => {
      const res = await send(who, "post", path, page([{ key: "standard", value: TX.klass }])).expect(200);
      expect(idsOf(data(res), "studentid")).toEqual(sorted(...TX.learners.map((l) => l.id)));
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: another organisation's class, lesson and level, and the unowned ones, answer as ones that are not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "standard"), [TY.klass, TU.klass]);
      expect(absent.status).toBe(200);
      const lesson = await asAbsent(who, "post", asking(path, "lessonid", [{ key: "standard", value: TX.klass }]), [TY.lesson, TU.lesson]);
      expect(lesson.status).toBe(200);
      const level = await asAbsent(who, "post", asking(path, "levelid", [{ key: "standard", value: TX.klass }]), [TY.level, TU.level]);
      expect(level.status).toBe(200);
    });
    it("a platform user not acting: reaches every organisation's class, and the unowned one", async () => {
      const y = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TY.klass }])).expect(200);
      expect(idsOf(data(y), "studentid")).toEqual(sorted(...TY.learners.map((l) => l.id)));
      const u = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TU.klass }])).expect(200);
      expect(idsOf(data(u), "studentid")).toEqual(sorted(...TU.learners.map((l) => l.id)));
    });
    it.each(IN_X)("%s: a learner of X enrolled on a curriculum that is not X's reads none of its content", async (who) => {
      const [y, u] = await enrolments(async () => said(await send(who, "post", path, page([{ key: "standard", value: TX.klass }]))));
      expect(y).not.toContain(TY.schoolname);
      expect(u).not.toContain(TU.schoolname);
    });
    fixedLearner(
      path,
      page(),
      (res) => expect(idsOf(data(res), "studentid")).toEqual(sorted(FIXED, ...TY.learners.map((l) => l.id))),
      (res) => expect(idsOf(data(res), "studentid")).toEqual(sorted(FIXED, ...TX.learners.map((l) => l.id))),
    );
  });

  describe("POST /report/studentlevelquiz/class/download", () => {
    const file = "/report/studentlevelquiz/class/download";
    it.each(IN_X)("%s: X's class is in the file, none of Y's or the unowned", async (who) => {
      const { res, text } = await csvOf(who, file, page([{ key: "standard", value: TX.klass }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      for (const l of TX.learners) expect(text).toContain(l.loginname);
      for (const other of [TY, TU]) {
        expect(text).not.toContain(other.schoolname);
        for (const l of other.learners) expect(text).not.toContain(l.loginname);
      }
    });
    it.each(IN_X)("%s: another organisation's class, and the unowned one, give the file of one that is not there", async (who) => {
      const absent = await csvOf(who, file, page([{ key: "standard", value: MISSING }]));
      for (const other of [TY, TU]) {
        const got = await csvOf(who, file, page([{ key: "standard", value: other.klass }]));
        expect(csvAnswer(got.res)).toEqual(csvAnswer(absent.res));
      }
    });
    it("a platform user not acting: any class is in the file", async () => {
      const { text } = await csvOf(NOT_ACTING, file, page([{ key: "standard", value: TY.klass }]));
      for (const l of TY.learners) expect(text).toContain(l.loginname);
    });
  });

  // ───────────────────────── the last completed quiz and the status reports (a school can be named) ─────────────────────────

  describe("POST /report/studentlastcompletedquiz", () => {
    const path = "/report/studentlastcompletedquiz";
    const own = sorted(...TX.learners.map((l) => l.id));
    it.each(IN_X)("%s: X's class, school (by id or name), country, curriculum and learner list X's learners only", async (who) => {
      const byClass = await send(who, "post", path, page([{ key: "standard", value: TX.klass }])).expect(200);
      expect(idsOf(data(byClass), "studentid")).toEqual(own);
      expect(byClass.body.data.total).toBe(2);
      for (const more of [
        { key: "schoolid", value: TX.school },
        { key: "schoolname", value: TX.schoolname },
        { key: "countryid", value: TX.country },
        { key: "curriculumid", value: TX.curriculum },
        { key: "gradeid", value: TX.grade },
        { key: "levelid", value: TX.level },
        { key: "lessonid", value: TX.lesson },
      ]) {
        const res = await send(who, "post", path, page([{ key: "standard", value: TX.klass }, more])).expect(200);
        expect([more.key, idsOf(data(res), "studentid")]).toEqual([more.key, own]);
      }
      const one = await send(who, "post", path, page([{ key: "studentid", value: TX.learners[1].id }])).expect(200);
      expect(idsOf(data(one), "studentid")).toEqual([TX.learners[1].id]);
    });
    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, answer as one that is not there", async (who) => {
      const inClass = [{ key: "standard", value: TX.klass }];
      const byId = await asAbsent(who, "post", asking(path, "schoolid", inClass), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await asAbsent(who, "post", asking(path, "schoolname", inClass), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName).toEqual(byId);
    });
    it.each(IN_X)("%s: another organisation's class, learner, curriculum, grade, level, lesson and country, and the unowned ones, answer as ones that are not there", async (who) => {
      await asAbsent(who, "post", asking(path, "standard"), [TY.klass, TU.klass]);
      await asAbsent(who, "post", asking(path, "studentid"), [TY.learners[0].id, TU.learners[0].id]);
      for (const [key, field] of [["curriculumid", "curriculum"], ["gradeid", "grade"], ["levelid", "level"], ["lessonid", "lesson"], ["countryid", "country"]] as const) {
        await asAbsent(who, "post", asking(path, key, [{ key: "standard", value: TX.klass }]), [TY[field], TU[field]]);
      }
    });
    it.each(IN_X)("%s: a school and a class of different organisations are the foreign school's 404", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "schoolid", [{ key: "standard", value: TY.klass }]), [TY.school]);
      expect(absent.status).toBe(404);
    });
    it("a platform user not acting: reaches every organisation's class, school and learner", async () => {
      const y = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TY.klass }, { key: "schoolname", value: TY.schoolname }])).expect(200);
      expect(idsOf(data(y), "studentid")).toEqual(sorted(...TY.learners.map((l) => l.id)));
      const u = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TU.klass }, { key: "schoolid", value: TU.school }])).expect(200);
      expect(idsOf(data(u), "studentid")).toEqual(sorted(...TU.learners.map((l) => l.id)));
    });
    it.each(IN_X)("%s: a learner of X enrolled on a curriculum that is not X's reads none of its content", async (who) => {
      const [y, u] = await enrolments(async () => said(await send(who, "post", path, page([{ key: "standard", value: TX.klass }]))));
      expect(y).not.toContain(TY.schoolname);
      expect(u).not.toContain(TU.schoolname);
    });
    fixedLearner(
      path,
      page(),
      (res) => expect(idsOf(data(res), "studentid")).toEqual([FIXED]),
      (res) => expect(idsOf(data(res), "studentid")).toEqual([FIXED]),
    );
    describe("POST /report/studentlastcompletedquiz/download", () => {
      const file = `${path}/download`;
      it.each(IN_X)("%s: X's class is in the file, none of Y's or the unowned", async (who) => {
        const { res, text } = await csvOf(who, file, page([{ key: "standard", value: TX.klass }]));
        expect(res.status).toBe(200);
        expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
        for (const l of TX.learners) expect(text).toContain(l.loginname);
        expect(text).toContain(TX.schoolname);
        for (const other of [TY, TU]) {
          expect(text).not.toContain(other.schoolname);
          for (const l of other.learners) expect(text).not.toContain(l.loginname);
        }
      });
      it.each(IN_X)("%s: another organisation's class and school, and the unowned ones, give what ones that are not there give", async (who) => {
        const absentClass = await csvOf(who, file, page([{ key: "standard", value: MISSING }]));
        for (const other of [TY, TU]) {
          const got = await csvOf(who, file, page([{ key: "standard", value: other.klass }]));
          expect(got.res.status).toBe(absentClass.res.status);
          expect(got.text).toEqual(absentClass.text);
        }
        const absentSchool = await csvOf(who, file, page([{ key: "schoolid", value: MISSING }]));
        expect(absentSchool.res.status).toBe(404);
        for (const other of [TY, TU]) {
          const got = await csvOf(who, file, page([{ key: "schoolid", value: other.school }]));
          expect(got.res.status).toBe(404);
          expect(withoutReference(JSON.parse(got.text))).toEqual(withoutReference(JSON.parse(absentSchool.text)));
        }
      });
      it("a platform user not acting: any class is in the file", async () => {
        const { text } = await csvOf(NOT_ACTING, file, page([{ key: "standard", value: TY.klass }]));
        for (const l of TY.learners) expect(text).toContain(l.loginname);
      });
    });
  });

  describe("POST /report/studentstatus", () => {
    const path = "/report/studentstatus";
    const own = sorted(...TX.learners.map((l) => l.id));
    it.each(IN_X)("%s: lists X's learners with no filter, none of Y's or the unowned", async (who) => {
      const res = await send(who, "post", path, page()).expect(200);
      expect(idsOf(data(res), "studentid")).toEqual(own);
      expect(res.body.data.total).toBe(2);
    });
    it.each(IN_X)("%s: X's school (by id or name), class, country and learner list X's learners only", async (who) => {
      for (const filter of [
        [{ key: "schoolid", value: TX.school }],
        [{ key: "schoolname", value: TX.schoolname }],
        [{ key: "standard", value: TX.klass }],
        [{ key: "countryid", value: TX.country }],
      ]) {
        const res = await send(who, "post", path, page(filter)).expect(200);
        expect(idsOf(data(res), "studentid")).toEqual(own);
      }
      const one = await send(who, "post", path, page([{ key: "studentid", value: TX.learners[0].id }])).expect(200);
      expect(idsOf(data(one), "studentid")).toEqual([TX.learners[0].id]);
    });
    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, answer as one that is not there", async (who) => {
      const byId = await asAbsent(who, "post", asking(path, "schoolid"), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await asAbsent(who, "post", asking(path, "schoolname"), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName).toEqual(byId);
    });
    it.each(IN_X)("%s: another organisation's class, learner and country, and the unowned ones, answer as ones that are not there", async (who) => {
      const klass = await asAbsent(who, "post", asking(path, "standard"), [TY.klass, TU.klass]);
      expect(klass.body.data).toEqual({ data: [], total: 0, pageindex: 1, pagesize: 20 });
      await asAbsent(who, "post", asking(path, "studentid"), [TY.learners[0].id, TU.learners[0].id]);
      await asAbsent(who, "post", asking(path, "countryid"), [TY.country, TU.country]);
    });
    it("a staff account limited to schools: its school list is read within X's schools, and another organisation's is the 404 of an unknown school", async () => {
      const limited = (schools: string[]) =>
        request(app.getHttpServer())
          .post(path)
          .set("Authorization", bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false, schools }))
          .set("Connection", "close")
          .send(page());
      const own2 = await limited([TX.school]);
      expect(own2.status).toBe(200);
      expect(idsOf(data(own2), "studentid")).toEqual(sorted(...TX.learners.map((l) => l.id)));
      const absent = said(await limited([MISSING]));
      expect(absent.status).toBe(404);
      expect(said(await limited([TY.school]))).toEqual(absent);
      expect(said(await limited([TU.school]))).toEqual(absent);
    });
    it("a platform user not acting: lists every organisation's learners, and any school's", async () => {
      const all = await send(NOT_ACTING, "post", path, page([{ key: "standard", value: TY.klass }])).expect(200);
      expect(idsOf(data(all), "studentid")).toEqual(sorted(...TY.learners.map((l) => l.id)));
      const bySchool = await send(NOT_ACTING, "post", path, page([{ key: "schoolname", value: TU.schoolname }])).expect(200);
      expect(idsOf(data(bySchool), "studentid")).toEqual(sorted(...TU.learners.map((l) => l.id)));
      const everyone = await send(NOT_ACTING, "post", path, page()).expect(200);
      expect(everyone.body.data.total).toBe(10);
    });
    describe("POST /report/studentstatus/download", () => {
      const file = `${path}/download`;
      it.each(IN_X)("%s: with no filter the file holds X's learners, none of Y's or the unowned", async (who) => {
        const { res, text } = await csvOf(who, file, page());
        expect(res.status).toBe(200);
        expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
        for (const l of TX.learners) expect(text).toContain(l.loginname);
        for (const other of [TY, TU]) {
          expect(text).not.toContain(other.schoolname);
          for (const l of other.learners) expect(text).not.toContain(l.loginname);
        }
      });
      it.each(IN_X)("%s: X's school and class are in the file; another organisation's, and the unowned ones, give what ones that are not there give", async (who) => {
        const own3 = await csvOf(who, file, page([{ key: "schoolname", value: TX.schoolname }, { key: "standard", value: TX.klass }]));
        for (const l of TX.learners) expect(own3.text).toContain(l.loginname);
        const absentSchool = await csvOf(who, file, page([{ key: "schoolname", value: MISSING_NAME }]));
        expect(absentSchool.res.status).toBe(404);
        const absentClass = await csvOf(who, file, page([{ key: "standard", value: MISSING }]));
        for (const other of [TY, TU]) {
          const school = await csvOf(who, file, page([{ key: "schoolname", value: other.schoolname }]));
          expect(school.res.status).toBe(404);
          expect(withoutReference(JSON.parse(school.text))).toEqual(withoutReference(JSON.parse(absentSchool.text)));
          const klass = await csvOf(who, file, page([{ key: "standard", value: other.klass }]));
          expect(klass.text).toEqual(absentClass.text);
        }
      });
      it("a platform user not acting: every learner is in the file", async () => {
        const { text } = await csvOf(NOT_ACTING, file, page());
        for (const t of TREES) for (const l of t.learners) expect(text).toContain(l.loginname);
      });
    });
  });

  // ───────────────────────── sync records and technical downtime ─────────────────────────

  describe("POST /report/syncrecords", () => {
    const path = "/report/syncrecords";
    it.each(IN_X)("%s: lists the sync records of X's schools, none of Y's or the unowned", async (who) => {
      const res = await send(who, "post", path, page()).expect(200);
      expect(idsOf(data(res), "syncid")).toEqual(sorted(...TX.syncs));
      expect(res.body.data.total).toBe(1);
      const byLogin = await send(who, "post", path, page([{ key: "created_by", value: TX.teachers[0] }])).expect(200);
      expect(idsOf(data(byLogin), "syncid")).toEqual(sorted(...TX.syncs));
    });
    it.each(IN_X)("%s: another organisation's login, and the unowned one, answer as one that is not there", async (who) => {
      const absent = await asAbsent(who, "post", asking(path, "created_by"), [TY.teachers[0], TU.teachers[0]]);
      expect(absent.status).toBe(200);
      expect(absent.body.data).toEqual({ data: [], total: 0, pageindex: 1, pagesize: 20 });
    });
    it("a platform user not acting: lists every organisation's sync records, and the unowned school's", async () => {
      const res = await send(NOT_ACTING, "post", path, page()).expect(200);
      expect(idsOf(data(res), "syncid")).toEqual(sorted(...TX.syncs, ...TY.syncs, ...TU.syncs));
      const y = await send(NOT_ACTING, "post", path, page([{ key: "created_by", value: TY.teachers[0] }])).expect(200);
      expect(idsOf(data(y), "syncid")).toEqual(sorted(...TY.syncs));
    });
  });

  describe("POST /report/techdowntime", () => {
    const path = "/report/techdowntime";
    const body = { startDate: "2024-01-01", endDate: "2024-12-31" };
    const counts = (res: request.Response) => Object.fromEntries((res.body.data as Array<{ name: string; value: number }>).map((c) => [c.name, c.value]));
    it.each(IN_X)("%s: counts the feedback about X's curriculums, none of Y's or the unowned", async (who) => {
      const res = await send(who, "post", path, body).expect(200);
      expect(counts(res)).toEqual({ RPI: 1, Router: 0, Content: 0, Tablet: 0, App: 0, General: 0 });
    });
    it("a platform user not acting: counts every organisation's feedback, and the unowned curriculum's", async () => {
      const res = await send(NOT_ACTING, "post", path, body).expect(200);
      expect(counts(res)).toEqual({ RPI: 2, Router: 1, Content: 0, Tablet: 0, App: 0, General: 1 });
    });
  });

  // ───────────────────────── the reports the student API answers ─────────────────────────
  //
  // The student API does not know organisations, so what is sent to it is the confinement: the body, exactly, and the
  // headers. Another organisation's school, learner or class, and any reference outside X, are answered here (the 404
  // of an unknown school, or the answer for no rows) and nothing is sent.

  const cloud = (path: string) => `${Config.fortyk.api.rpi.cloud}/report/${path}`;
  const HEADERS_PLATFORM = { Authorization: Config.fortyk.api.serversynckey };
  const HEADERS_X = { ...HEADERS_PLATFORM, "X-Organisation-Id": X };
  const DOWNLOAD_REPLY = { data: { error: false, data: [] } };
  /** A file's answer: its text when it is one, else the refusal (without what differs per request). */
  const csvAnswer = (res: request.Response) => {
    const text = Buffer.isBuffer(res.body) ? (res.body as Buffer).toString("utf8") : "";
    return { status: res.status, body: res.status === 200 ? text : withoutReference(JSON.parse(text)) };
  };
  /** A reference that is not in the caller's scope is answered as one that is not there: the whole answer is the same. */
  const sameAsAbsent = async <T>(answerOf: (ref: string) => Promise<T>, foreign: string[], missing: string = MISSING) => {
    const absent = await answerOf(missing);
    for (const ref of foreign) {
      expect(await answerOf(ref)).toEqual(absent);
    }
    return absent;
  };

  describe("POST /report/online/studentprogress", () => {
    const path = "/report/online/studentprogress";
    const cloudUrl = cloud("studentprogress");
    const key: string = "standard";
    const own = TX.klass;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it("the application's own key and a school-user token are not admitted, and nothing is sent", async () => {
      expect(await refusedTokens("post", path, page([{ key, value: own }]))).toEqual({ key: 401, teacher: 403 });
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentprogress/class", () => {
    const path = "/report/online/studentprogress/class";
    const cloudUrl = cloud("studentprogress/class");
    const key: string = "standard";
    const own = TX.klass;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentprogress/download", () => {
    const path = "/report/online/studentprogress/download";
    const cloudUrl = cloud("studentprogress/download");
    const key: string = "standard";
    const own = TX.klass;
    const reply = DOWNLOAD_REPLY;
    const nothing = DOWNLOAD_REPLY;
    const ask = (who: Who, body: object) => send(who, "post", path, body).buffer(true).parse(textOf as never);
    const answer = (res: request.Response) => csvAnswer(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      expect(answer(res)).toEqual(await noRows());
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentprogress/class/download", () => {
    const path = "/report/online/studentprogress/class/download";
    const cloudUrl = cloud("studentprogress/class/download");
    const key: string = "standard";
    const own = TX.klass;
    const reply = DOWNLOAD_REPLY;
    const nothing = DOWNLOAD_REPLY;
    const ask = (who: Who, body: object) => send(who, "post", path, body).buffer(true).parse(textOf as never);
    const answer = (res: request.Response) => csvAnswer(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      expect(answer(res)).toEqual(await noRows());
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentlastcompletedquiz", () => {
    const path = "/report/online/studentlastcompletedquiz";
    const cloudUrl = cloud("studentlastcompletedquiz");
    const key: string = "standard";
    const own = TX.klass;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key: "schoolid", value: TX.school }, { key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key: "schoolid", value: TX.school }, { key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's school by name, by id, or twice: it is sent as one schoolid, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }]));
      await ask(who, page([{ key, value: own }, { key: "schoolid", value: TX.school }]));
      await ask(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolname", value: TX.schoolname }, { key: "curriculumid", value: TX.curriculum }]));
      await ask(who, { pageindex: 2, pagesize: 50, filter: [{ key: "schoolid", value: [TX.school] }], other: "kept" });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, page([{ key: "curriculumid", value: TX.curriculum }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 2, pagesize: 50, filter: [{ key: "schoolid", value: TX.school }], other: "kept" }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: names no school: X's own schools are sent, and nothing else of the filter is lost", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key, value: own }]));
      await ask(who, { pageindex: 1, pagesize: 20 });
      await ask(who, { pageindex: 1, pagesize: 20, filter: "everything" });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: [TX.school] }]), { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: [TX.school] }] }, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: [TX.school] }] }, { headers: HEADERS_X }],
      ]);
    });
    it("an organisation with no school is sent nothing: the answer is the one for no rows", async () => {
      db.tables.schools = db.tables.schools.filter((r) => r.organisationid !== X);
      const none = await noRows();
      expect(await answerFor("X's Organisation Admin", page([{ key, value: own }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentlastcompletedquiz/download", () => {
    const path = "/report/online/studentlastcompletedquiz/download";
    const cloudUrl = cloud("studentlastcompletedquiz/download");
    const key: string = "standard";
    const own = TX.klass;
    const reply = DOWNLOAD_REPLY;
    const nothing = DOWNLOAD_REPLY;
    const ask = (who: Who, body: object) => send(who, "post", path, body).buffer(true).parse(textOf as never);
    const answer = (res: request.Response) => csvAnswer(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key: "schoolid", value: TX.school }, { key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      expect(answer(res)).toEqual(await noRows());
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key: "schoolid", value: TX.school }, { key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's school by name, by id, or twice: it is sent as one schoolid, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }]));
      await ask(who, page([{ key, value: own }, { key: "schoolid", value: TX.school }]));
      await ask(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolname", value: TX.schoolname }, { key: "curriculumid", value: TX.curriculum }]));
      await ask(who, { pageindex: 2, pagesize: 50, filter: [{ key: "schoolid", value: [TX.school] }], other: "kept" });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, page([{ key: "curriculumid", value: TX.curriculum }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 2, pagesize: 50, filter: [{ key: "schoolid", value: TX.school }], other: "kept" }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: names no school: X's own schools are sent, and nothing else of the filter is lost", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key, value: own }]));
      await ask(who, { pageindex: 1, pagesize: 20 });
      await ask(who, { pageindex: 1, pagesize: 20, filter: "everything" });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: [TX.school] }]), { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: [TX.school] }] }, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: [TX.school] }] }, { headers: HEADERS_X }],
      ]);
    });
    it("an organisation with no school is sent nothing: the answer is the one for no rows", async () => {
      db.tables.schools = db.tables.schools.filter((r) => r.organisationid !== X);
      const none = await noRows();
      expect(await answerFor("X's Organisation Admin", page([{ key, value: own }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/studentlevelquiz/online", () => {
    const path = "/report/studentlevelquiz/online";
    const cloudUrl = cloud("studentlevelquiz");
    const key: string = "studentid";
    const own = TX.learners[0].id;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentlevelquiz/class", () => {
    const path = "/report/online/studentlevelquiz/class";
    const cloudUrl = cloud("studentlevelquiz/class");
    const key: string = "standard";
    const own = TX.klass;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentlevelquiz/download", () => {
    const path = "/report/online/studentlevelquiz/download";
    const cloudUrl = cloud("studentlevelquiz/download");
    const key: string = "studentid";
    const own = TX.learners[0].id;
    const reply = DOWNLOAD_REPLY;
    const nothing = DOWNLOAD_REPLY;
    const ask = (who: Who, body: object) => send(who, "post", path, body).buffer(true).parse(textOf as never);
    const answer = (res: request.Response) => csvAnswer(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      expect(answer(res)).toEqual(await noRows());
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentlevelquiz/class/download", () => {
    const path = "/report/online/studentlevelquiz/class/download";
    const cloudUrl = cloud("studentlevelquiz/class/download");
    const key: string = "standard";
    const own = TX.klass;
    const reply = DOWNLOAD_REPLY;
    const nothing = DOWNLOAD_REPLY;
    const ask = (who: Who, body: object) => send(who, "post", path, body).buffer(true).parse(textOf as never);
    const answer = (res: request.Response) => csvAnswer(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      expect(answer(res)).toEqual(await noRows());
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/studentstatus", () => {
    const path = "/report/online/studentstatus";
    const cloudUrl = cloud("studentstatus");
    const key: string = "standard";
    const own = TX.klass;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key: "schoolid", value: TX.school }, { key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key: "schoolid", value: TX.school }, { key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's school by name, by id, or twice: it is sent as one schoolid, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }]));
      await ask(who, page([{ key, value: own }, { key: "schoolid", value: TX.school }]));
      await ask(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolname", value: TX.schoolname }, { key: "curriculumid", value: TX.curriculum }]));
      await ask(who, { pageindex: 2, pagesize: 50, filter: [{ key: "schoolid", value: [TX.school] }], other: "kept" });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, page([{ key: "curriculumid", value: TX.curriculum }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 2, pagesize: 50, filter: [{ key: "schoolid", value: TX.school }], other: "kept" }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: names no school: X's own schools are sent, and nothing else of the filter is lost", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key, value: own }]));
      await ask(who, { pageindex: 1, pagesize: 20 });
      await ask(who, { pageindex: 1, pagesize: 20, filter: "everything" });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: [TX.school] }]), { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: [TX.school] }] }, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: [TX.school] }] }, { headers: HEADERS_X }],
      ]);
    });
    it("an organisation with no school is sent nothing: the answer is the one for no rows", async () => {
      db.tables.schools = db.tables.schools.filter((r) => r.organisationid !== X);
      const none = await noRows();
      expect(await answerFor("X's Organisation Admin", page([{ key, value: own }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a staff account limited to schools: its school list is read within X's schools, and another organisation's is the 404 of an unknown school", async () => {
      const limited = (schools: string[]) =>
        request(app.getHttpServer())
          .post(path)
          .set("Authorization", bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false, schools }))
          .set("Connection", "close")
          .send(page([{ key, value: own }]));
      (axios.post as jest.Mock).mockResolvedValue(reply);
      expect((await limited([TX.school])).status).toBe(200);
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }]]);
      const absent = answer(await limited([MISSING]));
      expect(absent.status).toBe(404);
      expect(answer(await limited([TY.school]))).toEqual(absent);
      expect(answer(await limited([TU.school]))).toEqual(absent);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

  });

  describe("POST /report/online/studentstatus/download", () => {
    const path = "/report/online/studentstatus/download";
    const cloudUrl = cloud("studentstatus/download");
    const key: string = "standard";
    const own = TX.klass;
    const reply = DOWNLOAD_REPLY;
    const nothing = DOWNLOAD_REPLY;
    const ask = (who: Who, body: object) => send(who, "post", path, body).buffer(true).parse(textOf as never);
    const answer = (res: request.Response) => csvAnswer(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key: "schoolid", value: TX.school }, { key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe('attachment; filename="report.csv"');
      expect(answer(res)).toEqual(await noRows());
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key: "schoolid", value: TX.school }, { key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's school by name, by id, or twice: it is sent as one schoolid, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }]));
      await ask(who, page([{ key, value: own }, { key: "schoolid", value: TX.school }]));
      await ask(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolname", value: TX.schoolname }, { key: "curriculumid", value: TX.curriculum }]));
      await ask(who, { pageindex: 2, pagesize: 50, filter: [{ key: "schoolid", value: [TX.school] }], other: "kept" });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, page([{ key: "curriculumid", value: TX.curriculum }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 2, pagesize: 50, filter: [{ key: "schoolid", value: TX.school }], other: "kept" }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: names no school: X's own schools are sent, and nothing else of the filter is lost", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key, value: own }]));
      await ask(who, { pageindex: 1, pagesize: 20 });
      await ask(who, { pageindex: 1, pagesize: 20, filter: "everything" });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, page([{ key, value: own }, { key: "schoolid", value: [TX.school] }]), { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: [TX.school] }] }, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: [TX.school] }] }, { headers: HEADERS_X }],
      ]);
    });
    it("an organisation with no school is sent nothing: the answer is the one for no rows", async () => {
      db.tables.schools = db.tables.schools.filter((r) => r.organisationid !== X);
      const none = await noRows();
      expect(await answerFor("X's Organisation Admin", page([{ key, value: own }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a staff account limited to schools: its school list is read within X's schools, and another organisation's is the 404 of an unknown school", async () => {
      const limited = (schools: string[]) =>
        request(app.getHttpServer())
          .post(path)
          .set("Authorization", bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false, schools }))
          .set("Connection", "close")
          .send(page([{ key, value: own }])).buffer(true).parse(textOf as never);
      (axios.post as jest.Mock).mockResolvedValue(reply);
      expect((await limited([TX.school])).status).toBe(200);
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }, { key: "schoolid", value: TX.school }]), { headers: HEADERS_X }]]);
      const absent = answer(await limited([MISSING]));
      expect(absent.status).toBe(404);
      expect(answer(await limited([TY.school]))).toEqual(absent);
      expect(answer(await limited([TU.school]))).toEqual(absent);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

  });

  describe("POST /report/online/student-grade-progress", () => {
    const path = "/report/online/student-grade-progress";
    const cloudUrl = cloud("student-grade-progress");
    const key: string = "standard";
    const own = TX.klass;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/student-level-progress", () => {
    const path = "/report/online/student-level-progress";
    const cloudUrl = cloud("student-level-progress");
    const key: string = "studentid";
    const own = TX.learners[0].id;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], student: { studentfirstname: "cloud" }, total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], student: null, total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });

  describe("POST /report/online/student-lesson-progress", () => {
    const path = "/report/online/student-lesson-progress";
    const cloudUrl = cloud("student-lesson-progress");
    const key: string = "studentid";
    const own = TX.learners[0].id;
    const reply = { data: { error: false, data: { data: [{ studentid: "cloud-row" }], student: { studentfirstname: "cloud" }, total: 1, pageindex: 1, pagesize: 20 } } };
    const nothing = { data: { error: false, data: { data: [], student: null, total: 0, pageindex: 1, pagesize: 20 } } };
    const ask = (who: Who, body: object) => send(who, "post", path, body);
    const answer = (res: request.Response) => said(res);
    const answerFor = async (who: Who, body: object) => answer(await ask(who, body));
    /** What the route says when the student API has no rows. */
    const noRows = async () => {
      (axios.post as jest.Mock).mockResolvedValueOnce(nothing);
      const said1 = await answerFor(NOT_ACTING, page());
      (axios.post as jest.Mock).mockClear();
      return said1;
    };

    it.each(IN_X)("%s: another organisation's school, by id or name, and the unowned one, are the 404 of an unknown school and nothing is sent", async (who) => {
      const byId = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: id }, { key, value: own }])), [TY.school, TU.school]);
      expect(byId.status).toBe(404);
      const byName = await sameAsAbsent((n) => answerFor(who, page([{ key: "schoolname", value: n }, { key, value: own }])), [TY.schoolname, TU.schoolname], MISSING_NAME);
      expect(byName.status).toBe(404);
      // every school the body names is checked, whichever entry it is in
      const second = await sameAsAbsent((id) => answerFor(who, page([{ key: "schoolid", value: TX.school }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(second.status).toBe(404);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: another organisation's learner, class, curriculum, grade, level, lesson and country, and the unowned ones, get the answer for no rows and nothing is sent", async (who) => {
      const none = await noRows();
      const named: Array<[string, (t: Tree) => string]> = [
        ["studentid", (t) => t.learners[0].id],
        ["standard", (t) => t.klass],
        ["curriculumid", (t) => t.curriculum],
        ["gradeid", (t) => t.grade],
        ["levelid", (t) => t.level],
        ["lessonid", (t) => t.lesson],
        ["countryid", (t) => t.country],
      ];
      expect(await answerFor(who, page([{ key: "studentid", value: MISSING }]))).toEqual(none);
      for (const [field, of] of named) {
        for (const t of [TY, TU]) {
          // a reference outside X's scope is answered as one that is not there, with or without X's own beside it
          expect(await answerFor(who, page([{ key: field, value: of(t) }, { key, value: own }]))).toEqual(none);
          expect(await answerFor(who, page([{ key, value: own }, { key: field, value: of(t) }]))).toEqual(none);
        }
      }
      // a list of ids with one that is not X's
      expect(await answerFor(who, page([{ key: "studentid", value: [TX.learners[0].id, TY.learners[0].id] }]))).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });
    it("a platform user not acting: sends the body exactly as it came, with the server key and no organisation", async () => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key: "schoolname", value: TY.schoolname }, { key: "studentid", value: TY.learners[0].id }, { key: "schoolid", value: [TX.school, MISSING] }]);
      const res = await ask(NOT_ACTING, body);
      expect(res.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(cloudUrl, body, { headers: HEADERS_PLATFORM });
    });
    it.each(IN_X)("%s: the student API's answer is handed back as it is", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const res = await ask(who, page([{ key, value: own }]));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(reply.data);
    });
    it.each(IN_X)("%s: an error from the student API is the error it always was", async (who) => {
      const own500 = await ask(who, page([{ key, value: own }]));
      expect(own500.status).toBe(500);
      const platform500 = await ask(NOT_ACTING, page([{ key, value: own }]));
      expect(platform500.status).toBe(500);
      expect(answer(own500)).toEqual(answer(platform500));
    });

    it.each(IN_X)("%s: names X's learner or class: the body is sent as it is, with X's id in the header", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      const body = page([{ key, value: own }, { key: "curriculumid", value: TX.curriculum }, { key: "gradeid", value: TX.grade }]);
      await ask(who, body);
      await ask(who, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] });
      expect((axios.post as jest.Mock).mock.calls).toEqual([
        [cloudUrl, body, { headers: HEADERS_X }],
        [cloudUrl, { pageindex: 3, pagesize: 5, filter: [{ key, value: own }] }, { headers: HEADERS_X }],
      ]);
    });
    it.each(IN_X)("%s: a school that is named is X's, resolved and not sent (the report takes no school)", async (who) => {
      (axios.post as jest.Mock).mockResolvedValue(reply);
      await ask(who, page([{ key: "schoolname", value: TX.schoolname }, { key, value: own }, { key: "schoolid", value: TX.school }]));
      expect((axios.post as jest.Mock).mock.calls).toEqual([[cloudUrl, page([{ key, value: own }]), { headers: HEADERS_X }]]);
    });
    it.each(IN_X)("%s: another organisation's school is the 404 of an unknown school though the report takes no school", async (who) => {
      const absent = await sameAsAbsent((id) => answerFor(who, page([{ key, value: own }, { key: "schoolid", value: id }])), [TY.school, TU.school]);
      expect(absent.status).toBe(404);
    });
    it.each(IN_X)("%s: names no learner and no class: the answer is the one for no rows and nothing is sent (the fixed test learner is not X's to read)", async (who) => {
      const none = await noRows();
      expect(await answerFor(who, page([{ key: "curriculumid", value: TX.curriculum }]))).toEqual(none);
      expect(await answerFor(who, { pageindex: 1, pagesize: 20 })).toEqual(none);
      expect(axios.post).not.toHaveBeenCalled();
    });

  });
});
