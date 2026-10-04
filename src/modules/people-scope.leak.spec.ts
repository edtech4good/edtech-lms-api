import AdmZip from "adm-zip";
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
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { CountryController } from "./country/country.controller";
import { ExportController } from "./export/export.controller";
import { ImportController } from "./import/import.controller";
import { SchoolContributeController } from "./school-contribute/school-contribute.controller";
import { SchoolController } from "./school/school.controller";
import { StandardController } from "./standard/standard.controller";
import { StudentController } from "./students/student.controller";
import { TeacherController } from "./teachers/teacher.controller";

/**
 * Schools, and the learners, logins, classes and fees rows that hang off a school, are
 * confined to the caller's organisation (school-scope.ts). Driven over real HTTP through
 * the real strategy, guards, controllers, validators and business classes; replaced are
 * the models (an in-memory copy of the tables the routes read and write), the token
 * lookup, the transaction, the raw progress queries, and the cloud server.
 *
 * Fixtures: organisations X and Y each have a school (Khmer names), a learner with a
 * login, a teacher login, a class and a Fees Collection row; one school belongs to no
 * organisation and has a learner. Callers: X's Organisation Admin, X's Admin, a platform
 * user acting as X, a platform user not acting, and the application's server token.
 *
 * For every route: the caller's own rows answer 200 with only their own data; another
 * organisation's row, by id or by name, and a school with no organisation, are a 404 that
 * is the SAME 404 as for an id that does not exist, and nothing is written; a list holds
 * the caller's rows and none of the others; a platform user not acting, and the server
 * token on the routes that admit it, still reach every organisation's rows.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn() } }));
// the per-learner progress tables are not under test; an export of learners still reaches this
jest.mock("src/business/studentprogress.business", () => ({
  StudentProgress: jest.fn().mockImplementation(() => ({
    getstudentprogress: async () => ({
      studentprogress: [],
      studentgradesprogress: [],
      studentlearningprogress: [],
      studentlessonsprogress: [],
      studentlevelsprogress: [],
    }),
  })),
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = uuid(101); // linked to X
const C2 = uuid(102); // linked to Y
const C3 = uuid(103); // linked to nobody
const S_X = uuid(201);
const S_Y = uuid(202);
const S_U = uuid(203); // no organisation
const NAME_X = "សាលាបឋមសិក្សា ក";
const NAME_Y = "សាលាបឋមសិក្សា ខ";
const NAME_U = "សាលាគ្មានម្ចាស់";
const CUR_X = uuid(301);
const CUR_Y = uuid(302);
const STU_X = uuid(401);
const STU_Y = uuid(402);
const STU_U = uuid(403);
const USR_X = uuid(411); // a learner's login
const USR_Y = uuid(412);
const USR_U = uuid(413);
const TCH_X = uuid(421); // a teacher's login
const TCH_Y = uuid(422);
const K_X = uuid(501); // a class
const K_Y = uuid(502);
const K_U = uuid(503);
const F_X = uuid(601); // a Fees Collection row
const F_Y = uuid(602);
const F_U = uuid(603);
const MISSING = uuid(999);
const KNOWN_NAME_NOT_THERE = "សាលាដែលមិនមាន";

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
} as const;
type Who = keyof typeof callers;
const IN_X: Who[] = ["X's Organisation Admin", "X's Admin", "a platform user acting as X"];
const WHOLE_PLATFORM: Who[] = ["a platform user not acting"];
// a school-user (teacher) token, as a classroom login is issued one: no staff claims at all
const teacherLogin = bearer({ schooluserid: uuid(499), schooluserrole: SchoolRole.TEACHER });

type Row = Record<string, unknown>;
const idsOf = (rows: Row[], key: string) => rows.map((r) => r[key] as string).sort();
const sorted = (...ids: string[]) => [...ids].sort();
const KHMER_FIRST = { X: "សុខា", Y: "ដារា", U: "វិបុល" };

const withoutReference = (body: Row) => {
  const { reference, logid, stack, ...rest } = body;
  return rest;
};
const refusalOf = (res: request.Response) => ({ status: res.status, body: withoutReference(JSON.parse((res.body as Buffer).toString("utf8"))) });

const textOf = (res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};
const zipEntry = (res: request.Response, name: string) => JSON.parse(new AdmZip(res.body as Buffer).readAsText(name));

/** Rows of every table, as the routes find them. */
const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("countries", { countryid: C1, countryname: "កម្ពុជា", expectedusage: 1 });
  db.add("countries", { countryid: C2, countryname: "Laos", expectedusage: 1 });
  db.add("countries", { countryid: C3, countryname: "Vietnam", expectedusage: 1 });
  db.add("organisationcountry", { organisationcountryid: uuid(701), organisationid: X, countryid: C1 });
  db.add("organisationcountry", { organisationcountryid: uuid(702), organisationid: Y, countryid: C2 });
  db.add("curriculums", { curriculumid: CUR_X, curriculumname: "ភាសាខ្មែរ ក", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_Y, curriculumname: "ភាសាខ្មែរ ខ", organisationid: Y, curriculumstatus: true });
  db.add("schools", { schoolid: S_X, schoolname: NAME_X, organisationid: X, countryid: C1, curriculums: [CUR_X] });
  db.add("schools", { schoolid: S_Y, schoolname: NAME_Y, organisationid: Y, countryid: C2, curriculums: [CUR_Y] });
  db.add("schools", { schoolid: S_U, schoolname: NAME_U, organisationid: null, countryid: C3, curriculums: [] });
  const login = (schooluserid: string, school: string, name: string, role: SchoolRole, who: string) =>
    db.add("schoolusers", { schooluserid, schoolusername: who, schooluserrole: role, schoolid: school, schoolname: name, schooluserstatus: true, schooluserpasswordhash: "hash" });
  const learner = (studentid: string, schooluserid: string, school: string, name: string, first: string, klass: string, cur: string) =>
    db.add("students", {
      studentid, schooluserid, schoolid: school, schoolname: name, studentfirstname: first, studentlastname: "ចាន់", standard: klass,
      curriculumid: cur, curriculumids: [cur], genderid: 1, isactive: 1, is_teacher_acc: false, type: "online", created_at: new Date("2024-01-01"),
    });
  login(USR_X, S_X, NAME_X, SchoolRole.STUDENT, "learnerx");
  login(USR_Y, S_Y, NAME_Y, SchoolRole.STUDENT, "learnery");
  login(USR_U, S_U, NAME_U, SchoolRole.STUDENT, "learneru");
  login(TCH_X, S_X, NAME_X, SchoolRole.TEACHER, "teacherx");
  login(TCH_Y, S_Y, NAME_Y, SchoolRole.TEACHER, "teachery");
  db.add("standards", { standardid: K_X, standardname: "ថ្នាក់ទី១", schoolid: S_X, schoolname: NAME_X });
  db.add("standards", { standardid: K_Y, standardname: "ថ្នាក់ទី២", schoolid: S_Y, schoolname: NAME_Y });
  db.add("standards", { standardid: K_U, standardname: "ថ្នាក់ទី៣", schoolid: S_U, schoolname: NAME_U });
  learner(STU_X, USR_X, S_X, NAME_X, KHMER_FIRST.X, K_X, CUR_X);
  learner(STU_Y, USR_Y, S_Y, NAME_Y, KHMER_FIRST.Y, K_Y, CUR_Y);
  learner(STU_U, USR_U, S_U, NAME_U, KHMER_FIRST.U, K_U, CUR_X);
  const fees = (id: string, school: string, name: string, country: string, expected: number) =>
    db.add("schoolcontributedata", { schoolcontributeid: id, schoolid: school, schoolname: name, countryid: country, expected, actual: expected / 10, created_at: new Date("2020-01-15T10:00:00Z") });
  fees(F_X, S_X, NAME_X, C1, 111);
  fees(F_Y, S_Y, NAME_Y, C2, 222);
  fees(F_U, S_U, NAME_U, C3, 333);
};

