import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import axios from "axios";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { schoolusers } from "src/models/data-models/schoolusers";
import { students } from "src/models/data-models/students";
import { Role } from "src/models/enums";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { StudentController } from "./student.controller";

/**
 * Moving one learner to another school (PUT /student/:schooluserid/school), driven over real HTTP
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
const K_X = uuid(501);
const K_X_B = uuid(503); // a second class of the same school
const K_Y = uuid(502);
const K_X2 = uuid(504); // a class of X's second school
const L_X = uuid(411); // the learner moved
const L_OTHER = uuid(414); // a second learner of the same school
const L_DISABLED = uuid(415);
const L_Y = uuid(412);
const L_GONE = uuid(416);
const T_X = uuid(421);
const T_STU = uuid(431); // a teacher login that also has a live learner row
const MISSING = uuid(999);
const FIRST = "សុខា";
const LAST = "ចាន់";

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

const goodBody = (over: Row = {}): Row => ({ schoolid: S_X2, standard: K_X2, curriculumids: [CUR_X], ...over });
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
    db.add("students", { studentid: uuid(n), schooluserid: id, schoolid: school, schoolname: "x", studentfirstname: FIRST, studentlastname: LAST, dateofbirth: new Date(2015, 2, 9), standard: K_X, curriculumid: CUR_X, curriculumids: [CUR_X], genderid: 1, isactive: 1, is_teacher_acc: false, type: "online", isdeleted: false, ...over });
  login(L_X, "learnerx", S_X);
  login(L_OTHER, "learnerx2", S_X);
  login(L_DISABLED, "learnerx3", S_X, { isdisabled: true });
  login(L_Y, "learnery", S_Y);
  login(L_GONE, "learnergone", S_X, { isdeleted: true });
  learner(401, L_X, S_X);
  learner(402, L_OTHER, S_X);
  learner(403, L_DISABLED, S_X);
  learner(404, L_Y, S_Y, { standard: K_Y, curriculumid: CUR_Y, curriculumids: [CUR_Y] });
  learner(405, L_GONE, S_X, { isdeleted: true });
  login(T_X, "teacherx", S_X, { schooluserrole: SchoolRole.TEACHER });
  login(T_STU, "teacherstu", S_X, { schooluserrole: SchoolRole.TEACHER });
  learner(406, T_STU, S_X);
};


describe("moving one learner to another school", () => {
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
    jest.spyOn(dbinstance.getdbinstance(), "query").mockImplementation((async () => []) as never);
    (axios.post as jest.Mock).mockReset().mockRejectedValue(new Error("no cloud in a test"));
  });

  const put = (who: Who, id: string, body?: unknown) => {
    const r = request(app.getHttpServer()).put(`/student/${id}/school`).set("Authorization", callers[who]).set("Connection", "close");
    return body === undefined ? r : r.send(body as object);
  };
  const learnerRow = (id: string) => db.tables.students.find((r) => r.schooluserid === id)! as Row;
  const loginRow = (id: string) => db.tables.schoolusers.find((r) => r.schooluserid === id)! as Row;
  const refuses = async (who: Who, id: string, body?: unknown) => {
    const before = db.snapshot();
    const res = await put(who, id, body === undefined ? goodBody() : body);
    expect(db.snapshot()).toEqual(before);
    expect(axios.put).not.toHaveBeenCalled();
    return res;
  };
  const everythingLogged = () =>
    JSON.stringify([...(Logger.error as jest.Mock).mock.calls, ...(Logger.warn as jest.Mock).mock.calls, ...(Logger.info as jest.Mock).mock.calls, ...(Logger.debug as jest.Mock).mock.calls, ...logged.map((l) => l.mock.calls)]);

  const NAME_X2 = "សាលា គ";

  describe("the move", () => {
    it.each(IN_X)("%s: moves the learner, whole answer, writing both tables and nothing else", async (who) => {
      const before = db.snapshot();
      const res = await put(who, L_X, goodBody()).expect(200);
      expect(res.body).toEqual({
        schooluserid: L_X,
        username: "learnerx",
        schoolid: S_X2,
        schoolname: NAME_X2,
        push: { status: "pushed", message: `Moved to ${NAME_X2}. The learner signs in again to see it.` },
      });
      expect(loginRow(L_X)).toMatchObject({ schoolid: S_X2, schoolname: NAME_X2 });
      expect(learnerRow(L_X)).toMatchObject({ schoolid: S_X2, schoolname: NAME_X2, standard: K_X2, curriculumids: [CUR_X], curriculumid: CUR_X });
      // nothing else of the learner or the login changed
      const keep = (row: Row, changed: string[]) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k]) => !changed.includes(k)))));
      const audit = ["updated_at", "updated_by"];
      expect(keep(learnerRow(L_X), ["schoolid", "schoolname", "standard", "curriculumids", "curriculumid", ...audit])).toEqual(
        keep(before.students.find((r) => r.schooluserid === L_X)!, ["schoolid", "schoolname", "standard", "curriculumids", "curriculumid", ...audit]),
      );
      expect(keep(loginRow(L_X), ["schoolid", "schoolname", ...audit])).toEqual(keep(before.schoolusers.find((r) => r.schooluserid === L_X)!, ["schoolid", "schoolname", ...audit]));
      expect(learnerRow(L_X).updated_by).toBe(who === "X's Organisation Admin" ? "oa" : who === "X's Admin" ? "ad" : "p");
      // no other learner or login was touched
      expect(db.snapshot().students.filter((r) => r.schooluserid !== L_X)).toEqual(before.students.filter((r) => r.schooluserid !== L_X));
      expect(db.snapshot().schoolusers.filter((r) => r.schooluserid !== L_X)).toEqual(before.schoolusers.filter((r) => r.schooluserid !== L_X));
      expect(transaction.commit).toHaveBeenCalledTimes(1);
      expect(transaction.rollback).not.toHaveBeenCalled();
    });
    it("a disabled learner can be moved and stays disabled", async () => {
      await put("X's Admin", L_DISABLED, goodBody()).expect(200);
      expect(learnerRow(L_DISABLED).schoolid).toBe(S_X2);
      expect(loginRow(L_DISABLED)).toMatchObject({ schoolid: S_X2, isdisabled: true });
    });
    it("the username, the password and the name stay as they were", async () => {
      await put("X's Admin", L_X, goodBody()).expect(200);
      expect(loginRow(L_X)).toMatchObject({ schoolusername: "learnerx", schooluserpasswordhash: "hash" });
      expect(learnerRow(L_X)).toMatchObject({ studentfirstname: FIRST, studentlastname: LAST, genderid: 1, isactive: 1 });
    });
    it("a read after the move shows the new school", async () => {
      await put("X's Admin", L_X, goodBody()).expect(200);
      const res = await request(app.getHttpServer()).get(`/student/${L_X}/details`).set("Authorization", callers["X's Admin"]).set("Connection", "close").expect(200);
      expect(res.body).toMatchObject({ schoolid: S_X2, schoolname: NAME_X2, standard: K_X2 });
    });
    it("a learner moved away from a deleted school can still be moved", async () => {
      db.tables.schools.find((r) => r.schoolid === S_X)!.isdeleted = true;
      await put("X's Admin", L_X, goodBody()).expect(200);
      expect(learnerRow(L_X).schoolid).toBe(S_X2);
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
    });

    describe("a login with two learner rows", () => {
      it("is a 409 with the contract's message, nothing written or sent", async () => {
        db.add("students", { ...learnerRow(L_X), studentid: uuid(450) });
        const res = await refuses("X's Admin", L_X);
        expect(res.status).toBe(409);
        expect(res.body.errormessage).toBe("This learner has more than one record, so it can't be moved here. Contact support.");
      });
      it("a deleted second row does not count: the live row is moved and the deleted one is left alone", async () => {
        db.add("students", { ...learnerRow(L_X), studentid: uuid(451), isdeleted: true });
        await put("X's Admin", L_X, goodBody()).expect(200);
        expect(db.tables.students.find((r) => r.studentid === uuid(451))).toMatchObject({ schoolid: S_X, isdeleted: true });
        expect(learnerRow(L_X).schoolid).toBe(S_X2);
      });
      it("a second row in another organisation's school is the 404 of an absent learner", async () => {
        db.add("students", { ...learnerRow(L_X), studentid: uuid(452), schoolid: S_Y });
        const missing = said(await refuses("X's Admin", MISSING));
        expect(said(await refuses("X's Admin", L_X))).toEqual(missing);
      });
    });
  });

  describe("whose learner", () => {
    it.each(IN_X)("%s: another organisation's learner is the 404 a missing one gets, nothing written or sent", async (who) => {
      const foreign = await refuses(who, L_Y, goodBody());
      const missing = await refuses(who, MISSING, goodBody());
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

  describe("the new school, class and curricula", () => {
    const school = [{ field: "schoolid", message: "Choose a school." }];
    const klass = [{ field: "standard", message: "Choose a class for this student." }];
    const curricula = [{ field: "curriculumids", message: "Choose curricula that exist." }];
    it.each(IN_X)("%s: another organisation's school is a 400 on schoolid", async (who) => {
      const res = await refuses(who, L_X, goodBody({ schoolid: S_Y, standard: K_Y }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_INPUT");
      expect(res.body.errormessage).toBe("Check the highlighted fields.");
      expect(res.body.fields).toEqual(school);
    });
    it.each(IN_X)("%s: a school that does not exist, a deleted one and one with no organisation are refused the same way", async (who) => {
      db.add("schools", { schoolid: uuid(299), schoolname: "no owner", organisationid: null, countryid: C1, curriculums: [] });
      db.add("schools", { schoolid: uuid(298), schoolname: "closed", organisationid: X, countryid: C1, curriculums: [], isdeleted: true });
      for (const schoolid of [MISSING, uuid(299), uuid(298)]) {
        const res = await refuses(who, L_X, goodBody({ schoolid }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual(school);
      }
    });
    it.each(IN_X)("%s: the learner's current school is a 400 asking for a different one", async (who) => {
      const res = await refuses(who, L_X, goodBody({ schoolid: S_X, standard: K_X_B }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "schoolid", message: "Choose a different school." }]);
    });
    it.each(IN_X)("%s: a class of the old school is a 400 on standard", async (who) => {
      for (const standard of [K_X, K_X_B]) {
        const res = await refuses(who, L_X, goodBody({ standard }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual(klass);
      }
    });
    it.each(IN_X)("%s: another organisation's class, a class that does not exist and a deleted one are refused the same way", async (who) => {
      const foreign = await refuses(who, L_X, goodBody({ standard: K_Y }));
      const missing = await refuses(who, L_X, goodBody({ standard: MISSING }));
      expect(foreign.body.fields).toEqual(klass);
      expect(said(foreign)).toEqual(said(missing));
      db.tables.standards.find((r) => r.standardid === K_X2)!.isdeleted = true;
      expect((await refuses(who, L_X, goodBody())).body.fields).toEqual(klass);
    });
    it.each(IN_X)("%s: another organisation's curriculum is refused, even beside a good one", async (who) => {
      for (const curriculumids of [[CUR_Y], [CUR_X, CUR_Y]]) {
        const res = await refuses(who, L_X, goodBody({ curriculumids }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual(curricula);
      }
    });
    it("a curriculum that does not exist or is deleted is refused", async () => {
      expect((await refuses("X's Admin", L_X, goodBody({ curriculumids: [MISSING] }))).body.fields).toEqual(curricula);
      db.tables.curriculums.find((r) => r.curriculumid === CUR_X)!.isdeleted = true;
      expect((await refuses("X's Admin", L_X, goodBody())).body.fields).toEqual(curricula);
    });
    it("every wrong field is named at once", async () => {
      // a school that cannot be chosen and curricula that do not exist
      expect((await refuses("X's Admin", L_X, goodBody({ schoolid: S_Y, curriculumids: [CUR_Y] }))).body.fields).toEqual([...school, ...curricula]);
      expect((await refuses("X's Admin", L_X, goodBody({ schoolid: S_X, curriculumids: [CUR_Y] }))).body.fields).toEqual([{ field: "schoolid", message: "Choose a different school." }, ...curricula]);
      // a good school with a class of the old school and curricula that do not exist
      expect((await refuses("X's Admin", L_X, goodBody({ standard: K_X, curriculumids: [CUR_Y] }))).body.fields).toEqual([...klass, ...curricula]);
    });

    describe("the body", () => {
      const cases: Array<[string, unknown, Array<{ field: string; message: string }>]> = [
        ["no school", without(goodBody(), "schoolid"), school],
        ["an empty school", goodBody({ schoolid: "" }), school],
        ["a school that is a number", goodBody({ schoolid: 5 }), school],
        ["no class", without(goodBody(), "standard"), klass],
        ["an empty class", goodBody({ standard: "" }), klass],
        ["no curricula key", without(goodBody(), "curriculumids"), [{ field: "curriculumids", message: "Choose at least one curriculum." }]],
        ["no curricula", goodBody({ curriculumids: [] }), [{ field: "curriculumids", message: "Choose at least one curriculum." }]],
        ["curricula that are not a list", goodBody({ curriculumids: CUR_X }), [{ field: "curriculumids", message: "Choose at least one curriculum." }]],
        ["an empty object", {}, [...school, ...klass, { field: "curriculumids", message: "Choose at least one curriculum." }]],
      ];
      it.each(cases)("%s is a 400 INVALID_INPUT naming the field, nothing written or sent", async (_name, body, fields) => {
        const res = await refuses("X's Admin", L_X, body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        expect(res.body.fields).toEqual(fields);
        expect(transaction.commit).not.toHaveBeenCalled();
      });
      it.each(["studentfirstname", "schoolusername", "password", "isdeleted", "studentid", "curriculumid", "schoolname"])("an unknown key (%s) is refused without being echoed", async (key) => {
        const res = await refuses("X's Admin", L_X, goodBody({ [key]: "evilvalue" }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "body", message: "This request contains a field that isn't allowed." }]);
        expect(JSON.stringify(res.body)).not.toContain("evilvalue");
      });
      it("a body that is not an object is a 400", async () => {
        const res = await refuses("X's Admin", L_X, [goodBody()]);
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "body", message: "Send the new school as an object." }]);
      });
    });
  });

  describe("the transaction", () => {
    it.each([
      ["the login's", () => jest.spyOn(schoolusers, "update")],
      ["the learner's", () => jest.spyOn(students, "update")],
    ])("rolls back, and does not commit or push, when %s write fails", async (_name, fail) => {
      fail().mockRejectedValueOnce(new Error("update failed"));
      const res = await put("X's Admin", L_X, goodBody());
      expect(res.status).toBe(500);
      expect(transaction.rollback).toHaveBeenCalledTimes(1);
      expect(transaction.commit).not.toHaveBeenCalled();
      expect(axios.put).not.toHaveBeenCalled();
    });
  });

  describe("the push to the student server", () => {
    it("sends only this learner, in the new school's roster, after the move has committed", async () => {
      let commitsWhenPushed = -1;
      (axios.put as jest.Mock).mockImplementation(async () => {
        commitsWhenPushed = transaction.commit.mock.calls.length;
        return { status: 200, data: {} };
      });
      await put("X's Admin", L_X, goodBody({ curriculumids: [CUR_X3, CUR_X2] })).expect(200);
      expect(commitsWhenPushed).toBe(1);
      expect(axios.put).toHaveBeenCalledTimes(1);
      const [url, , options] = (axios.put as jest.Mock).mock.calls[0];
      expect(url).toBe("http://learner-server.invalid/import/students");
      expect(options.headers["X-Organisation-Id"]).toBe(X);
      expect(options.timeout).toBe(15_000);
      expect(mockZipEntries).toHaveLength(1);
      expect(mockZipEntries[0].name).toBe("students.ini");
      expect(mockZipEntries[0].json.schoolid).toBe(S_X2);
      const sent = mockZipEntries[0].json.studentusers as Array<{ schooluserid: string; schoolid?: string }>;
      expect(sent.map((r) => r.schooluserid)).toEqual([L_X]);
      expect(JSON.stringify(sent)).toContain(K_X2);
      expect(JSON.stringify(sent)).toContain(CUR_X3);
      expect(JSON.stringify(sent)).toContain(S_X2);
    });
    it("a refused push keeps the move and says to run Sync Students for the new school, without the server key", async () => {
      (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true, config: { headers: { Authorization: "SECRET-KEY" } } }));
      const res = await put("X's Admin", L_X, goodBody()).expect(200);
      expect(res.body.push.status).toBe("failed");
      expect(res.body.push.message).toBe(`Moved, but the learning server did not answer. Run Sync Students for ${NAME_X2} on the Schools screen.`);
      expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
      expect(everythingLogged()).not.toContain("SECRET-KEY");
      expect(Logger.error as jest.Mock).toHaveBeenCalled();
      expect(learnerRow(L_X).schoolid).toBe(S_X2);
      expect(loginRow(L_X).schoolid).toBe(S_X2);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });
    it("the student server refusing the class or the curriculum (400) says to run Sync Content first, then Sync Students", async () => {
      for (const field of ["standard", "curriculumid", "curriculumids"]) {
        db.tables.schoolusers.find((r) => r.schooluserid === L_X)!.schoolid = S_X;
        learnerRow(L_X).schoolid = S_X;
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "SERVER-TEXT", fields: [{ field, message: "SERVER-TEXT" }] } }, config: { headers: { Authorization: "SECRET-KEY" } } }));
        const res = await put("X's Admin", L_X, goodBody()).expect(200);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe(`Moved, but the learning server doesn't have this class or curriculum yet. Run Sync Content, then Sync Students for ${NAME_X2}.`);
        expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
        expect(JSON.stringify(res.body)).not.toContain("SERVER-TEXT");
        expect(learnerRow(L_X).schoolid).toBe(S_X2);
      }
    });
    it("another 400 from the student server keeps the Sync Students message", async () => {
      (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "x", fields: [{ field: "genderid", message: "x" }] } } }));
      const res = await put("X's Admin", L_X, goodBody()).expect(200);
      expect(res.body.push.message).toBe(`Moved, but the learning server did not answer. Run Sync Students for ${NAME_X2} on the Schools screen.`);
    });
    it("a timed-out push is a failed outcome too", async () => {
      (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
      expect((await put("X's Admin", L_X, goodBody()).expect(200)).body.push.status).toBe("failed");
    });
    it("is skipped when no student server is set up", async () => {
      rpi.cloud = undefined;
      const res = await put("X's Admin", L_X, goodBody()).expect(200);
      expect(res.body.push).toEqual({ status: "skipped", reason: "nocloud", message: `Moved to ${NAME_X2}. No learner server is set up here, so nothing was pushed.` });
      expect(axios.put).not.toHaveBeenCalled();
      expect(learnerRow(L_X).schoolid).toBe(S_X2);
    });
  });
});
