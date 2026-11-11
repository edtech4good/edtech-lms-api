import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import axios from "axios";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { students } from "src/models/data-models/students";
import { Role } from "src/models/enums";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { StudentController } from "./student.controller";

/**
 * Reading and editing one learner's details (GET and PUT /student/:schooluserid/details), driven over real HTTP
 * through the real strategy, guards, controller and business classes. Replaced are the models (an in-memory copy of the
 * tables), the token lookup, the transaction and the student server (axios).
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));
// what the push puts in its zip: the entry's name and its JSON
const mockZipEntries: Array<{ name: string; json: Record<string, unknown> }> = [];
jest.mock("adm-zip", () => ({
  __esModule: true,
  default: jest.fn(() => {
    const real = jest.requireActual("adm-zip");
    const zip = new real();
    const addFile = zip.addFile.bind(zip);
    zip.addFile = (name: string, data: Buffer) => {
      mockZipEntries.push({ name, json: JSON.parse(data.toString("utf8")) });
      return addFile(name, data);
    };
    return zip;
  }),
}));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn() } }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = uuid(101);
const S_X = uuid(201);
const S_Y = uuid(202);
const S_X2 = uuid(204); // a second school of X
const CUR_X = uuid(301);
const CUR_X2 = uuid(303);
const CUR_X3 = uuid(305);
const CUR_Y = uuid(302);
const CUR_TWO = uuid(306); // two grades
const CUR_NONE = uuid(307); // no grade
const CUR_DEL = uuid(308); // its only grade is deleted
const G_X = uuid(601); // the one grade of CUR_X
const G_X2 = uuid(602); // the one grade of CUR_X2
const G_X3 = uuid(603); // the one grade of CUR_X3
const G_Y = uuid(604); // the one grade of CUR_Y
const G_TWO_A = uuid(605);
const G_TWO_B = uuid(606);
const G_DEL = uuid(607);
const K_X = uuid(501);
const K_X_B = uuid(503); // a second class of the same school
const K_Y = uuid(502);
const K_X2 = uuid(504); // a class of X's second school
const L_X = uuid(411); // the learner edited
const L_OTHER = uuid(414); // a second learner of the same school
const L_DISABLED = uuid(415);
const L_Y = uuid(412);
const L_GONE = uuid(416);
const T_X = uuid(421);
const T_STU = uuid(431); // a teacher login that also has a live learner row
const MISSING = uuid(999);
const FIRST = "សុខា";
const LAST = "ចាន់";
const NEW_FIRST = "ដារ៉ា";
const NEW_LAST = "វណ្ណៈ";

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
  "an Admin without the update permission": bearer({ lmsuserid: "np", lmsuserroles: [Role.admin], permissions: PERMS.filter((p) => p !== "update_student"), organisationid: X, isplatform: false }),
  "an Admin without the view permission": bearer({ lmsuserid: "nv", lmsuserroles: [Role.admin], permissions: PERMS.filter((p) => p !== "view_student"), organisationid: X, isplatform: false }),
  "a server token": `Bearer ${Config.fortyk.api.applicationapikey}`,
} as const;
type Who = keyof typeof callers;
const IN_X: Who[] = ["X's Organisation Admin", "X's Admin", "a platform user acting as X"];

type Row = Record<string, unknown>;
const withoutReference = (body: Row) => {
  const { reference, logid, stack, ...rest } = body;
  return rest;
};
const said = (res: request.Response) => ({ status: res.status, body: withoutReference(res.body) });

const goodBody = (over: Row = {}): Row => ({
  studentfirstname: NEW_FIRST,
  studentlastname: NEW_LAST,
  genderid: 2,
  dateofbirth: "2014-06-01",
  standard: K_X_B,
  curriculumids: [CUR_X2],
  ...over,
});
const without = (body: Row, key: string): Row => {
  const { [key]: _gone, ...rest } = body;
  return rest;
};

const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("countries", { countryid: C1, countryname: "កម្ពុជា", expectedusage: 1 });
  db.add("curriculums", { curriculumid: CUR_X, curriculumname: "ភាសាខ្មែរ ក", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_X2, curriculumname: "ភាសាខ្មែរ គ", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_X3, curriculumname: "ភាសាខ្មែរ ឃ", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_Y, curriculumname: "ភាសាខ្មែរ ខ", organisationid: Y, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_TWO, curriculumname: "ភាសាខ្មែរ ង", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_NONE, curriculumname: "ភាសាខ្មែរ ច", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_DEL, curriculumname: "ភាសាខ្មែរ ឆ", organisationid: X, curriculumstatus: true });
  const grade = (gradeid: string, curriculumid: string, gradename: string, gradeorder: number, over: Row = {}) =>
    db.add("grades", { gradeid, curriculumid, gradename, gradeorder, gradestatus: true, isdeleted: false, ...over });
  grade(G_X, CUR_X, "ថ្នាក់ទី១", 1);
  grade(G_X2, CUR_X2, "ថ្នាក់ទី១", 1);
  grade(G_X3, CUR_X3, "ថ្នាក់ទី១", 1);
  grade(G_Y, CUR_Y, "ថ្នាក់ទី១", 1);
  grade(G_TWO_A, CUR_TWO, "ថ្នាក់ទី១", 1);
  grade(G_TWO_B, CUR_TWO, "ថ្នាក់ទី២", 2);
  grade(G_DEL, CUR_DEL, "ថ្នាក់ទី១", 1, { isdeleted: true });
  db.add("schools", { schoolid: S_X, schoolname: "សាលា ក", organisationid: X, countryid: C1, curriculums: [CUR_X] });
  db.add("schools", { schoolid: S_X2, schoolname: "សាលា គ", organisationid: X, countryid: C1, curriculums: [CUR_X] });
  db.add("schools", { schoolid: S_Y, schoolname: "សាលា ខ", organisationid: Y, countryid: C1, curriculums: [CUR_Y] });
  db.add("standards", { standardid: K_X, standardname: "ថ្នាក់ទី១", schoolid: S_X, schoolname: "សាលា ក" });
  db.add("standards", { standardid: K_X_B, standardname: "ថ្នាក់ទី៤", schoolid: S_X, schoolname: "សាលា ក" });
  db.add("standards", { standardid: K_Y, standardname: "ថ្នាក់ទី២", schoolid: S_Y, schoolname: "សាលា ខ" });
  db.add("standards", { standardid: K_X2, standardname: "ថ្នាក់ទី៣", schoolid: S_X2, schoolname: "សាលា គ" });
  const login = (id: string, name: string, school: string, over: Row = {}) =>
    db.add("schoolusers", { schooluserid: id, schoolusername: name, schooluserrole: SchoolRole.STUDENT, schoolid: school, schoolname: "x", schooluserstatus: true, isdisabled: false, isdeleted: false, schooluserpasswordhash: "hash", ...over });
  const learner = (n: number, id: string, school: string, over: Row = {}) =>
    db.add("students", { studentid: uuid(n), schooluserid: id, schoolid: school, schoolname: "x", studentfirstname: FIRST, studentlastname: LAST, dateofbirth: new Date(2015, 2, 9), standard: K_X, curriculumid: CUR_X, curriculumids: [CUR_X], gradeid: G_X, genderid: 1, isactive: 1, is_teacher_acc: false, type: "online", isdeleted: false, ...over });
  login(L_X, "learnerx", S_X);
  login(L_OTHER, "learnerx2", S_X);
  login(L_DISABLED, "learnerx3", S_X, { isdisabled: true });
  login(L_Y, "learnery", S_Y);
  login(L_GONE, "learnergone", S_X, { isdeleted: true });
  learner(401, L_X, S_X);
  learner(402, L_OTHER, S_X);
  learner(403, L_DISABLED, S_X);
  learner(404, L_Y, S_Y, { standard: K_Y, curriculumid: CUR_Y, curriculumids: [CUR_Y], gradeid: G_Y });
  learner(405, L_GONE, S_X, { isdeleted: true });
  login(T_X, "teacherx", S_X, { schooluserrole: SchoolRole.TEACHER });
  login(T_STU, "teacherstu", S_X, { schooluserrole: SchoolRole.TEACHER });
  learner(406, T_STU, S_X);
};

describe("reading and editing one learner's details", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ imports: [ThrottlerModule.forRoot({ ttl: 60, limit: 1000 })], controllers: [StudentController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0);
  });
  afterAll(async () => app.close());

  const rpi = Config.fortyk.api.rpi as { cloud?: string };
  const savedCloud = rpi.cloud;
  afterAll(() => {
    rpi.cloud = savedCloud;
  });

  let logged: jest.SpyInstance[] = [];
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(Logger, "error").mockImplementation(() => Logger);
    jest.spyOn(Logger, "info").mockImplementation(() => Logger);
    jest.spyOn(Logger, "debug").mockImplementation(() => Logger);
    logged = [
      jest.spyOn(console, "warn").mockImplementation(() => undefined),
      jest.spyOn(console, "log").mockImplementation(() => undefined),
      jest.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    tokenExists.mockResolvedValue(true);
    transaction.commit.mockReset();
    transaction.rollback.mockReset();
    mockZipEntries.length = 0;
    db.install();
    seed();
    rpi.cloud = "http://learner-server.invalid";
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    (axios.put as jest.Mock).mockReset().mockResolvedValue({ status: 200, data: {} });
    jest.spyOn(dbinstance.getdbinstance(), "query").mockImplementation((async () => []) as never); // the list's last-login lookup
    // the learners list asks the student server for last sign-ins; with no answer it lists without them
    (axios.post as jest.Mock).mockReset().mockRejectedValue(new Error("no cloud in a test"));
  });

  const get = (who: Who, id: string) => request(app.getHttpServer()).get(`/student/${id}/details`).set("Authorization", callers[who]).set("Connection", "close");
  const put = (who: Who, id: string, body?: unknown) => {
    const r = request(app.getHttpServer()).put(`/student/${id}/details`).set("Authorization", callers[who]).set("Connection", "close");
    return body === undefined ? r : r.send(body as object);
  };
  const learnerRow = (id: string) => db.tables.students.find((r) => r.schooluserid === id)! as Row;
  const refuses = async (who: Who, id: string, body?: unknown) => {
    const before = db.snapshot();
    const res = await put(who, id, body === undefined ? goodBody() : body);
    expect(db.snapshot()).toEqual(before);
    expect(axios.put).not.toHaveBeenCalled();
    return res;
  };
  const everythingLogged = () =>
    JSON.stringify([...(Logger.error as jest.Mock).mock.calls, ...(Logger.warn as jest.Mock).mock.calls, ...(Logger.info as jest.Mock).mock.calls, ...(Logger.debug as jest.Mock).mock.calls, ...logged.map((l) => l.mock.calls)]);

  describe("GET /student/:schooluserid/details", () => {
    it.each(IN_X)("%s: answers exactly the contract's keys, and nothing private", async (who) => {
      const res = await get(who, L_X).expect(200);
      expect(res.body).toEqual({
        schooluserid: L_X,
        schoolusername: "learnerx",
        schoolid: S_X,
        schoolname: "សាលា ក",
        studentfirstname: FIRST,
        studentlastname: LAST,
        genderid: 1,
        dateofbirth: "2015-03-09",
        standard: K_X,
        curriculumids: [CUR_X],
        isdisabled: false,
      });
      expect(JSON.stringify(res.body)).not.toContain("hash");
    });
    it("a learner with no last name or date of birth answers nulls, and a disabled one says so", async () => {
      learnerRow(L_X).studentlastname = null;
      learnerRow(L_X).dateofbirth = null;
      const res = await get("X's Admin", L_X).expect(200);
      expect(res.body).toMatchObject({ studentlastname: null, dateofbirth: null });
      expect((await get("X's Admin", L_DISABLED).expect(200)).body.isdisabled).toBe(true);
    });
    it("several curricula come back in their stored order", async () => {
      learnerRow(L_X).curriculumids = [CUR_X3, CUR_X];
      expect((await get("X's Admin", L_X).expect(200)).body.curriculumids).toEqual([CUR_X3, CUR_X]);
    });
    it.each(IN_X)("%s: another organisation's learner, a teacher, a teacher with a learner row and a removed learner are the 404 a missing one gets", async (who) => {
      const missing = said(await get(who, MISSING));
      expect(missing.status).toBe(404);
      for (const id of [L_Y, T_X, T_STU, L_GONE]) expect(said(await get(who, id))).toEqual(missing);
    });
    it("a platform user not acting is asked to choose an organisation", async () => {
      const res = await get("a platform user not acting", L_X);
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe("Choose an organisation.");
    });
    it("a server token is refused (401) and an Admin without the view permission is refused (403)", async () => {
      expect((await get("a server token", L_X)).status).toBe(401);
      expect((await get("an Admin without the view permission", L_X)).status).toBe(403);
    });
  });

  describe("PUT /student/:schooluserid/details", () => {
    it.each(IN_X)("%s: saves the six fields, whole answer, and touches no other learner", async (who) => {
      const before = db.snapshot();
      const res = await put(who, L_X, goodBody()).expect(200);
      expect(res.body).toEqual({
        schooluserid: L_X,
        studentname: `${NEW_FIRST} ${NEW_LAST}`,
        push: { status: "pushed", message: "Saved. The learner's details are updated." },
      });
      expect(learnerRow(L_X)).toMatchObject({
        studentfirstname: NEW_FIRST,
        studentlastname: NEW_LAST,
        genderid: 2,
        standard: K_X_B,
        curriculumids: [CUR_X2],
        curriculumid: CUR_X2,
        schoolid: S_X,
        isdeleted: false,
      });
      expect(learnerRow(L_X).dateofbirth).toEqual(new Date(2014, 5, 1));
      expect(learnerRow(L_X).updated_by).toBe(who === "X's Organisation Admin" ? "oa" : who === "X's Admin" ? "ad" : "p");
      expect(learnerRow(L_X).updated_at).toBeInstanceOf(Date);
      expect(db.snapshot().students.filter((r) => r.schooluserid !== L_X)).toEqual(before.students.filter((r) => r.schooluserid !== L_X));
      expect(db.snapshot().schoolusers).toEqual(before.schoolusers);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
      expect(transaction.rollback).not.toHaveBeenCalled();
    });
    it("a read after the edit shows what was saved", async () => {
      await put("X's Admin", L_X, goodBody()).expect(200);
      expect((await get("X's Admin", L_X).expect(200)).body).toMatchObject({ studentfirstname: NEW_FIRST, studentlastname: NEW_LAST, genderid: 2, dateofbirth: "2014-06-01", standard: K_X_B, curriculumids: [CUR_X2] });
    });
    it("an empty last name and a null date of birth clear them; the first name is trimmed", async () => {
      await put("X's Admin", L_X, goodBody({ studentfirstname: `  ${NEW_FIRST}  `, studentlastname: "", dateofbirth: null })).expect(200);
      expect(learnerRow(L_X)).toMatchObject({ studentfirstname: NEW_FIRST, studentlastname: null, dateofbirth: null });
      const res = await put("X's Admin", L_X, goodBody({ studentlastname: null, dateofbirth: "" })).expect(200);
      expect(res.body.studentname).toBe(NEW_FIRST);
    });
    it("a disabled learner can be edited and stays disabled", async () => {
      await put("X's Admin", L_DISABLED, goodBody()).expect(200);
      expect(learnerRow(L_DISABLED).studentfirstname).toBe(NEW_FIRST);
      expect(db.tables.schoolusers.find((r) => r.schooluserid === L_DISABLED)!.isdisabled).toBe(true);
    });
    it("the username, the password and the school are not changed", async () => {
      await put("X's Admin", L_X, goodBody()).expect(200);
      const login = db.tables.schoolusers.find((r) => r.schooluserid === L_X)!;
      expect(login).toMatchObject({ schoolusername: "learnerx", schooluserpasswordhash: "hash", schoolid: S_X });
      expect(learnerRow(L_X).schoolid).toBe(S_X);
    });

    describe("the single curriculumid", () => {
      it("is kept while it is still in the new list", async () => {
        learnerRow(L_X).curriculumids = [CUR_X, CUR_X2];
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X2, CUR_X3, CUR_X] })).expect(200);
        expect(learnerRow(L_X)).toMatchObject({ curriculumid: CUR_X, curriculumids: [CUR_X2, CUR_X3, CUR_X] });
      });
      it("is replaced by the first of the new list when it was dropped", async () => {
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X3, CUR_X2] })).expect(200);
        expect(learnerRow(L_X)).toMatchObject({ curriculumid: CUR_X3, curriculumids: [CUR_X3, CUR_X2] });
      });
      it("repeats in the list are stored once", async () => {
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X2, CUR_X2] })).expect(200);
        expect(learnerRow(L_X).curriculumids).toEqual([CUR_X2]);
      });
      it("the learners list still shows the learner afterwards (it joins on the single curriculumid)", async () => {
        const list = async () => {
          const res = await request(app.getHttpServer()).post("/student").set("Authorization", callers["X's Admin"]).set("Connection", "close").send({ pageindex: 1, pagesize: 50, filter: [] }).expect(200);
          return (res.body.data.data as Row[]).map((r) => r.schooluserid);
        };
        expect(await list()).toContain(L_X);
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X3] })).expect(200);
        expect(learnerRow(L_X).curriculumid).toBe(CUR_X3);
        // the curriculum it was dropped from goes away: a learner still pointing at it would fall out of the list
        db.tables.curriculums = db.tables.curriculums.filter((c) => c.curriculumid !== CUR_X);
        expect(await list()).toContain(L_X);
      });
    });

    describe("the grade", () => {
      const grade = () => learnerRow(L_X).gradeid;
      const gradeRefusal = (res: request.Response, message: string) => {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        expect(res.body.fields).toEqual([{ field: "gradeid", message }]);
        expect(transaction.commit).not.toHaveBeenCalled();
      };
      const CHOOSE = "Choose a grade for this student.";
      const INVALID = "Choose a grade of this curriculum.";
      const NONE = "This curriculum has no grade yet, so a learner can't be put in it.";
      it("a new primary curriculum with one grade and none named stores that grade", async () => {
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X2] })).expect(200);
        expect(grade()).toBe(G_X2);
      });
      it("a new curriculum with two grades and none named is a 400 naming gradeid, nothing written", async () => {
        gradeRefusal(await refuses("X's Admin", L_X, goodBody({ curriculumids: [CUR_TWO] })), CHOOSE);
      });
      it.each([G_TWO_A, G_TWO_B])("a new curriculum with two grades and %s named stores it", async (gradeid) => {
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_TWO], gradeid })).expect(200);
        expect(learnerRow(L_X)).toMatchObject({ curriculumid: CUR_TWO, gradeid });
      });
      it("a grade of ANOTHER curriculum of the same organisation is a 400, nothing written", async () => {
        gradeRefusal(await refuses("X's Admin", L_X, goodBody({ curriculumids: [CUR_X2], gradeid: G_X3 })), INVALID);
        // even the learner's own current grade, when the primary curriculum has changed
        gradeRefusal(await refuses("X's Admin", L_X, goodBody({ curriculumids: [CUR_X2], gradeid: G_X })), INVALID);
      });
      it("a deleted grade is a 400, and a curriculum whose only grade is deleted has none", async () => {
        gradeRefusal(await refuses("X's Admin", L_X, goodBody({ curriculumids: [CUR_DEL], gradeid: G_DEL })), INVALID);
        gradeRefusal(await refuses("X's Admin", L_X, goodBody({ curriculumids: [CUR_DEL] })), NONE);
      });
      it("a curriculum with no grade is a 400, nothing written", async () => {
        gradeRefusal(await refuses("X's Admin", L_X, goodBody({ curriculumids: [CUR_NONE] })), NONE);
      });
      it("another organisation's grade is the same 400 as a grade that does not exist", async () => {
        const foreign = await refuses("X's Admin", L_X, goodBody({ gradeid: G_Y }));
        const missing = await refuses("X's Admin", L_X, goodBody({ gradeid: MISSING }));
        gradeRefusal(foreign, INVALID);
        expect(said(foreign)).toEqual(said(missing));
      });
      it("an unchanged curriculum keeps the current grade even when the curriculum has several", async () => {
        const row = learnerRow(L_X);
        row.curriculumid = CUR_TWO;
        row.curriculumids = [CUR_TWO];
        row.gradeid = G_TWO_B;
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_TWO] })).expect(200);
        expect(learnerRow(L_X)).toMatchObject({ curriculumid: CUR_TWO, gradeid: G_TWO_B });
      });
      it("a named grade replaces the current one in the same curriculum", async () => {
        const row = learnerRow(L_X);
        row.curriculumid = CUR_TWO;
        row.curriculumids = [CUR_TWO];
        row.gradeid = G_TWO_B;
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_TWO], gradeid: G_TWO_A })).expect(200);
        expect(grade()).toBe(G_TWO_A);
      });
      it("a learner with no grade yet and a curriculum of several is asked to choose; one grade fills it in", async () => {
        learnerRow(L_X).gradeid = null;
        gradeRefusal(await refuses("X's Admin", L_X, goodBody({ curriculumids: [CUR_TWO] })), CHOOSE);
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X] })).expect(200);
        expect(grade()).toBe(G_X);
      });
      it("a current grade that belongs to another curriculum is not kept", async () => {
        learnerRow(L_X).gradeid = G_X3;
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X] })).expect(200);
        expect(grade()).toBe(G_X);
      });
      it("the current grade is not kept when the primary curriculum changes, and the new curriculum's one grade is stored", async () => {
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X3] })).expect(200);
        expect(learnerRow(L_X)).toMatchObject({ curriculumid: CUR_X3, gradeid: G_X3 });
      });
      it.each([[5], [{}], [["x"]], ["x".repeat(37)]])("a gradeid that is not an id (%j) is a 400 naming gradeid", async (gradeid) => {
        gradeRefusal(await refuses("X's Admin", L_X, goodBody({ gradeid })), INVALID);
      });
    });

    describe("whose learner", () => {
      it.each(IN_X)("%s: another organisation's learner is the 404 a missing one gets, nothing written or sent", async (who) => {
        const foreign = await refuses(who, L_Y);
        const missing = await refuses(who, MISSING);
        expect(foreign.status).toBe(404);
        expect(said(foreign)).toEqual(said(missing));
      });
      it.each(IN_X)("%s: a teacher, a teacher login with a learner row and a removed learner are the same 404", async (who) => {
        const missing = said(await refuses(who, MISSING));
        for (const id of [T_X, T_STU, L_GONE]) expect(said(await refuses(who, id))).toEqual(missing);
      });
      it("a platform user not acting is asked to choose an organisation, and nothing is written", async () => {
        const res = await refuses("a platform user not acting", L_X);
        expect(res.status).toBe(400);
        expect(res.body.errormessage).toBe("Choose an organisation.");
      });
      it("a server token is refused (401)", async () => {
        expect((await refuses("a server token", L_X)).status).toBe(401);
      });
      it("an Admin without the update permission is refused (403), nothing written", async () => {
        expect((await refuses("an Admin without the update permission", L_X)).status).toBe(403);
      });
    });

    describe("whose class and curricula", () => {
      const classRule = [{ field: "standard", message: "Choose a class for this student." }];
      it.each(IN_X)("%s: a class of another school of the same organisation is a 400 on standard", async (who) => {
        const res = await refuses(who, L_X, goodBody({ standard: K_X2 }));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        expect(res.body.fields).toEqual(classRule);
      });
      it.each(IN_X)("%s: another organisation's class and a class that does not exist are refused the same way", async (who) => {
        const foreign = await refuses(who, L_X, goodBody({ standard: K_Y }));
        const missing = await refuses(who, L_X, goodBody({ standard: MISSING }));
        expect(foreign.status).toBe(400);
        expect(foreign.body.fields).toEqual(classRule);
        expect(said(foreign)).toEqual(said(missing));
      });
      it("a deleted class is refused", async () => {
        db.tables.standards.find((r) => r.standardid === K_X_B)!.isdeleted = true;
        expect((await refuses("X's Admin", L_X, goodBody())).body.fields).toEqual(classRule);
      });
      it.each(IN_X)("%s: another organisation's curriculum is refused, even beside a good one", async (who) => {
        for (const curriculumids of [[CUR_Y], [CUR_X, CUR_Y]]) {
          const res = await refuses(who, L_X, goodBody({ curriculumids }));
          expect(res.status).toBe(400);
          expect(res.body.fields).toEqual([{ field: "curriculumids", message: "Choose curricula that exist." }]);
        }
      });
      it("a curriculum that does not exist or is deleted is refused", async () => {
        expect((await refuses("X's Admin", L_X, goodBody({ curriculumids: [MISSING] }))).body.fields).toEqual([{ field: "curriculumids", message: "Choose curricula that exist." }]);
        db.tables.curriculums.find((r) => r.curriculumid === CUR_X2)!.isdeleted = true;
        expect((await refuses("X's Admin", L_X, goodBody())).body.fields).toEqual([{ field: "curriculumids", message: "Choose curricula that exist." }]);
      });
    });

    describe("the body", () => {
      const NAME = (min: number) => `Enter a name of ${min} to 45 characters.`;
      const DATE = "Enter a real date in the past, as YYYY-MM-DD.";
      const cases: Array<[string, unknown, Array<{ field: string; message: string }>]> = [
        ["no first name", without(goodBody(), "studentfirstname"), [{ field: "studentfirstname", message: NAME(2) }]],
        ["a one-character first name", goodBody({ studentfirstname: "ក" }), [{ field: "studentfirstname", message: NAME(2) }]],
        ["a first name of spaces", goodBody({ studentfirstname: "   " }), [{ field: "studentfirstname", message: NAME(2) }]],
        ["a first name that is too long", goodBody({ studentfirstname: "ក".repeat(46) }), [{ field: "studentfirstname", message: NAME(2) }]],
        ["a first name that is a number", goodBody({ studentfirstname: 12 }), [{ field: "studentfirstname", message: NAME(2) }]],
        ["no last name key", without(goodBody(), "studentlastname"), [{ field: "studentlastname", message: "Send the last name, or an empty one." }]],
        ["a last name that is too long", goodBody({ studentlastname: "ក".repeat(46) }), [{ field: "studentlastname", message: NAME(1) }]],
        ["a last name that is a number", goodBody({ studentlastname: 5 }), [{ field: "studentlastname", message: NAME(1) }]],
        ["no gender", without(goodBody(), "genderid"), [{ field: "genderid", message: "Choose a gender." }]],
        ["a gender of 3", goodBody({ genderid: 3 }), [{ field: "genderid", message: "Choose a gender." }]],
        ["no date of birth key", without(goodBody(), "dateofbirth"), [{ field: "dateofbirth", message: DATE }]],
        ["a date that is not a date", goodBody({ dateofbirth: "2015-02-30" }), [{ field: "dateofbirth", message: DATE }]],
        ["a date in the other order", goodBody({ dateofbirth: "09-03-2015" }), [{ field: "dateofbirth", message: DATE }]],
        ["a date in the future", goodBody({ dateofbirth: "2999-01-01" }), [{ field: "dateofbirth", message: DATE }]],
        ["a date before 1900", goodBody({ dateofbirth: "1899-12-31" }), [{ field: "dateofbirth", message: DATE }]],
        ["no class", without(goodBody(), "standard"), [{ field: "standard", message: "Choose a class for this student." }]],
        ["an empty class", goodBody({ standard: "" }), [{ field: "standard", message: "Choose a class for this student." }]],
        ["no curricula key", without(goodBody(), "curriculumids"), [{ field: "curriculumids", message: "Choose at least one curriculum." }]],
        ["no curricula", goodBody({ curriculumids: [] }), [{ field: "curriculumids", message: "Choose at least one curriculum." }]],
        ["curricula that are not a list", goodBody({ curriculumids: CUR_X }), [{ field: "curriculumids", message: "Choose at least one curriculum." }]],
        ["an empty object", {}, ["studentfirstname", "studentlastname", "genderid", "dateofbirth", "standard", "curriculumids"].map((field) => ({ field, message: expect.any(String) }))],
        [
          "several wrong at once",
          goodBody({ genderid: 9, standard: "" }),
          [
            { field: "genderid", message: "Choose a gender." },
            { field: "standard", message: "Choose a class for this student." },
          ],
        ],
      ];
      it.each(cases)("%s is a 400 INVALID_INPUT naming the field, nothing written or sent", async (_name, body, fields) => {
        const res = await refuses("X's Admin", L_X, body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        expect(res.body.fields).toEqual(fields);
        expect(transaction.commit).not.toHaveBeenCalled();
      });
      it.each(["schoolid", "schoolusername", "password", "isdeleted", "studentid", "curriculumid"])("an unknown key (%s) is refused without being echoed", async (key) => {
        const res = await refuses("X's Admin", L_X, goodBody({ [key]: "evilvalue" }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "body", message: "This request contains a field that isn't allowed." }]);
        expect(JSON.stringify(res.body)).not.toContain("evilvalue");
      });
      it("a body that is not an object is a 400", async () => {
        const res = await refuses("X's Admin", L_X, [goodBody()]);
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "body", message: "Send the learner's details as an object." }]);
      });
      it("a gender sent as its digit is accepted, as the add form accepts it", async () => {
        await put("X's Admin", L_X, goodBody({ genderid: "1" })).expect(200);
        expect(learnerRow(L_X).genderid).toBe(1);
      });
    });

    describe("the transaction", () => {
      it("rolls back, and does not commit or push, when the write fails", async () => {
        jest.spyOn(students, "update").mockRejectedValueOnce(new Error("update failed"));
        const before = db.snapshot();
        const res = await put("X's Admin", L_X, goodBody());
        expect(res.status).toBe(500);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(axios.put).not.toHaveBeenCalled();
        expect(db.snapshot()).toEqual(before);
      });
    });

    describe("the push to the student server", () => {
      it("sends only this learner, as edited, with the organisation and a timeout", async () => {
        await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X3, CUR_X2] })).expect(200);
        expect(axios.put).toHaveBeenCalledTimes(1);
        const [url, , options] = (axios.put as jest.Mock).mock.calls[0];
        expect(url).toBe("http://learner-server.invalid/import/students");
        expect(options.headers["X-Organisation-Id"]).toBe(X);
        expect(options.timeout).toBe(15_000);
        expect(mockZipEntries).toHaveLength(1);
        expect(mockZipEntries[0].name).toBe("students.ini");
        expect(mockZipEntries[0].json.schoolid).toBe(S_X);
        const sent = mockZipEntries[0].json.studentusers as Array<{ schooluserid: string; student?: Row }>;
        expect(sent.map((r) => r.schooluserid)).toEqual([L_X]);
        expect(JSON.stringify(sent)).toContain(NEW_FIRST);
        expect(JSON.stringify(sent)).toContain(K_X_B);
        expect(JSON.stringify(sent)).toContain(CUR_X3);
      });
      it("a refused push keeps the edit and says to run the sync, without the server key", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true, config: { headers: { Authorization: "SECRET-KEY" } } }));
        const res = await put("X's Admin", L_X, goodBody()).expect(200);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe("The details were saved, but the learning server did not answer. Run Sync Students for this school on the Schools screen.");
        expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
        expect(everythingLogged()).not.toContain("SECRET-KEY");
        expect(Logger.error as jest.Mock).toHaveBeenCalled();
        expect(learnerRow(L_X).studentfirstname).toBe(NEW_FIRST);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
      });
      it("the student server refusing the class or the curriculum (400) says to run Sync Content first, then Sync Students", async () => {
        for (const field of ["schoolid", "schoolname", "standard", "curriculumid", "curriculumids"]) {
          (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "SERVER-TEXT", hint: "SERVER-TEXT", fields: [{ field, message: "SERVER-TEXT" }] } }, config: { headers: { Authorization: "SECRET-KEY" } } }));
          const res = await put("X's Admin", L_X, goodBody()).expect(200);
          expect(res.body.push.status).toBe("failed");
          expect(res.body.push.message).toBe("Saved, but the learning server doesn't have this school, class or curriculum yet. Run Sync Content, then Sync Students for this school.");
          expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
          expect(JSON.stringify(res.body)).not.toContain("SERVER-TEXT");
          expect(learnerRow(L_X).studentfirstname).toBe(NEW_FIRST);
        }
      });
      it("another 400 from the student server keeps the Sync Students message", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "x", fields: [{ field: "genderid", message: "x" }] } } }));
        const res = await put("X's Admin", L_X, goodBody()).expect(200);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toContain("Run Sync Students for this school on the Schools screen.");
        expect(res.body.push.message).not.toContain("Sync Content");
      });
      it("a timed-out push is a failed outcome too", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
        expect((await put("X's Admin", L_X, goodBody()).expect(200)).body.push.status).toBe("failed");
      });
      it("is skipped when no student server is set up", async () => {
        rpi.cloud = undefined;
        const res = await put("X's Admin", L_X, goodBody()).expect(200);
        expect(res.body.push).toEqual({ status: "skipped", reason: "nocloud", message: "Saved. No learner server is set up here, so nothing was pushed." });
        expect(axios.put).not.toHaveBeenCalled();
        expect(learnerRow(L_X).studentfirstname).toBe(NEW_FIRST);
      });
    });
  });
});