describe("people and schools are confined to the caller's organisation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [SchoolController, StandardController, StudentController, TeacherController, SchoolContributeController, ExportController, ImportController, CountryController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    // listening once for the whole file: a listener opened and closed for each request is what an odd "Parse Error" comes from
    await app.listen(0);
  });
  afterAll(async () => app.close());

  let queries: Array<{ sql: string; replacements: unknown[] }>;
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    tokenExists.mockResolvedValue(true);
    db.install();
    seed();
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    // the raw SQL (a learner's progress, a learner's last login): answered with the learner the query was asked about
    queries = [];
    jest.spyOn(dbinstance.getdbinstance(), "query").mockImplementation((async (sql: string, o?: { replacements?: unknown[] }) => {
      queries.push({ sql, replacements: o?.replacements ?? [] });
      return /rpiuseraccess/.test(sql) ? [] : [{ studentid: o?.replacements?.[0] }];
    }) as never);
    (axios.post as jest.Mock).mockReset().mockRejectedValue(new Error("no cloud in a test"));
    (axios.put as jest.Mock).mockReset().mockResolvedValue({ status: 200 });
  });

  const send = (who: Who, method: "get" | "post" | "put" | "delete", path: string, body?: object) => {
    // one connection per request: the routes that refuse before reading a body must not leave bytes for the next
    const r = request(app.getHttpServer())[method](path).set("Authorization", callers[who]).set("Connection", "close");
    return body ? r.send(body) : r;
  };
  const enc = encodeURIComponent;
  /** What a refusal says, without the per-request reference. */
  /** The whole refusal (status and body), without what differs per request. */
  const said = (res: request.Response) => ({ status: res.status, body: withoutReference(res.body) });
  const learnersOf = (res: request.Response) => idsOf(res.body.data as Row[], "studentid");

  // a refusal that must have written nothing is checked against every table as it stood just before
  const refuses = async (who: Who, method: "get" | "post" | "put" | "delete", path: string, body?: object) => {
    const before = db.snapshot();
    const res = await send(who, method, path, body);
    expect(db.snapshot()).toEqual(before);
    return res;
  };

  /** 404, the same one an id that does not exist gets, nothing written. */
  const expectNotFoundLikeMissing = async (who: Who, method: "get" | "post" | "put" | "delete", foreign: string, missing: string, body?: object) => {
    const res = await refuses(who, method, foreign, body);
    const none = await refuses(who, method, missing, body);
    expect(res.status).toBe(404);
    expect(said(res)).toEqual(said(none));
  };

  /**
   * The row in the path is the one checked: a request for Y's row that also names X's own row elsewhere in the
   * request is the 404 a row that is not there gets for the same request, with every table unchanged.
   */
  const pathRowChecked = async (who: Who, method: "get" | "post" | "put" | "delete", foreign: string, missing: string, body: object) => {
    const res = await refuses(who, method, foreign, body);
    const none = await refuses(who, method, missing, body);
    return { res, none };
  };

  // ───────────────────────────── schools ─────────────────────────────

  describe("GET /school", () => {
    it.each(IN_X)("%s: lists the schools that have learners, X's only", async (who) => {
      const res = await send(who, "get", "/school").expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([S_X]);
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still reaches every organisation's schools, and the school with none", async (who) => {
      const res = await send(who, "get", "/school").expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual(sorted(S_X, S_Y, S_U));
    });
  });

  describe("GET /school/all", () => {
    it.each(IN_X)("%s: lists X's schools, none of Y's or the school with no organisation", async (who) => {
      const res = await send(who, "get", "/school/all").expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([S_X]);
    });
    it.each(IN_X)("%s: a search for another organisation's school finds nothing", async (who) => {
      const res = await send(who, "get", `/school/all?school=${enc(NAME_Y)}`).expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([]);
      const asked = await send(who, "get", `/school/all?countryid=${C2}`).expect(200);
      expect(idsOf(asked.body.data, "schoolid")).toEqual([]);
    });
    it("a platform user not acting: lists every school", async () => {
      const res = await send("a platform user not acting", "get", "/school/all").expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual(sorted(S_X, S_Y, S_U));
    });
  });

  describe("GET /school/country/:countryid", () => {
    it.each(IN_X)("%s: X's schools of X's country", async (who) => {
      const res = await send(who, "get", `/school/country/${C1}`).expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([S_X]);
    });
    it.each(IN_X)("%s: another organisation's country, and the unowned school's, hold none of X's schools", async (who) => {
      const y = await send(who, "get", `/school/country/${C2}`).expect(200);
      expect(idsOf(y.body.data, "schoolid")).toEqual([]);
      const u = await send(who, "get", `/school/country/${C3}`).expect(200);
      expect(idsOf(u.body.data, "schoolid")).toEqual([]);
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still reaches every organisation's schools", async (who) => {
      const y = await send(who, "get", `/school/country/${C2}`).expect(200);
      expect(idsOf(y.body.data, "schoolid")).toEqual([S_Y]);
      const u = await send(who, "get", `/school/country/${C3}`).expect(200);
      expect(idsOf(u.body.data, "schoolid")).toEqual([S_U]);
    });
  });

  describe("GET /school/country/:countryid/curriculum/:curriculumid", () => {
    it.each(IN_X)("%s: X's schools of that country and curriculum", async (who) => {
      const res = await send(who, "get", `/school/country/${C1}/curriculum/${CUR_X}`).expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([S_X]);
    });
    it.each(IN_X)("%s: another organisation's country and curriculum hold none of X's schools", async (who) => {
      const res = await send(who, "get", `/school/country/${C2}/curriculum/${CUR_Y}`).expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([]);
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still reaches every organisation's schools", async (who) => {
      const res = await send(who, "get", `/school/country/${C2}/curriculum/${CUR_Y}`).expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([S_Y]);
    });
  });

  describe("GET /school/curriculumid", () => {
    it.each(IN_X)("%s: X's schools with the curriculum", async (who) => {
      const res = await send(who, "get", `/school/curriculumid?curriculumid=${CUR_X}`).expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([S_X]);
      const other = await send(who, "get", `/school/curriculumid?curriculumid=${CUR_Y}`).expect(200);
      expect(idsOf(other.body.data, "schoolid")).toEqual([]);
    });
    it("a platform user not acting: every organisation's schools with the curriculum", async () => {
      const res = await send("a platform user not acting", "get", `/school/curriculumid?curriculumid=${CUR_Y}`).expect(200);
      expect(idsOf(res.body.data, "schoolid")).toEqual([S_Y]);
    });
  });

  describe("POST /school", () => {
    const list = (who: Who, body: object = { pageindex: 1, pagesize: 50, filter: [] }) => send(who, "post", "/school", body);
    it.each(IN_X)("%s: lists X's schools, none of Y's or the school with no organisation", async (who) => {
      const res = await list(who).expect(200);
      expect(idsOf(res.body.data.data, "schoolid")).toEqual([S_X]);
      expect(res.body.data.total).toBe(1);
    });
    it.each(IN_X)("%s: a filter cannot widen the list to another organisation's school", async (who) => {
      const res = await list(who, { pageindex: 1, pagesize: 50, filter: [{ key: "schoolname", value: NAME_Y }] }).expect(200);
      expect(idsOf(res.body.data.data, "schoolid")).toEqual([]);
      const wide = await list(who, { pageindex: 1, pagesize: 50, filter: [{ key: "countryid", value: C2 }] }).expect(200);
      expect(idsOf(wide.body.data.data, "schoolid")).toEqual([]);
    });
    it("a platform user not acting: lists every school", async () => {
      const res = await list("a platform user not acting").expect(200);
      expect(idsOf(res.body.data.data, "schoolid")).toEqual(sorted(S_X, S_Y, S_U));
    });
  });

  describe("GET /school/:schoolid", () => {
    it.each(IN_X)("%s: X's school", async (who) => {
      const res = await send(who, "get", `/school/${S_X}`).expect(200);
      expect(res.body.data).toMatchObject({ schoolid: S_X, schoolname: NAME_X });
    });
    it.each(IN_X)("%s: Y's school, and the school with no organisation, are the 404 an id that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/school/${S_Y}`, `/school/${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/school/${S_U}`, `/school/${MISSING}`);
    });
    it("a platform user not acting: any school, with or without an organisation", async () => {
      for (const id of [S_X, S_Y, S_U]) {
        const res = await send("a platform user not acting", "get", `/school/${id}`).expect(200);
        expect(res.body.data.schoolid).toBe(id);
      }
    });
  });

  describe("GET /school/:schoolid/curriculums", () => {
    it.each(IN_X)("%s: X's school's curriculums", async (who) => {
      const res = await send(who, "get", `/school/${S_X}/curriculums`).expect(200);
      expect(res.body.data.map((c: Row) => c.curriculumid)).toEqual([CUR_X]);
    });
    it.each(IN_X)("%s: Y's school, and the school with no organisation, are the 404 an id that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/school/${S_Y}/curriculums`, `/school/${MISSING}/curriculums`);
      await expectNotFoundLikeMissing(who, "get", `/school/${S_U}/curriculums`, `/school/${MISSING}/curriculums`);
    });
    it("a platform user not acting: any school's curriculums", async () => {
      const res = await send("a platform user not acting", "get", `/school/${S_Y}/curriculums`).expect(200);
      expect(res.body.data.map((c: Row) => c.curriculumid)).toEqual([CUR_Y]);
    });
  });

  describe("POST /school/create", () => {
    const body = (over: object = {}) => ({ schoolname: "សាលាថ្មី", countryid: C1, curriculums: [], ...over });
    it.each(IN_X)("%s: the school is X's, whatever the body says about the organisation", async (who) => {
      await send(who, "post", "/school/create", body()).expect(200);
      expect(db.createdIn("schools")).toHaveLength(1);
      expect(db.createdIn("schools")[0]).toMatchObject({ schoolname: "សាលាថ្មី", organisationid: X });
    });
    it.each(IN_X)("%s: a school for another organisation is refused (403), nothing is written", async (who) => {
      const res = await refuses(who, "post", "/school/create", body({ organisationid: Y, countryid: C2 }));
      expect(res.status).toBe(403);
      db.nothingCreated();
    });
    it("a platform user not acting names the organisation in the body (or none)", async () => {
      await send("a platform user not acting", "post", "/school/create", body({ schoolname: "សាលា ក", organisationid: Y, countryid: C2 })).expect(200);
      await send("a platform user not acting", "post", "/school/create", body({ schoolname: "សាលា ខ" })).expect(200);
      expect(db.createdIn("schools").map((s) => s.organisationid ?? null)).toEqual([Y, null]);
    });
    it("a server token is refused (401): the route does not admit it", async () => {
      const res = await refuses("a server token", "post", "/school/create", body());
      expect(res.status).toBe(401);
      db.nothingCreated();
    });
    it("a school name is unique across organisations, so X cannot create a school with the name of Y's: the 409 says only that the name is taken", async () => {
      const res = await refuses("X's Admin", "post", "/school/create", body({ schoolname: NAME_Y }));
      expect(res.status).toBe(409);
      expect(res.body.errormessage).toBe("That school already exists.");
    });
  });

  describe("PUT /school/update/:schoolid", () => {
    it.each(IN_X)("%s: a request that names another row in its body besides the one in the path is refused (400), unchanged", async (who) => {
      const res = await refuses(who, "put", `/school/update/${S_Y}`, { ...edit({ countryid: C2 }), schoolid: S_X });
      expect(res.status).toBe(400);
    });
    const edit = (over: object = {}) => ({ schoolname: "សាលាដាក់ឈ្មោះថ្មី", countryid: C1, curriculums: [CUR_X], ...over });
    it.each(IN_X)("%s: renames X's school and the copies of the name that hang off it", async (who) => {
      await send(who, "put", `/school/update/${S_X}`, edit()).expect(200);
      const stored = (table: "schools" | "students" | "schoolusers" | "standards" | "schoolcontributedata") =>
        db.tables[table].filter((r) => r.schoolid === S_X).map((r) => r.schoolname);
      expect(stored("schools")).toEqual(["សាលាដាក់ឈ្មោះថ្មី"]);
      expect(stored("students")).toEqual(["សាលាដាក់ឈ្មោះថ្មី"]);
      expect(stored("schoolusers")).toEqual(["សាលាដាក់ឈ្មោះថ្មី", "សាលាដាក់ឈ្មោះថ្មី"]);
      expect(stored("standards")).toEqual(["សាលាដាក់ឈ្មោះថ្មី"]);
      expect(stored("schoolcontributedata")).toEqual(["សាលាដាក់ឈ្មោះថ្មី"]);
      // and nobody else's
      expect(db.tables.schools.find((s) => s.schoolid === S_Y)!.schoolname).toBe(NAME_Y);
    });
    it.each(IN_X)("%s: Y's school, and the school with no organisation, are the 404 an id that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "put", `/school/update/${S_Y}`, `/school/update/${MISSING}`, edit({ countryid: C2, curriculums: [CUR_Y] }));
      await expectNotFoundLikeMissing(who, "put", `/school/update/${S_U}`, `/school/update/${MISSING}`, edit({ countryid: C3, curriculums: [] }));
    });
    it.each(IN_X)("%s: X's own school cannot be handed to another organisation (403), unchanged", async (who) => {
      const res = await refuses(who, "put", `/school/update/${S_X}`, edit({ organisationid: Y }));
      expect(res.status).toBe(403);
    });
    it("a platform user not acting: renames any school", async () => {
      await send("a platform user not acting", "put", `/school/update/${S_Y}`, edit({ countryid: C2, curriculums: [CUR_Y] })).expect(200);
      expect(db.tables.schools.find((s) => s.schoolid === S_Y)!.schoolname).toBe("សាលាដាក់ឈ្មោះថ្មី");
    });
  });

  describe("DELETE /school/:schoolid", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's school, with X's own school named in the request, is the 404 a missing school gets, unchanged", async (who) => {
      const { res, none } = await pathRowChecked(who, "delete", `/school/${S_Y}`, `/school/${MISSING}`, { schoolid: uuid(211) });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    beforeEach(() => {
      // schools with no learners (a school with learners cannot be deleted)
      db.add("schools", { schoolid: uuid(211), schoolname: "ទទេ ក", organisationid: X, countryid: C1, curriculums: [] });
      db.add("schools", { schoolid: uuid(212), schoolname: "ទទេ ខ", organisationid: Y, countryid: C2, curriculums: [] });
    });
    it.each(IN_X)("%s: deletes X's school", async (who) => {
      await send(who, "delete", `/school/${uuid(211)}`).expect(200);
      expect(db.tables.schools.find((s) => s.schoolid === uuid(211))!.isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's school (with learners, or without) and the school with no organisation are the 404 an id that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "delete", `/school/${S_Y}`, `/school/${MISSING}`);
      await expectNotFoundLikeMissing(who, "delete", `/school/${uuid(212)}`, `/school/${MISSING}`);
      await expectNotFoundLikeMissing(who, "delete", `/school/${S_U}`, `/school/${MISSING}`);
    });
    it("a platform user not acting: deletes any school without learners", async () => {
      await send("a platform user not acting", "delete", `/school/${uuid(212)}`).expect(200);
      expect(db.tables.schools.find((s) => s.schoolid === uuid(212))!.isdeleted).toBe(true);
    });
  });

  // ───────────────────────────── classes ─────────────────────────────

  describe("GET /standard/all", () => {
    it.each(IN_X)("%s: lists X's classes, none of Y's or the unowned school's", async (who) => {
      const res = await send(who, "get", "/standard/all").expect(200);
      expect(idsOf(res.body.data, "standardid")).toEqual([K_X]);
    });
    it.each(IN_X)("%s: a school of another organisation, by id or by name, is a 404 (as for a school that is not there)", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/standard/all?schoolid=${S_Y}`, `/standard/all?schoolid=${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/standard/all?schoolname=${enc(NAME_Y)}`, `/standard/all?schoolname=${enc(KNOWN_NAME_NOT_THERE)}`);
      await expectNotFoundLikeMissing(who, "get", `/standard/all?schoolid=${S_U}`, `/standard/all?schoolid=${MISSING}`);
    });
    it.each(IN_X)("%s: X's school by id or by name lists its classes", async (who) => {
      const byId = await send(who, "get", `/standard/all?schoolid=${S_X}`).expect(200);
      expect(idsOf(byId.body.data, "standardid")).toEqual([K_X]);
      const byName = await send(who, "get", `/standard/all?schoolname=${enc(NAME_X)}`).expect(200);
      expect(idsOf(byName.body.data, "standardid")).toEqual([K_X]);
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still reaches every organisation's classes", async (who) => {
      const res = await send(who, "get", "/standard/all").expect(200);
      expect(idsOf(res.body.data, "standardid")).toEqual(sorted(K_X, K_Y, K_U));
      const y = await send(who, "get", `/standard/all?schoolid=${S_Y}`).expect(200);
      expect(idsOf(y.body.data, "standardid")).toEqual([K_Y]);
    });
  });

  describe("POST /standard/create", () => {
    const body = (school: string, over: object = {}) => ({ standardname: "ថ្នាក់ថ្មី", schoolid: school, ...over });
    it.each(IN_X)("%s: a class in X's school, with the school's own name", async (who) => {
      await send(who, "post", "/standard/create", body(S_X)).expect(200);
      expect(db.createdIn("standards")).toHaveLength(1);
      expect(db.createdIn("standards")[0]).toMatchObject({ standardname: "ថ្នាក់ថ្មី", schoolid: S_X, schoolname: NAME_X });
    });
    it.each(IN_X)("%s: a class in Y's school, or the unowned one, is the 404 a school that is not there gets, even for a name Y's school already uses", async (who) => {
      const foreign = await refuses(who, "post", "/standard/create", body(S_Y, { standardname: "ថ្នាក់ទី២" }));
      const missing = await refuses(who, "post", "/standard/create", body(MISSING, { standardname: "ថ្នាក់ទី២" }));
      const unowned = await refuses(who, "post", "/standard/create", body(S_U));
      expect([foreign.status, said(foreign)]).toEqual([404, said(missing)]);
      expect(said(unowned)).toEqual(said(missing));
      db.nothingCreated();
    });
    it("a platform user not acting: a class in any school", async () => {
      await send("a platform user not acting", "post", "/standard/create", body(S_Y)).expect(200);
      expect(db.createdIn("standards")[0]).toMatchObject({ schoolid: S_Y, schoolname: NAME_Y });
    });
  });

  describe("DELETE /standard/:standardid", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's class, with X's own class named in the request, is the 404 a missing class gets, unchanged", async (who) => {
      const { res, none } = await pathRowChecked(who, "delete", `/standard/${K_Y}`, `/standard/${MISSING}`, { standardid: K_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    it.each(IN_X)("%s: deletes X's class", async (who) => {
      await send(who, "delete", `/standard/${K_X}`).expect(200);
      expect(db.tables.standards.find((k) => k.standardid === K_X)!.isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's class, and the unowned school's, are the 404 an id that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "delete", `/standard/${K_Y}`, `/standard/${MISSING}`);
      await expectNotFoundLikeMissing(who, "delete", `/standard/${K_U}`, `/standard/${MISSING}`);
    });
    it("a platform user not acting: deletes any class", async () => {
      await send("a platform user not acting", "delete", `/standard/${K_Y}`).expect(200);
      expect(db.tables.standards.find((k) => k.standardid === K_Y)!.isdeleted).toBe(true);
    });
  });

  describe("GET /standard/:standardid", () => {
    it.each(IN_X)("%s: X's class", async (who) => {
      const res = await send(who, "get", `/standard/${K_X}`).expect(200);
      expect(res.body.data).toMatchObject({ standardid: K_X, schoolid: S_X });
    });
    it.each(IN_X)("%s: Y's class, and the unowned school's, are the 404 an id that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/standard/${K_Y}`, `/standard/${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/standard/${K_U}`, `/standard/${MISSING}`);
    });
    it("a platform user not acting: any class", async () => {
      const res = await send("a platform user not acting", "get", `/standard/${K_U}`).expect(200);
      expect(res.body.data.standardid).toBe(K_U);
    });
  });

  describe("PUT /standard/:standardid", () => {
    it.each(IN_X)("%s: a request that names another row in its body besides the one in the path is refused (400), unchanged", async (who) => {
      const res = await refuses(who, "put", `/standard/${K_Y}`, { ...edit(S_X), standardid: K_X });
      expect(res.status).toBe(400);
    });
    const edit = (school: string) => ({ standardname: "ថ្នាក់ដាក់ឈ្មោះថ្មី", schoolid: school });
    it.each(IN_X)("%s: renames X's class", async (who) => {
      await send(who, "put", `/standard/${K_X}`, edit(S_X)).expect(200);
      expect(db.tables.standards.find((k) => k.standardid === K_X)).toMatchObject({ standardname: "ថ្នាក់ដាក់ឈ្មោះថ្មី", schoolid: S_X, schoolname: NAME_X });
    });
    it.each(IN_X)("%s: Y's class is the 404 an id that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "put", `/standard/${K_Y}`, `/standard/${MISSING}`, edit(S_Y));
      await expectNotFoundLikeMissing(who, "put", `/standard/${K_U}`, `/standard/${MISSING}`, edit(S_U));
    });
    it.each(IN_X)("%s: X's class cannot be moved into Y's school (404), unchanged", async (who) => {
      const res = await refuses(who, "put", `/standard/${K_X}`, edit(S_Y));
      expect(res.status).toBe(404);
      expect(db.tables.standards.find((k) => k.standardid === K_X)!.schoolid).toBe(S_X);
    });
    it("a platform user not acting: edits any class", async () => {
      await send("a platform user not acting", "put", `/standard/${K_Y}`, edit(S_Y)).expect(200);
      expect(db.tables.standards.find((k) => k.standardid === K_Y)!.standardname).toBe("ថ្នាក់ដាក់ឈ្មោះថ្មី");
    });
  });

  describe("POST /standard", () => {
    const list = (who: Who, body: object = { pageindex: 1, pagesize: 50, filter: [] }) => send(who, "post", "/standard", body);
    it.each(IN_X)("%s: lists X's classes, none of Y's or the unowned school's", async (who) => {
      const res = await list(who).expect(200);
      expect(idsOf(res.body.data.data, "standardid")).toEqual([K_X]);
    });
    it.each(IN_X)("%s: a filter cannot widen the list to another organisation's classes", async (who) => {
      const res = await list(who, { pageindex: 1, pagesize: 50, filter: [{ key: "schoolid", value: S_Y }] }).expect(200);
      expect(idsOf(res.body.data.data, "standardid")).toEqual([]);
    });
    it("a platform user not acting: lists every class", async () => {
      const res = await list("a platform user not acting").expect(200);
      expect(idsOf(res.body.data.data, "standardid")).toEqual(sorted(K_X, K_Y, K_U));
    });
  });

  describe("GET /standard/school/:schoolid", () => {
    it.each(IN_X)("%s: X's school's classes", async (who) => {
      const res = await send(who, "get", `/standard/school/${S_X}`).expect(200);
      expect(idsOf(res.body.data, "standardid")).toEqual([K_X]);
    });
    it.each(IN_X)("%s: Y's school and the unowned one are the 404 a school that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/standard/school/${S_Y}`, `/standard/school/${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/standard/school/${S_U}`, `/standard/school/${MISSING}`);
    });
    it("a platform user not acting: any school's classes", async () => {
      const res = await send("a platform user not acting", "get", `/standard/school/${S_U}`).expect(200);
      expect(idsOf(res.body.data, "standardid")).toEqual([K_U]);
    });
  });

  // ───────────────────────────── learners ─────────────────────────────

  describe("GET /student/download-students", () => {
    const download = (who: Who, query = "") => send(who, "get", `/student/download-students${query}`).buffer(true).parse(textOf as never);
    const csv = (res: request.Response) => (res.body as Buffer).toString("utf8");
    it.each(IN_X)("%s: the edit file holds X's learners only", async (who) => {
      const res = await download(who).expect(200);
      expect(csv(res)).toContain(KHMER_FIRST.X);
      expect(csv(res)).not.toContain(KHMER_FIRST.Y);
      expect(csv(res)).not.toContain(KHMER_FIRST.U);
    });
    it.each(IN_X)("%s: Y's school, by id or by name, the unowned one, or Y's learner by id, are the 404 a school or learner that is not there gets", async (who) => {
      const refusal = async (query: string) => refusalOf(await download(who, query));
      const missingSchool = await refusal(`?schoolid=${MISSING}`);
      const missingByName = await refusal(`?schoolname=${enc(KNOWN_NAME_NOT_THERE)}`);
      const missingLearner = await refusal(`?studentid=${MISSING}`);
      expect(missingSchool.status).toBe(404);
      for (const [query, like] of [[`?schoolid=${S_Y}`, missingSchool], [`?schoolid=${S_U}`, missingSchool], [`?schoolname=${enc(NAME_Y)}`, missingByName], [`?studentid=${STU_Y}`, missingLearner], [`?studentid=${STU_U}`, missingLearner]] as const) {
        const got = await refusal(query);
        expect(got.status).toBe(404);
        expect(got).toEqual(like);
      }
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still reaches every organisation's learners", async (who) => {
      const res = await download(who).expect(200);
      for (const first of Object.values(KHMER_FIRST)) expect(csv(res)).toContain(first);
      const y = await download(who, `?schoolid=${S_Y}`).expect(200);
      expect(csv(y)).toContain(KHMER_FIRST.Y);
      expect(csv(y)).not.toContain(KHMER_FIRST.X);
    });
  });

  describe("GET /student/all", () => {
    it.each(IN_X)("%s: lists X's learners, none of Y's or the unowned school's", async (who) => {
      const res = await send(who, "get", "/student/all").expect(200);
      expect(learnersOf(res)).toEqual([STU_X]);
    });
    it.each(IN_X)("%s: Y's school or the unowned one, by id or by name, are the 404 a school that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/student/all?schoolid=${S_Y}`, `/student/all?schoolid=${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/student/all?schoolid=${S_U}`, `/student/all?schoolid=${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/student/all?schoolname=${enc(NAME_Y)}`, `/student/all?schoolname=${enc(KNOWN_NAME_NOT_THERE)}`);
    });
    it.each(IN_X)("%s: X's school by id or by name lists its learners", async (who) => {
      const byId = await send(who, "get", `/student/all?schoolid=${S_X}`).expect(200);
      expect(learnersOf(byId)).toEqual([STU_X]);
      const byName = await send(who, "get", `/student/all?schoolname=${enc(NAME_X)}`).expect(200);
      expect(learnersOf(byName)).toEqual([STU_X]);
    });
    it("a platform user not acting: lists every learner", async () => {
      const res = await send("a platform user not acting", "get", "/student/all").expect(200);
      expect(learnersOf(res)).toEqual(sorted(STU_X, STU_Y, STU_U));
    });
  });

  describe("POST /student", () => {
    const list = (who: Who, body: object = { pageindex: 1, pagesize: 50, filter: [] }) => send(who, "post", "/student", body);
    it.each(IN_X)("%s: lists X's learners, none of Y's or the unowned school's, and no password hash", async (who) => {
      const res = await list(who).expect(200);
      expect(idsOf(res.body.data.data, "studentid")).toEqual([STU_X]);
      expect(JSON.stringify(res.body)).not.toContain("schooluserpasswordhash");
    });
    it.each(IN_X)("%s: a filter cannot widen the list to another organisation's learners", async (who) => {
      const byName = await list(who, { pageindex: 1, pagesize: 50, filter: [{ key: "schoolname", value: "សាលា" }] }).expect(200);
      expect(idsOf(byName.body.data.data, "studentid")).toEqual([STU_X]);
      const refused = await refuses(who, "post", "/student", { pageindex: 1, pagesize: 50, filter: [{ key: "schoolid", value: S_Y }] });
      const missing = await refuses(who, "post", "/student", { pageindex: 1, pagesize: 50, filter: [{ key: "schoolid", value: MISSING }] });
      expect([refused.status, said(refused)]).toEqual([404, said(missing)]);
    });
    it("a platform user not acting: lists every learner", async () => {
      const res = await list("a platform user not acting").expect(200);
      expect(idsOf(res.body.data.data, "studentid")).toEqual(sorted(STU_X, STU_Y, STU_U));
    });
  });

  describe("POST /student/create", () => {
    it.each(IN_X)("%s: a class of another school of X's, not the school the learner is enrolled in, is the 404 a class that is not there gets, nothing is written", async (who) => {
      db.add("schools", { schoolid: uuid(241), schoolname: "សាលា ទីពីរ", organisationid: X, countryid: C1, curriculums: [] });
      db.add("standards", { standardid: uuid(242), standardname: "ថ្នាក់ ទីពីរ", schoolid: uuid(241), schoolname: "សាលា ទីពីរ" });
      const res = await refuses(who, "post", "/student/create", body(S_X, CUR_X, uuid(242)));
      const none = await refuses(who, "post", "/student/create", body(S_X, CUR_X, MISSING));
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
      db.nothingCreated();
    });
    const row = (n: number) => ({
      city: "ភ្នំពេញ", country: "Cambodia", dateofjoin: "01-01-2026", studentfirstname: `សុខា${n}`, genderid: "1", state: "Phnom Penh",
      schoolusername: `newlearner${n}`, schooluserpasswordhash: "pass1234",
    });
    const body = (school: string, curriculum: string, klass: string, n = 1) => ({ curriculumid: [curriculum], schoolid: school, standard: klass, students: [row(n)] });
    it.each(IN_X)("%s: enrols a learner in X's school, with the school's own name", async (who) => {
      await send(who, "post", "/student/create", body(S_X, CUR_X, K_X)).expect(200);
      expect(db.createdIn("students")).toHaveLength(1);
      expect(db.createdIn("students")[0]).toMatchObject({ schoolid: S_X, schoolname: NAME_X, studentfirstname: "សុខា1" });
      expect(db.createdIn("schoolusers")[0]).toMatchObject({ schoolid: S_X, schoolname: NAME_X, schoolusername: "newlearner1" });
    });
    it.each(IN_X)("%s: Y's school and the unowned one are the 404 a school that is not there gets, and nothing is written", async (who) => {
      const foreign = await refuses(who, "post", "/student/create", body(S_Y, CUR_Y, K_Y));
      const unowned = await refuses(who, "post", "/student/create", body(S_U, CUR_X, K_U));
      const missing = await refuses(who, "post", "/student/create", body(MISSING, CUR_X, K_X));
      expect(foreign.status).toBe(404);
      expect(said(foreign)).toEqual(said(missing));
      expect(said(unowned)).toEqual(said(missing));
      db.nothingCreated();
    });
    it.each(IN_X)("%s: with ?cloud=true the school is checked before anything is pushed: Y's school is a 404 and nothing is sent", async (who) => {
      const res = await refuses(who, "post", "/student/create?cloud=true", body(S_Y, CUR_Y, K_Y));
      expect(res.status).toBe(404);
      expect(axios.put).not.toHaveBeenCalled();
      db.nothingCreated();
    });
    it.each(IN_X)("%s: with ?cloud=true what is pushed is only what this call created", async (who) => {
      await send(who, "post", "/student/create?cloud=true", body(S_X, CUR_X, K_X)).expect(200);
      expect(axios.put).toHaveBeenCalledTimes(1);
      expect(db.createdIn("students")).toHaveLength(1);
    });
    it.each(IN_X)("%s: a class of another organisation cannot be put on X's new learner (404), nothing is written", async (who) => {
      const res = await refuses(who, "post", "/student/create", body(S_X, CUR_X, K_Y));
      expect(res.status).toBe(404);
      db.nothingCreated();
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still enrols a learner in any school", async (who) => {
      await send(who, "post", "/student/create", body(S_Y, CUR_Y, K_Y)).expect(200);
      expect(db.createdIn("students")[0]).toMatchObject({ schoolid: S_Y, schoolname: NAME_Y });
    });
  });

  describe("DELETE /student/:schooluserid", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's learner, with X's own learner named in the request, is the 404 a missing learner gets, unchanged", async (who) => {
      const { res, none } = await pathRowChecked(who, "delete", `/student/${USR_Y}`, `/student/${MISSING}`, { schooluserid: USR_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    it.each(IN_X)("%s: removes X's learner and their login", async (who) => {
      await send(who, "delete", `/student/${USR_X}`).expect(200);
      expect(db.tables.students.find((s) => s.studentid === STU_X)!.isdeleted).toBe(true);
      expect(db.tables.schoolusers.find((s) => s.schooluserid === USR_X)!.isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's learner and the unowned school's are the 404 a learner that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "delete", `/student/${USR_Y}`, `/student/${MISSING}`);
      await expectNotFoundLikeMissing(who, "delete", `/student/${USR_U}`, `/student/${MISSING}`);
    });
    it("a platform user not acting: removes any learner", async () => {
      await send("a platform user not acting", "delete", `/student/${USR_Y}`).expect(200);
      expect(db.tables.students.find((s) => s.studentid === STU_Y)!.isdeleted).toBe(true);
    });
  });

  describe("GET /student/:studentid", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's learner, with X's own learner named in the request, is the 404 a missing learner gets", async (who) => {
      const { res, none } = await pathRowChecked(who, "get", `/student/${STU_Y}`, `/student/${MISSING}`, { studentid: STU_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    it.each(IN_X)("%s: X's learner", async (who) => {
      const res = await send(who, "get", `/student/${STU_X}`).expect(200);
      expect(res.body.data).toMatchObject({ studentid: STU_X, studentfirstname: KHMER_FIRST.X });
      expect(JSON.stringify(res.body)).not.toContain("schooluserpasswordhash");
    });
    it.each(IN_X)("%s: Y's learner and the unowned school's are the 404 a learner that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/student/${STU_Y}`, `/student/${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/student/${STU_U}`, `/student/${MISSING}`);
    });
    it("a platform user not acting: any learner", async () => {
      for (const id of [STU_X, STU_Y, STU_U]) {
        const res = await send("a platform user not acting", "get", `/student/${id}`).expect(200);
        expect(res.body.data.studentid).toBe(id);
      }
    });
  });

  // the raw progress queries (the rpiuseraccess lookup of a learner's last login is not one of them)
  const progressQueries = () => queries.filter((q) => !/rpiuseraccess/.test(q.sql));

  describe("GET /student/stats/:studentid", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's learner, with X's own learner named in the request, is the 404 a missing learner gets, and nothing is read", async (who) => {
      const { res, none } = await pathRowChecked(who, "get", path(STU_Y), path(MISSING), { studentid: STU_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
      expect(progressQueries()).toEqual([]);
    });
    const path = (id: string) => `/student/stats/${id}`;
    it.each(IN_X)("%s: X's learner's stats are read, for that learner only", async (who) => {
      await send(who, "get", path(STU_X)).expect(200);
      expect(progressQueries()).toHaveLength(1);
      expect(progressQueries()[0].replacements).toEqual([STU_X]);
      expect(progressQueries()[0].sql).toMatch(/FROM\s+students AS ss/);
    });
    it.each(IN_X)("%s: Y's learner and the unowned school's are the 404 a learner that is not there gets, and nothing is read", async (who) => {
      await expectNotFoundLikeMissing(who, "get", path(STU_Y), path(MISSING));
      await expectNotFoundLikeMissing(who, "get", path(STU_U), path(MISSING));
      expect(progressQueries()).toEqual([]);
    });
    it("a platform user not acting: any learner's stats", async () => {
      await send("a platform user not acting", "get", path(STU_Y)).expect(200);
      expect(progressQueries()[0].replacements).toEqual([STU_Y]);
    });
  });

  describe("GET /student/stats/:studentid/level", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's learner, with X's own learner named in the request, is the 404 a missing learner gets, and nothing is read", async (who) => {
      const { res, none } = await pathRowChecked(who, "get", path(STU_Y), path(MISSING), { studentid: STU_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
      expect(progressQueries()).toEqual([]);
    });
    const path = (id: string) => `/student/stats/${id}/level`;
    it.each(IN_X)("%s: X's learner's stats are read, for that learner only", async (who) => {
      await send(who, "get", path(STU_X)).expect(200);
      expect(progressQueries()).toHaveLength(1);
      expect(progressQueries()[0].replacements).toEqual([STU_X]);
      expect(progressQueries()[0].sql).toMatch(/levels\.levelid\s+=\s+sp\.studentprogressreferenceid|studentprogress AS sp/);
    });
    it.each(IN_X)("%s: Y's learner and the unowned school's are the 404 a learner that is not there gets, and nothing is read", async (who) => {
      await expectNotFoundLikeMissing(who, "get", path(STU_Y), path(MISSING));
      await expectNotFoundLikeMissing(who, "get", path(STU_U), path(MISSING));
      expect(progressQueries()).toEqual([]);
    });
    it("a platform user not acting: any learner's stats", async () => {
      await send("a platform user not acting", "get", path(STU_Y)).expect(200);
      expect(progressQueries()[0].replacements).toEqual([STU_Y]);
    });
  });

  describe("GET /student/stats/:studentid/practice", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's learner, with X's own learner named in the request, is the 404 a missing learner gets, and nothing is read", async (who) => {
      const { res, none } = await pathRowChecked(who, "get", path(STU_Y), path(MISSING), { studentid: STU_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
      expect(progressQueries()).toEqual([]);
    });
    const path = (id: string) => `/student/stats/${id}/practice`;
    it.each(IN_X)("%s: X's learner's stats are read, for that learner only", async (who) => {
      await send(who, "get", path(STU_X)).expect(200);
      expect(progressQueries()).toHaveLength(1);
      expect(progressQueries()[0].replacements).toEqual([STU_X]);
      expect(progressQueries()[0].sql).toMatch(/lessonpractices/);
    });
    it.each(IN_X)("%s: Y's learner and the unowned school's are the 404 a learner that is not there gets, and nothing is read", async (who) => {
      await expectNotFoundLikeMissing(who, "get", path(STU_Y), path(MISSING));
      await expectNotFoundLikeMissing(who, "get", path(STU_U), path(MISSING));
      expect(progressQueries()).toEqual([]);
    });
    it("a platform user not acting: any learner's stats", async () => {
      await send("a platform user not acting", "get", path(STU_Y)).expect(200);
      expect(progressQueries()[0].replacements).toEqual([STU_Y]);
    });
  });

  describe("GET /student/stats/:studentid/quiz", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's learner, with X's own learner named in the request, is the 404 a missing learner gets, and nothing is read", async (who) => {
      const { res, none } = await pathRowChecked(who, "get", path(STU_Y), path(MISSING), { studentid: STU_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
      expect(progressQueries()).toEqual([]);
    });
    const path = (id: string) => `/student/stats/${id}/quiz`;
    it.each(IN_X)("%s: X's learner's stats are read, for that learner only", async (who) => {
      await send(who, "get", path(STU_X)).expect(200);
      expect(progressQueries()).toHaveLength(1);
      expect(progressQueries()[0].replacements).toEqual([STU_X]);
      expect(progressQueries()[0].sql).toMatch(/lessonquizzes/);
    });
    it.each(IN_X)("%s: Y's learner and the unowned school's are the 404 a learner that is not there gets, and nothing is read", async (who) => {
      await expectNotFoundLikeMissing(who, "get", path(STU_Y), path(MISSING));
      await expectNotFoundLikeMissing(who, "get", path(STU_U), path(MISSING));
      expect(progressQueries()).toEqual([]);
    });
    it("a platform user not acting: any learner's stats", async () => {
      await send("a platform user not acting", "get", path(STU_Y)).expect(200);
      expect(progressQueries()[0].replacements).toEqual([STU_Y]);
    });
  });

  describe("PUT /student/update", () => {
    it.each(IN_X)("%s: a school of the same name in another organisation neither makes the name ambiguous nor is the learner moved into it", async (who) => {
      db.add("schools", { schoolid: uuid(233), schoolname: NAME_X, organisationid: Y, countryid: C2, curriculums: [] });
      await send(who, "put", "/student/update", { students: [ownRow()] }).expect(200);
      expect(firstName(STU_X)).toBe("ឈ្មោះថ្មី");
      expect(db.tables.students.find((st) => st.studentid === STU_X)!.schoolid).toBe(S_X);
    });
    const rowFor = (studentid: string, schooluserid: string, username: string, schoolname: string, curriculum: string, klass: string) => ({
      studentid, schooluserid, schoolusername: username, schoolname, curriculums: curriculum, standard: klass, studentfirstname: "ឈ្មោះថ្មី", genderid: "1",
      city: "ភ្នំពេញ", country: "Cambodia", state: "Phnom Penh", dateofjoin: "01-01-2026", isactive: 1,
    });
    const ownRow = () => rowFor(STU_X, USR_X, "learnerx", NAME_X, "ភាសាខ្មែរ ក", "ថ្នាក់ទី១");
    const yRow = () => rowFor(STU_Y, USR_Y, "learnery", NAME_Y, "ភាសាខ្មែរ ខ", "ថ្នាក់ទី២");
    const firstName = (id: string) => db.tables.students.find((s) => s.studentid === id)!.studentfirstname;
        const curriculumsOf = (id: string) => db.tables.students.find((s) => s.studentid === id)!.curriculumids;
    it.each(IN_X)("%s: a curriculum of Y's with the same name as X's is not X's: the file enrols X's learner on X's, and writes nothing about Y", async (who) => {
      db.add("curriculums", { curriculumid: uuid(303), curriculumname: "ភាសាខ្មែរ ក", organisationid: Y, curriculumstatus: true });
      // (and a curriculum of X's that is deleted, of the same name, is not one either)
      db.add("curriculums", { curriculumid: uuid(304), curriculumname: "ភាសាខ្មែរ ក", organisationid: X, curriculumstatus: true, isdeleted: true });
      const before = db.snapshot();
      const res = await send(who, "put", "/student/update", { students: [ownRow()] });
      expect(res.status).toBe(200);
      expect(curriculumsOf(STU_X)).toEqual([CUR_X]);
      const after = db.snapshot();
      expect(after.students.find((s) => s.studentid === STU_Y)).toEqual(before.students.find((s) => s.studentid === STU_Y));
      
    });
    describe("a platform user not acting names curriculums by name", () => {
      const NOT_ACTING = "a platform user not acting" as Who;
      const unowned = (n: number, name: string) =>
        db.add("curriculums", { curriculumid: uuid(n), curriculumname: name, organisationid: null, curriculumstatus: true });
      const refusedAs = async (rows: object[]) => {
        const res = await refuses(NOT_ACTING, "put", "/student/update", { students: rows });
        const nobody = await refuses(NOT_ACTING, "put", "/student/update", { students: [{ ...ownRow(), curriculums: "ភាសាដែលមិនមាន" }] });
        expect(res.status).toBe(400);
        expect(said(res)).toEqual(said(nobody));
        expect(res.body.fields).toEqual([{ field: "curriculums", message: "One or more of those curriculums doesn't exist." }]);
      };
      it("an owned curriculum and an unowned namesake: the owner's is the one meant (200), and the learner is enrolled on it alone", async () => {
        // (listed before the owner's, so that taking the first row found would be the wrong one)
        db.tables.curriculums.unshift({ curriculumid: uuid(305), curriculumname: "ភាសាខ្មែរ ក", organisationid: null, curriculumstatus: true, isdeleted: false });
        await send(NOT_ACTING, "put", "/student/update", { students: [ownRow()] }).expect(200);
        expect(curriculumsOf(STU_X)).toEqual([CUR_X]);
      });
      it("a name the owner has not got but exactly one unowned curriculum has: the unowned one (200)", async () => {
        unowned(306, "មិនទាន់មានម្ចាស់");
        await send(NOT_ACTING, "put", "/student/update", { students: [{ ...ownRow(), curriculums: "មិនទាន់មានម្ចាស់" }] }).expect(200);
        expect(curriculumsOf(STU_X)).toEqual([uuid(306)]);
      });
      it("one name of each kind: both resolve (200), each once", async () => {
        unowned(306, "មិនទាន់មានម្ចាស់");
        await send(NOT_ACTING, "put", "/student/update", { students: [{ ...ownRow(), curriculums: "ភាសាខ្មែរ ក/មិនទាន់មានម្ចាស់" }] }).expect(200);
        expect([...(curriculumsOf(STU_X) as string[])].sort()).toEqual([CUR_X, uuid(306)].sort());
      });
      it("the same name twice in one row is one curriculum (200, one id)", async () => {
        await send(NOT_ACTING, "put", "/student/update", { students: [{ ...ownRow(), curriculums: "ភាសាខ្មែរ ក/ភាសាខ្មែរ ក" }] }).expect(200);
        expect(curriculumsOf(STU_X)).toEqual([CUR_X]);
      });
            it("a name written twice with a different case or spacing is still one curriculum (200, one id)", async () => {
        db.add("curriculums", { curriculumid: uuid(308), curriculumname: "math", organisationid: X, curriculumstatus: true });
        await send(NOT_ACTING, "put", "/student/update", { students: [{ ...ownRow(), curriculums: "Math/ MATH " }] }).expect(200);
        expect(curriculumsOf(STU_X)).toEqual([uuid(308)]);
      });
      it("two unowned curriculums of a name the owner has not got: ambiguous, the same 400", async () => {
        unowned(306, "មិនទាន់មានម្ចាស់");
        unowned(307, "មិនទាន់មានម្ចាស់");
        await refusedAs([{ ...ownRow(), curriculums: "មិនទាន់មានម្ចាស់" }]);
      });
      it("a school with no owner: a name only X holds is not found (the same 400), and a single unowned one is", async () => {
        await refusedAs([rowFor(STU_U, USR_U, "learneru", NAME_U, "ភាសាខ្មែរ ក", "ថ្នាក់ទី៣")]);
        unowned(306, "មិនទាន់មានម្ចាស់");
        await send(NOT_ACTING, "put", "/student/update", { students: [rowFor(STU_U, USR_U, "learneru", NAME_U, "មិនទាន់មានម្ចាស់", "ថ្នាក់ទី៣")] }).expect(200);
        expect(curriculumsOf(STU_U)).toEqual([uuid(306)]);
      });
      it("names are compared as text is everywhere (trim, NFC, lower-case): the owner's 'math' is the one a file's ' Math ' means, not an unowned 'Math'", async () => {
        db.add("curriculums", { curriculumid: uuid(308), curriculumname: "math", organisationid: X, curriculumstatus: true });
        unowned(309, "Math");
        await send(NOT_ACTING, "put", "/student/update", { students: [{ ...ownRow(), curriculums: " Math " }] }).expect(200);
        expect(curriculumsOf(STU_X)).toEqual([uuid(308)]);
      });
      it("two of the owner's curriculums differ only in case: ambiguous, the same 400", async () => {
        db.add("curriculums", { curriculumid: uuid(308), curriculumname: "math", organisationid: X, curriculumstatus: true });
        db.add("curriculums", { curriculumid: uuid(310), curriculumname: "MATH", organisationid: X, curriculumstatus: true });
        await refusedAs([{ ...ownRow(), curriculums: "Math" }]);
      });
      it("one name that resolves and one that does not: the same 400, and nothing is written", async () => {
        await refusedAs([{ ...ownRow(), curriculums: "ភាសាខ្មែរ ក/ភាសាដែលមិនមាន" }]);
        expect(curriculumsOf(STU_X)).toEqual([CUR_X]);
      });
      it("a name that neither the owner nor anyone else holds, and one only Y holds, are the same 400, nothing written", async () => {
        await refusedAs([{ ...ownRow(), curriculums: "ភាសាខ្មែរ ខ" }]);
      });
    });
    it.each(IN_X)("%s: a curriculum name only Y holds is the same refusal as a name nobody holds, nothing written", async (who) => {
      const onlyY = await refuses(who, "put", "/student/update", { students: [{ ...ownRow(), curriculums: "ភាសាខ្មែរ ខ" }] });
      const nobody = await refuses(who, "put", "/student/update", { students: [{ ...ownRow(), curriculums: "ភាសាដែលមិនមាន" }] });
      expect(onlyY.status).toBe(400);
      expect(said(onlyY)).toEqual(said(nobody));
      expect(onlyY.body.fields).toEqual([{ field: "curriculums", message: "One or more of those curriculums doesn't exist." }]);
    });
    it.each(IN_X)("%s: edits X's learner", async (who) => {
      await send(who, "put", "/student/update", { students: [ownRow()] }).expect(200);
      expect(firstName(STU_X)).toBe("ឈ្មោះថ្មី");
      expect(firstName(STU_Y)).toBe(KHMER_FIRST.Y);
    });
    it.each(IN_X)("%s: Y's learner is the 404 a learner that is not there gets, nothing is written (not even the rows before it in the file)", async (who) => {
      const foreign = await refuses(who, "put", "/student/update", { students: [ownRow(), yRow()] });
      const missing = await refuses(who, "put", "/student/update", { students: [ownRow(), { ...yRow(), studentid: MISSING }] });
      expect(foreign.status).toBe(404);
      expect(said(foreign)).toEqual(said(missing));
      expect(firstName(STU_X)).toBe(KHMER_FIRST.X);
    });
    it.each(IN_X)("%s: X's learner cannot be moved to Y's school (404, naming the row), nothing is written", async (who) => {
      const res = await refuses(who, "put", "/student/update", { students: [{ ...ownRow(), schoolname: NAME_Y }] });
      const none = await refuses(who, "put", "/student/update", { students: [{ ...ownRow(), schoolname: KNOWN_NAME_NOT_THERE }] });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
      expect(res.body.fields).toEqual([{ field: "students.0.schoolname", message: "That school doesn't exist." }]);
      expect(db.tables.students.find((s) => s.studentid === STU_X)!.schoolid).toBe(S_X);
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still edits any learner", async (who) => {
      await send(who, "put", "/student/update", { students: [yRow()] }).expect(200);
      expect(firstName(STU_Y)).toBe("ឈ្មោះថ្មី");
    });
  });

  // ───────────────────────────── teachers ─────────────────────────────

  describe("POST /teacher", () => {
    const list = (who: Who, body: object = { pageindex: 1, pagesize: 50, filter: [] }) => send(who, "post", "/teacher", body);
    it.each(IN_X)("%s: lists X's teachers, none of Y's, and no password hash", async (who) => {
      const res = await list(who).expect(200);
      expect(idsOf(res.body.data.data, "schooluserid")).toEqual([TCH_X]);
      expect(JSON.stringify(res.body)).not.toContain("hash");
    });
    it.each(IN_X)("%s: Y's school in a filter is the 404 a school that is not there gets", async (who) => {
      const refused = await refuses(who, "post", "/teacher", { pageindex: 1, pagesize: 50, filter: [{ key: "schoolid", value: S_Y }] });
      const missing = await refuses(who, "post", "/teacher", { pageindex: 1, pagesize: 50, filter: [{ key: "schoolid", value: MISSING }] });
      expect([refused.status, said(refused)]).toEqual([404, said(missing)]);
      const byName = await list(who, { pageindex: 1, pagesize: 50, filter: [{ key: "schoolname", value: NAME_Y }] }).expect(200);
      expect(idsOf(byName.body.data.data, "schooluserid")).toEqual([]);
    });
    it("a platform user not acting: lists every teacher", async () => {
      const res = await list("a platform user not acting").expect(200);
      expect(idsOf(res.body.data.data, "schooluserid")).toEqual(sorted(TCH_X, TCH_Y));
    });
  });

  describe("POST /teacher/create", () => {
    const body = (schoolname: string) => ({ schoolname, teachers: [{ schoolusername: "newteacher", schooluserpasswordhash: "pass1234" }] });
    it.each(IN_X)("%s: creates a teacher login in X's school, with the school's own name", async (who) => {
      await send(who, "post", "/teacher/create", body(NAME_X)).expect(200);
      expect(db.createdIn("schoolusers")).toHaveLength(1);
      expect(db.createdIn("schoolusers")[0]).toMatchObject({ schoolusername: "newteacher", schoolid: S_X, schoolname: NAME_X, schooluserrole: SchoolRole.TEACHER });
    });
    it.each(IN_X)("%s: Y's school and the unowned one, by name, are the 404 a school that is not there gets, and nothing is written", async (who) => {
      const foreign = await refuses(who, "post", "/teacher/create", body(NAME_Y));
      const unowned = await refuses(who, "post", "/teacher/create", body(NAME_U));
      const missing = await refuses(who, "post", "/teacher/create", body(KNOWN_NAME_NOT_THERE));
      expect(foreign.status).toBe(404);
      expect(said(foreign)).toEqual(said(missing));
      expect(said(unowned)).toEqual(said(missing));
      db.nothingCreated();
    });
    it.each(IN_X)("%s: with ?cloud=true the school is checked before anything is pushed", async (who) => {
      const res = await refuses(who, "post", "/teacher/create?cloud=true", body(NAME_Y));
      expect(res.status).toBe(404);
      expect(axios.put).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: a school of the same name in another organisation neither makes the name ambiguous nor is the school written to", async (who) => {
      db.add("schools", { schoolid: uuid(231), schoolname: NAME_X, organisationid: Y, countryid: C2, curriculums: [] });
      await send(who, "post", "/teacher/create", body(NAME_X)).expect(200);
      expect(db.createdIn("schoolusers")[0]).toMatchObject({ schoolid: S_X });
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still creates a teacher login in any school", async (who) => {
      await send(who, "post", "/teacher/create", body(NAME_Y)).expect(200);
      expect(db.createdIn("schoolusers")[0]).toMatchObject({ schoolid: S_Y });
    });
  });

  describe("DELETE /teacher/:schooluserid", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's teacher, with X's own teacher named in the request, is the 404 a missing teacher gets, unchanged", async (who) => {
      const { res, none } = await pathRowChecked(who, "delete", `/teacher/${TCH_Y}`, `/teacher/${MISSING}`, { schooluserid: TCH_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    it.each(IN_X)("%s: removes X's teacher", async (who) => {
      await send(who, "delete", `/teacher/${TCH_X}`).expect(200);
      expect(db.tables.schoolusers.find((s) => s.schooluserid === TCH_X)!.isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's teacher is the 404 a teacher that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "delete", `/teacher/${TCH_Y}`, `/teacher/${MISSING}`);
    });
    it("a platform user not acting: removes any teacher", async () => {
      await send("a platform user not acting", "delete", `/teacher/${TCH_Y}`).expect(200);
      expect(db.tables.schoolusers.find((s) => s.schooluserid === TCH_Y)!.isdeleted).toBe(true);
    });
  });

  // ───────────────────────────── fees collection ─────────────────────────────

  describe("POST /school-contribute/create", () => {
    const body = (school: string, name: string, country: string) => ({ schoolname: name, schoolid: school, countryid: country, expected: 500, actual: 50 });
    it.each(IN_X)("%s: a fees row for X's school", async (who) => {
      await send(who, "post", "/school-contribute/create", body(S_X, NAME_X, C1)).expect(200);
      expect(db.createdIn("schoolcontributedata")).toHaveLength(1);
      expect(db.createdIn("schoolcontributedata")[0]).toMatchObject({ schoolid: S_X, expected: 500 });
    });
    it.each(IN_X)("%s: Y's school and the unowned one are the 404 a school that is not there gets, and nothing is written", async (who) => {
      const foreign = await refuses(who, "post", "/school-contribute/create", body(S_Y, NAME_Y, C2));
      const unowned = await refuses(who, "post", "/school-contribute/create", body(S_U, NAME_U, C3));
      const missing = await refuses(who, "post", "/school-contribute/create", body(MISSING, "x", C1));
      expect(foreign.status).toBe(404);
      expect(said(foreign)).toEqual(said(missing));
      expect(said(unowned)).toEqual(said(missing));
      db.nothingCreated();
    });
    it("a platform user not acting: a fees row for any school", async () => {
      await send("a platform user not acting", "post", "/school-contribute/create", body(S_Y, NAME_Y, C2)).expect(200);
      expect(db.createdIn("schoolcontributedata")[0]).toMatchObject({ schoolid: S_Y });
    });
  });

  describe("POST /school-contribute/getallschoolcontribute/:schoolid", () => {
    const list = (who: Who, school: string) => send(who, "post", `/school-contribute/getallschoolcontribute/${school}`, { pageindex: 1, pagesize: 50, filter: [] });
    it.each(IN_X)("%s: the fees rows of X's school", async (who) => {
      const res = await list(who, S_X).expect(200);
      expect(idsOf(res.body.data.data, "schoolcontributeid")).toEqual([F_X]);
    });
    it.each(IN_X)("%s: Y's school and the unowned one are the 404 a school that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "post", `/school-contribute/getallschoolcontribute/${S_Y}`, `/school-contribute/getallschoolcontribute/${MISSING}`, { pageindex: 1, pagesize: 50, filter: [] });
      await expectNotFoundLikeMissing(who, "post", `/school-contribute/getallschoolcontribute/${S_U}`, `/school-contribute/getallschoolcontribute/${MISSING}`, { pageindex: 1, pagesize: 50, filter: [] });
    });
    it("a platform user not acting: any school's fees rows", async () => {
      const res = await list("a platform user not acting", S_Y).expect(200);
      expect(idsOf(res.body.data.data, "schoolcontributeid")).toEqual([F_Y]);
    });
  });

  describe("PUT /school-contribute/updateschoolname/:schoolid", () => {
    it.each(IN_X)("%s: a request that names another row in its body besides the one in the path is refused (400), unchanged", async (who) => {
      const res = await refuses(who, "put", `/school-contribute/updateschoolname/${S_Y}`, { ...edit(C2), schoolid: S_X });
      expect(res.status).toBe(400);
    });
    const edit = (country: string) => ({ schoolname: "ឈ្មោះដែលអតិថិជនផ្ញើ", countryid: country });
    it.each(IN_X)("%s: refreshes the school columns of X's school's fees rows with the school's own name", async (who) => {
      await send(who, "put", `/school-contribute/updateschoolname/${S_X}`, edit(C1)).expect(200);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_X)).toMatchObject({ schoolname: NAME_X, countryid: C1 });
    });
    it.each(IN_X)("%s: Y's school and the unowned one are the 404 a school that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "put", `/school-contribute/updateschoolname/${S_Y}`, `/school-contribute/updateschoolname/${MISSING}`, edit(C2));
      await expectNotFoundLikeMissing(who, "put", `/school-contribute/updateschoolname/${S_U}`, `/school-contribute/updateschoolname/${MISSING}`, edit(C3));
    });
    it("a platform user not acting: any school's fees rows", async () => {
      await send("a platform user not acting", "put", `/school-contribute/updateschoolname/${S_Y}`, edit(C2)).expect(200);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_Y)!.schoolname).toBe(NAME_Y);
    });
  });

  describe("PUT /school-contribute/updateschooldashboard/:schoolcontributeid", () => {
    it.each(IN_X)("%s: a request that names another row in its body besides the one in the path is refused (400), unchanged", async (who) => {
      const res = await refuses(who, "put", `/school-contribute/updateschooldashboard/${F_Y}`, { ...edit, schoolcontributeid: F_X });
      expect(res.status).toBe(400);
    });
    const edit = { expected: 900, actual: 90 };
    it.each(IN_X)("%s: edits X's fees row", async (who) => {
      await send(who, "put", `/school-contribute/updateschooldashboard/${F_X}`, edit).expect(200);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_X)).toMatchObject({ expected: 900, actual: 90 });
    });
    it.each(IN_X)("%s: Y's fees row and the unowned school's are the 404 a row that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "put", `/school-contribute/updateschooldashboard/${F_Y}`, `/school-contribute/updateschooldashboard/${MISSING}`, edit);
      await expectNotFoundLikeMissing(who, "put", `/school-contribute/updateschooldashboard/${F_U}`, `/school-contribute/updateschooldashboard/${MISSING}`, edit);
    });
    it("a platform user not acting: edits any fees row", async () => {
      await send("a platform user not acting", "put", `/school-contribute/updateschooldashboard/${F_Y}`, edit).expect(200);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_Y)).toMatchObject({ expected: 900 });
    });
  });

  describe("DELETE /school-contribute/deleteschoolcontribute/:schoolid", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's school, with X's own school named in the request, is the 404 a missing school gets, unchanged", async (who) => {
      const { res, none } = await pathRowChecked(who, "delete", `/school-contribute/deleteschoolcontribute/${S_Y}`, `/school-contribute/deleteschoolcontribute/${MISSING}`, { schoolid: S_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    it.each(IN_X)("%s: removes the fees rows of X's school", async (who) => {
      await send(who, "delete", `/school-contribute/deleteschoolcontribute/${S_X}`).expect(200);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_X)!.isdeleted).toBe(true);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_Y)!.isdeleted).toBe(false);
    });
    it.each(IN_X)("%s: Y's school and the unowned one are the 404 a school that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "delete", `/school-contribute/deleteschoolcontribute/${S_Y}`, `/school-contribute/deleteschoolcontribute/${MISSING}`);
      await expectNotFoundLikeMissing(who, "delete", `/school-contribute/deleteschoolcontribute/${S_U}`, `/school-contribute/deleteschoolcontribute/${MISSING}`);
    });
    it("a platform user not acting: removes any school's fees rows", async () => {
      await send("a platform user not acting", "delete", `/school-contribute/deleteschoolcontribute/${S_Y}`).expect(200);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_Y)!.isdeleted).toBe(true);
    });
  });

  describe("DELETE /school-contribute/deleteschoolcontributeid/:schoolcontributeid", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's fees row, with X's own row named in the request, is the 404 a missing row gets, unchanged", async (who) => {
      const { res, none } = await pathRowChecked(who, "delete", `/school-contribute/deleteschoolcontributeid/${F_Y}`, `/school-contribute/deleteschoolcontributeid/${MISSING}`, { schoolcontributeid: F_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    it.each(IN_X)("%s: removes X's fees row", async (who) => {
      await send(who, "delete", `/school-contribute/deleteschoolcontributeid/${F_X}`).expect(200);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_X)!.isdeleted).toBe(true);
    });
    it.each(IN_X)("%s: Y's fees row and the unowned school's are the 404 a row that is not there gets, unchanged", async (who) => {
      await expectNotFoundLikeMissing(who, "delete", `/school-contribute/deleteschoolcontributeid/${F_Y}`, `/school-contribute/deleteschoolcontributeid/${MISSING}`);
      await expectNotFoundLikeMissing(who, "delete", `/school-contribute/deleteschoolcontributeid/${F_U}`, `/school-contribute/deleteschoolcontributeid/${MISSING}`);
    });
    it("a platform user not acting: removes any fees row", async () => {
      await send("a platform user not acting", "delete", `/school-contribute/deleteschoolcontributeid/${F_Y}`).expect(200);
      expect(db.tables.schoolcontributedata.find((f) => f.schoolcontributeid === F_Y)!.isdeleted).toBe(true);
    });
  });

  describe("GET /school-contribute/getschooldashboard/schoolcontributeid/:schoolcontributeid", () => {
    it.each(IN_X)("%s: X's fees row", async (who) => {
      const res = await send(who, "get", `/school-contribute/getschooldashboard/schoolcontributeid/${F_X}`).expect(200);
      expect(res.body.data).toMatchObject({ schoolcontributeid: F_X, expected: 111 });
    });
    it.each(IN_X)("%s: Y's fees row and the unowned school's are the 404 a row that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/getschooldashboard/schoolcontributeid/${F_Y}`, `/school-contribute/getschooldashboard/schoolcontributeid/${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/getschooldashboard/schoolcontributeid/${F_U}`, `/school-contribute/getschooldashboard/schoolcontributeid/${MISSING}`);
    });
    it("a platform user not acting: any fees row", async () => {
      const res = await send("a platform user not acting", "get", `/school-contribute/getschooldashboard/schoolcontributeid/${F_Y}`).expect(200);
      expect(res.body.data.schoolcontributeid).toBe(F_Y);
    });
  });

  describe("GET /school-contribute/getschooldashboardid/:schoolid", () => {
    const valuesOf = (res: request.Response) => (res.body.data as Array<{ series: Array<{ value: number }> }>).map((p) => p.series.map((s) => s.value));
    it.each(IN_X)("%s: the dashboard of X's school: X's figures only", async (who) => {
      const res = await send(who, "get", `/school-contribute/getschooldashboardid/${S_X}`).expect(200);
      expect(valuesOf(res)).toEqual([[111, 11.1]]);
    });
    it.each(IN_X)("%s: Y's school and the unowned one are the 404 a school that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/getschooldashboardid/${S_Y}`, `/school-contribute/getschooldashboardid/${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/getschooldashboardid/${S_U}`, `/school-contribute/getschooldashboardid/${MISSING}`);
    });
    it("a platform user not acting: any school's dashboard", async () => {
      const res = await send("a platform user not acting", "get", `/school-contribute/getschooldashboardid/${S_Y}`).expect(200);
      expect(valuesOf(res)).toEqual([[222, 22.2]]);
    });
  });

  describe("GET /school-contribute/getallschooldashboard", () => {
    const namesOf = (res: request.Response) => (res.body.data as Array<{ name: string }>).map((p) => p.name).sort();
    it.each(IN_X)("%s: the schools' dashboards: X's school only", async (who) => {
      const res = await send(who, "get", "/school-contribute/getallschooldashboard").expect(200);
      expect(namesOf(res)).toEqual([NAME_X]);
    });
    it("a platform user not acting: every school's dashboard", async () => {
      const res = await send("a platform user not acting", "get", "/school-contribute/getallschooldashboard").expect(200);
      expect(namesOf(res)).toEqual([NAME_X, NAME_Y, NAME_U].sort());
    });
  });

  describe("GET /school-contribute/getschoolcontribute/:schoolid", () => {
    it.each(IN_X)("%s: the fees rows of X's school", async (who) => {
      const res = await send(who, "get", `/school-contribute/getschoolcontribute/${S_X}`).expect(200);
      expect(idsOf(res.body.data, "schoolcontributeid")).toEqual([F_X]);
    });
    it.each(IN_X)("%s: Y's school and the unowned one are the 404 a school that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/getschoolcontribute/${S_Y}`, `/school-contribute/getschoolcontribute/${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/getschoolcontribute/${S_U}`, `/school-contribute/getschoolcontribute/${MISSING}`);
    });
    it("a platform user not acting: any school's fees rows", async () => {
      const res = await send("a platform user not acting", "get", `/school-contribute/getschoolcontribute/${S_U}`).expect(200);
      expect(idsOf(res.body.data, "schoolcontributeid")).toEqual([F_U]);
    });
  });

  describe("GET /school-contribute/getallschoolcontribute", () => {
    it.each(IN_X)("%s: the latest fees row of each of X's schools: X's only", async (who) => {
      const res = await send(who, "get", "/school-contribute/getallschoolcontribute").expect(200);
      expect(idsOf(res.body, "schoolcontributeid")).toEqual([F_X]);
    });
    it("a platform user not acting: every school's", async () => {
      const res = await send("a platform user not acting", "get", "/school-contribute/getallschoolcontribute").expect(200);
      expect(idsOf(res.body, "schoolcontributeid")).toEqual(sorted(F_X, F_Y, F_U));
    });
  });

  describe("GET /school-contribute/all", () => {
    const namesOf = (res: request.Response) => (res.body.data as Array<{ name: string }>).map((p) => p.name);
    it.each(IN_X)("%s: the fees chart: X's school only", async (who) => {
      const res = await send(who, "get", "/school-contribute/all").expect(200);
      expect(namesOf(res)).toHaveLength(1);
      expect(namesOf(res)[0]).toContain(NAME_X);
    });
    it.each(IN_X)("%s: Y's school and the unowned one, by id or by name, are the 404 a school that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/all?schoolid=${S_Y}`, `/school-contribute/all?schoolid=${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/all?schoolid=${S_U}`, `/school-contribute/all?schoolid=${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/school-contribute/all?schoolname=${enc(NAME_Y)}`, `/school-contribute/all?schoolname=${enc(KNOWN_NAME_NOT_THERE)}`);
    });
    it("a platform user not acting: every school's", async () => {
      const res = await send("a platform user not acting", "get", "/school-contribute/all").expect(200);
      expect(namesOf(res)).toHaveLength(3);
    });
  });

  describe("POST /school-contribute/report/download", () => {
    const csv = (who: Who) => send(who, "post", "/school-contribute/report/download", {}).buffer(true).parse(textOf as never);
    it.each(IN_X)("%s: the report holds X's school only", async (who) => {
      const res = await csv(who).expect(200);
      const text = (res.body as Buffer).toString("utf8");
      expect(text).toContain(NAME_X);
      expect(text).not.toContain(NAME_Y);
      expect(text).not.toContain(NAME_U);
    });
    it("a platform user not acting: every school's", async () => {
      const res = await csv("a platform user not acting").expect(200);
      const text = (res.body as Buffer).toString("utf8");
      for (const name of [NAME_X, NAME_Y, NAME_U]) expect(text).toContain(name);
    });
  });

  // ───────────────────────────── exports and imports ─────────────────────────────

  describe("GET /export/:schoolname/students", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's school, with X's own school named in the request, is the 404 a missing school gets", async (who) => {
      const { res, none } = await pathRowChecked(who, "get", `/export/${enc(NAME_Y)}/students`, `/export/${enc(KNOWN_NAME_NOT_THERE)}/students`, { schoolname: NAME_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    const get = (who: Who, segment: string) => send(who, "get", `/export/${enc(segment)}/students`).buffer(true).parse(textOf as never);
    it.each(IN_X)("%s: X's school by name or by id: X's learners only", async (who) => {
      for (const segment of [NAME_X, S_X]) {
        const res = await get(who, segment).expect(200);
        expect(zipEntry(res, "students.ini").studentusers.map((u: Row) => u.schooluserid)).toEqual([USR_X]);
      }
    });
    it.each(IN_X)("%s: Y's school and the unowned one, by name or by id, are the 404 a school that is not there gets", async (who) => {
      const missingByName = await get(who, KNOWN_NAME_NOT_THERE);
      const missingById = await get(who, MISSING);
      expect(missingByName.status).toBe(404);
      for (const [segment, like] of [[NAME_Y, missingByName], [NAME_U, missingByName], [S_Y, missingById], [S_U, missingById]] as const) {
        const res = await get(who, segment);
        expect(res.status).toBe(404);
        expect(refusalOf(res)).toEqual(refusalOf(like));
      }
    });
    it.each(IN_X)("%s: a school of the same name in another organisation does not make the name ambiguous", async (who) => {
      db.add("schools", { schoolid: uuid(232), schoolname: NAME_X, organisationid: Y, countryid: C2, curriculums: [] });
      const res = await get(who, NAME_X).expect(200);
      expect(zipEntry(res, "students.ini").studentusers.map((u: Row) => u.schooluserid)).toEqual([USR_X]);
    });
    it.each(WHOLE_PLATFORM)("%s: any school's learners", async (who) => {
      for (const [segment, user] of [[S_Y, USR_Y], [NAME_U, USR_U]] as const) {
        const res = await get(who, segment).expect(200);
        expect(zipEntry(res, "students.ini").studentusers.map((u: Row) => u.schooluserid)).toEqual([user]);
      }
    });
  });

  describe("GET /export/:schoolname/teachers", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's school, with X's own school named in the request, is the 404 a missing school gets", async (who) => {
      const { res, none } = await pathRowChecked(who, "get", `/export/${enc(NAME_Y)}/teachers`, `/export/${enc(KNOWN_NAME_NOT_THERE)}/teachers`, { schoolname: NAME_X });
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
    });
    const get = (who: Who, segment: string) => send(who, "get", `/export/${enc(segment)}/teachers`).buffer(true).parse(textOf as never);
    it.each(IN_X)("%s: X's school by name or by id: X's teachers only", async (who) => {
      for (const segment of [NAME_X, S_X]) {
        const res = await get(who, segment).expect(200);
        expect(zipEntry(res, "teachers.ini").map((u: Row) => u.schooluserid)).toEqual([TCH_X]);
      }
    });
    it.each(IN_X)("%s: Y's school and the unowned one, by name or by id, are the 404 a school that is not there gets", async (who) => {
      const missing = await get(who, KNOWN_NAME_NOT_THERE);
      expect(missing.status).toBe(404);
      for (const segment of [NAME_Y, NAME_U, S_Y, S_U]) {
        const res = await get(who, segment);
        expect(res.status).toBe(404);
        expect(refusalOf(res)).toEqual(refusalOf(missing));
      }
    });
    it.each(WHOLE_PLATFORM)("%s: any school's teachers", async (who) => {
      const res = await get(who, NAME_Y).expect(200);
      expect(zipEntry(res, "teachers.ini").map((u: Row) => u.schooluserid)).toEqual([TCH_Y]);
    });
  });

  describe("PUT /import/:schoolname/teachers", () => {
    it.each(IN_X)("%s: the row in the path is the one checked: Y's school, with X's own school named in a field of the upload, is the 404 a missing school gets, unchanged", async (who) => {
      const withField = (segment: string) => upload(who, segment).field("schoolname", NAME_X);
      const before = db.snapshot();
      const res = await withField(NAME_Y);
      const none = await withField(KNOWN_NAME_NOT_THERE);
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(none));
      expect(db.snapshot()).toEqual(before);
    });
    it.each(IN_X)("%s: a school of the same name in another organisation neither makes the name ambiguous nor is the school written to", async (who) => {
      db.add("schools", { schoolid: uuid(234), schoolname: NAME_X, organisationid: Y, countryid: C2, curriculums: [] });
      await upload(who, NAME_X).expect(200);
      expect(db.createdIn("schoolusers")).toHaveLength(1);
      expect(db.createdIn("schoolusers")[0]).toMatchObject({ schoolid: S_X });
    });
    const upload = (who: Who, segment: string) =>
      request(app.getHttpServer())
        .put(`/import/${enc(segment)}/teachers`)
        .set("Authorization", callers[who])
        .set("Connection", "close")
        .attach("importfile", Buffer.from("teacherusername,teacheruserpassword\nimported1,pw1\n", "utf8"), "teachers.csv");
    it.each(IN_X)("%s: imports teachers into X's school, by name or by id", async (who) => {
      await upload(who, NAME_X).expect(200);
      expect(db.createdIn("schoolusers")).toHaveLength(1);
      expect(db.createdIn("schoolusers")[0]).toMatchObject({ schoolusername: "imported1", schoolid: S_X, schoolname: NAME_X });
      db.tables.schoolusers = db.tables.schoolusers.filter((u) => u.schoolusername !== "imported1");
      await upload(who, S_X).expect(200);
      expect(db.createdIn("schoolusers")[1]).toMatchObject({ schoolid: S_X });
    });
    it.each(IN_X)("%s: Y's school and the unowned one, by name or by id, are the 404 a school that is not there gets, and nothing is written", async (who) => {
      const before = db.snapshot();
      const missing = await upload(who, KNOWN_NAME_NOT_THERE);
      expect(missing.status).toBe(404);
      for (const segment of [NAME_Y, NAME_U, S_Y, S_U]) {
        const res = await upload(who, segment);
        expect(res.status).toBe(404);
        expect(said(res)).toEqual(said(missing));
      }
      expect(db.snapshot()).toEqual(before);
      db.nothingCreated();
    });
    it("a platform user not acting: imports into any school", async () => {
      await upload("a platform user not acting", NAME_Y).expect(200);
      expect(db.createdIn("schoolusers")[0]).toMatchObject({ schoolid: S_Y });
    });
  });

  // ───────────────────────────── countries ─────────────────────────────

  describe("GET /country", () => {
    it.each(IN_X)("%s: the countries X is linked to, not Y's or the unlinked", async (who) => {
      const res = await send(who, "get", "/country").expect(200);
      expect(idsOf(res.body.data, "countryid")).toEqual([C1]);
    });
    it.each([...WHOLE_PLATFORM, "a server token" as Who])("%s: still lists every country", async (who) => {
      const res = await send(who, "get", "/country").expect(200);
      expect(idsOf(res.body.data, "countryid")).toEqual(sorted(C1, C2, C3));
    });
  });

  describe("POST /country", () => {
    const list = (who: Who) => send(who, "post", "/country", { pageindex: 1, pagesize: 50, filter: [] });
    it.each(IN_X)("%s: the countries X is linked to, not Y's or the unlinked", async (who) => {
      const res = await list(who).expect(200);
      expect(idsOf(res.body.data.data, "countryid")).toEqual([C1]);
    });
    it("a platform user not acting: every country", async () => {
      const res = await list("a platform user not acting").expect(200);
      expect(idsOf(res.body.data.data, "countryid")).toEqual(sorted(C1, C2, C3));
    });
  });

  describe("GET /country/:countryid", () => {
    it.each(IN_X)("%s: X's country", async (who) => {
      const res = await send(who, "get", `/country/${C1}`).expect(200);
      expect(res.body.data.countryid).toBe(C1);
    });
    it.each(IN_X)("%s: a country X is not linked to is the 404 a country that is not there gets", async (who) => {
      await expectNotFoundLikeMissing(who, "get", `/country/${C2}`, `/country/${MISSING}`);
      await expectNotFoundLikeMissing(who, "get", `/country/${C3}`, `/country/${MISSING}`);
    });
    it("a platform user not acting: any country", async () => {
      const res = await send("a platform user not acting", "get", `/country/${C3}`).expect(200);
      expect(res.body.data.countryid).toBe(C3);
    });
  });

  describe("GET /country/all", () => {
    it.each(IN_X)("%s: the countries X is linked to, not Y's or the unlinked", async (who) => {
      const res = await send(who, "get", "/country/all").expect(200);
      expect(idsOf(res.body.data, "countryid")).toEqual([C1]);
    });
    it("a platform user not acting: every country", async () => {
      const res = await send("a platform user not acting", "get", "/country/all").expect(200);
      expect(idsOf(res.body.data, "countryid")).toEqual(sorted(C1, C2, C3));
    });
    it("a school-user token (a teacher login) still reads every country: it has no organisation context here", async () => {
      const res = await request(app.getHttpServer()).get("/country/all").set("Authorization", teacherLogin).set("Connection", "close").expect(200);
      expect(idsOf(res.body.data, "countryid")).toEqual(sorted(C1, C2, C3));
    });
  });

  // ───────────────────────────── the server token ─────────────────────────────

  describe("the application's server token", () => {
    it.each([
      ["get", "/school"],
      ["get", `/school/country/${C2}`],
      ["get", `/school/country/${C2}/curriculum/${CUR_Y}`],
      ["get", "/standard/all"],
      ["get", "/student/download-students"],
      ["get", "/country"],
    ] as const)("a server token still reads every school: %s %s answers 200 with Y's rows in it", async (method, path) => {
      const res = await send("a server token", method, path).buffer(true).parse(textOf as never);
      expect(res.status).toBe(200);
      const text = (res.body as Buffer).toString("utf8");
      expect(text).toMatch(new RegExp(`${S_Y}|${K_Y}|${C2}|${KHMER_FIRST.Y}`));
    });
    it.each([
      ["post", "/student/create"],
      ["put", "/student/update"],
      ["post", "/teacher/create"],
    ] as const)("a server token is admitted by %s %s (it reaches the handler: a body that is not valid is a 400, not a 401)", async (method, path) => {
      const res = await send("a server token", method, path, {});
      expect(res.status).toBe(400);
    });
    it.each([
      ["post", "/school/create"],
      ["put", `/school/update/${S_X}`],
      ["get", `/school/${S_X}`],
      ["post", "/school"],
      ["delete", `/school/${S_X}`],
      ["get", "/school/all"],
      ["post", "/standard"],
      ["post", "/standard/create"],
      ["get", `/standard/${K_X}`],
      ["post", "/student"],
      ["get", "/student/all"],
      ["get", `/student/${STU_X}`],
      ["post", "/teacher"],
      ["get", "/school-contribute/all"],
      ["post", "/country"],
      ["get", `/export/${S_X}/students`],
      ["put", `/import/${S_X}/teachers`],
    ] as const)("a server token is still refused (401) where the route does not admit it: %s %s", async (method, path) => {
      const before = db.snapshot();
      const res = await send("a server token", method, path, method === "get" || method === "delete" ? undefined : {});
      expect(res.status).toBe(401);
      expect(db.snapshot()).toEqual(before);
    });
  });
});
