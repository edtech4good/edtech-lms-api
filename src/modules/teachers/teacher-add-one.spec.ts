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
import { Role } from "src/models/enums";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { StudentController } from "../students/student.controller";
import { TeacherController } from "./teacher.controller";

/**
 * Adding one teacher (POST /teacher/one), with the username check it shares with learners (GET /student/username-available), driven over real HTTP
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
const C2 = uuid(102);
const S_X = uuid(201);
const S_Y = uuid(202);
const S_X2 = uuid(204); // a second school of X
const MISSING = uuid(999);
const KHMER_SCHOOL = "សាលា ក";
const PASSWORD = "mango2tree";

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
  "X's Teacher": bearer({ lmsuserid: "te", lmsuserroles: [Role.teacher], permissions: ["view_school"], organisationid: X, isplatform: false }),
  "a school-user token": bearer({ schooluserid: uuid(499), schooluserrole: SchoolRole.TEACHER }),
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

const goodBody = (over: Row = {}): Row => ({ schoolid: S_X, schoolusername: "teacher7", password: PASSWORD, ...over });
const WEAK = "Use 8 to 32 characters with at least one letter and one number, and no spaces.";

const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("countries", { countryid: C1, countryname: "Cambodia", expectedusage: 1 });
  db.add("countries", { countryid: C2, countryname: "Laos", expectedusage: 1 });
  db.add("schools", { schoolid: S_X, schoolname: KHMER_SCHOOL, organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_X2, schoolname: "សាលា គ", organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_Y, schoolname: "សាលា ខ", organisationid: Y, countryid: C2, curriculums: [] });
  const login = (id: number, name: string, over: Row = {}) =>
    db.add("schoolusers", { schooluserid: uuid(id), schoolusername: name, schooluserrole: SchoolRole.STUDENT, schoolid: S_X, schoolname: KHMER_SCHOOL, schooluserstatus: true, isdisabled: false, schooluserpasswordhash: "hash", ...over });
  login(411, "Learner1");
  login(412, "Gone9", { isdeleted: true, schooluserrole: SchoolRole.TEACHER });
  login(413, "teacher1", { schooluserrole: SchoolRole.TEACHER });
};

describe("adding one teacher", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ imports: [ThrottlerModule.forRoot({ ttl: 60, limit: 1000 })], controllers: [StudentController, TeacherController], providers: [JwtAccessStrategy] }).compile();
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

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(Logger, "error").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    tokenExists.mockResolvedValue(true);
    transaction.commit.mockReset();
    transaction.rollback.mockReset();
    db.install();
    seed();
    rpi.cloud = "http://learner-server.invalid";
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    (axios.put as jest.Mock).mockReset().mockResolvedValue({ status: 200, data: {} });
  });

  const send = (who: Who, method: "get" | "post", path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](path).set("Authorization", callers[who]).set("Connection", "close");
    return body ? r.send(body) : r;
  };
  const refuses = async (who: Who, body: object) => {
    const before = db.snapshot();
    const res = await send(who, "post", "/teacher/one", body);
    expect(db.snapshot()).toEqual(before);
    expect(axios.put).not.toHaveBeenCalled();
    return res;
  };

  describe("the username check a teacher form uses", () => {
    it("answers for teachers' and learners' names alike, in any case, and for a deleted teacher's", async () => {
      for (const name of ["teacher1", "TEACHER1", "learner1", "gone9"]) {
        const res = await send("X's Admin", "get", `/student/username-available?username=${name}`).expect(200);
        expect(res.body).toEqual({ available: false });
      }
      expect((await send("X's Admin", "get", "/student/username-available?username=teacher7").expect(200)).body).toEqual({ available: true });
    });
  });

  describe("POST /teacher/one", () => {
    it.each(IN_X)("%s: adds the teacher, whole answer, and stores a teacher login with no learner row", async (who) => {
      const res = await send(who, "post", "/teacher/one", goodBody()).expect(201);
      expect(res.body).toEqual({
        schooluserid: expect.stringMatching(/^[0-9a-f-]{36}$/),
        schoolusername: "teacher7",
        push: { status: "pushed", message: "Added. The teacher can sign in now." },
      });
      const logins = db.createdIn("schoolusers");
      expect(logins).toHaveLength(1);
      expect(logins[0]).toMatchObject({
        schoolusername: "teacher7",
        schooluserrole: SchoolRole.TEACHER,
        schooluserstatus: 1,
        isdisabled: false,
        schoolid: S_X,
        schoolname: KHMER_SCHOOL,
        schooluserid: res.body.schooluserid,
      });
      expect(String(logins[0].schooluserpasswordhash)).toMatch(/^\$2/);
      expect(logins[0].schooluserpasswordhash).not.toBe(PASSWORD);
      expect(db.createdIn("students")).toHaveLength(0);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
      expect(transaction.rollback).not.toHaveBeenCalled();
    });
    it("the answer holds neither the password nor its hash", async () => {
      const res = await send("X's Admin", "post", "/teacher/one", goodBody()).expect(201);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain("$2");
      expect(Object.keys(res.body).sort()).toEqual(["push", "schooluserid", "schoolusername"]);
    });
    it.each(["X's Teacher", "a school-user token", "a server token"] as Who[])("%s is refused before anything is read or written", async (who) => {
      const res = await refuses(who, goodBody());
      expect([401, 403]).toContain(res.status);
    });

    describe("validation", () => {
      const cases: Array<[string, Row, Array<{ field: string; message: string }>]> = [
        ["no school", goodBody({ schoolid: undefined }), [{ field: "schoolid", message: "Choose a school." }]],
        ["a school that is not an id", goodBody({ schoolid: "x" }), [{ field: "schoolid", message: "Choose a school." }]],
        ["no username", goodBody({ schoolusername: undefined }), [{ field: "schoolusername", message: "Use 2 to 16 English letters or numbers." }]],
        ["a one-character username", goodBody({ schoolusername: "a" }), [{ field: "schoolusername", message: "Use 2 to 16 English letters or numbers." }]],
        ["a username with a dot", goodBody({ schoolusername: "so.kha" }), [{ field: "schoolusername", message: "Use 2 to 16 English letters or numbers." }]],
        ["a Khmer username", goodBody({ schoolusername: "សុខា" }), [{ field: "schoolusername", message: "Use 2 to 16 English letters or numbers." }]],
        ["a password with no digit", goodBody({ password: "mangotreeabc" }), [{ field: "password", message: WEAK }]],
        ["a password with no letter", goodBody({ password: "12345678" }), [{ field: "password", message: WEAK }]],
        ["a short password", goodBody({ password: "abc123" }), [{ field: "password", message: WEAK }]],
        ["a long password", goodBody({ password: `a1${"b".repeat(31)}` }), [{ field: "password", message: WEAK }]],
        ["a password with a space", goodBody({ password: "mango 2tree" }), [{ field: "password", message: WEAK }]],
        ["no password", goodBody({ password: undefined }), [{ field: "password", message: WEAK }]],
        [
          "several wrong at once",
          goodBody({ password: "short", schoolusername: "x" }),
          [
            { field: "schoolusername", message: "Use 2 to 16 English letters or numbers." },
            { field: "password", message: WEAK },
          ],
        ],
      ];
      it.each(cases)("%s is a 400 naming the field, nothing written", async (_name, body, fields) => {
        const res = await refuses("X's Admin", body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        expect(res.body.fields).toEqual(fields);
        expect(transaction.commit).not.toHaveBeenCalled();
      });
      it("a key the body should not have is refused without being echoed", async () => {
        const res = await refuses("X's Admin", goodBody({ isdeleted: true, evilkeyname: 1 }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "body", message: "This request contains a field that isn't allowed." }]);
        expect(JSON.stringify(res.body)).not.toContain("evilkeyname");
      });
      it("the keys of a learner form are not accepted", async () => {
        const res = await refuses("X's Admin", goodBody({ standard: uuid(1), genderid: 1 }));
        expect(res.status).toBe(400);
      });
      it("a body that is not an object is a 400", async () => {
        const res = await refuses("X's Admin", [goodBody()]);
        expect(res.status).toBe(400);
      });
    });

    describe("the username", () => {
      it.each(["Learner1", "learner1", "LEARNER1", "teacher1", "TEACHER1"])("%s is taken, in any case, learner or teacher, and nothing is written", async (name) => {
        const res = await refuses("X's Admin", goodBody({ schoolusername: name }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "schoolusername", message: "That username is taken." }]);
      });
      it("a name kept by a deleted login is taken", async () => {
        const res = await refuses("X's Admin", goodBody({ schoolusername: "gone9" }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "schoolusername", message: "That username is taken." }]);
      });
      it("a name that reaches the unique key first is answered as taken, and rolled back", async () => {
        jest.spyOn(schoolusers, "bulkCreate").mockRejectedValueOnce(Object.assign(new Error("x"), { name: "SequelizeUniqueConstraintError" }));
        const res = await send("X's Admin", "post", "/teacher/one", goodBody());
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "schoolusername", message: "That username is taken." }]);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
      });
    });

    describe("whose school", () => {
      it.each(IN_X)("%s: another organisation's school is the 404 a missing school gets, nothing written or sent", async (who) => {
        const foreign = await refuses(who, goodBody({ schoolid: S_Y }));
        const missing = await refuses(who, goodBody({ schoolid: MISSING }));
        expect(foreign.status).toBe(404);
        expect(said(foreign)).toEqual(said(missing));
      });
      it("a second school of the same organisation is accepted", async () => {
        await send("X's Admin", "post", "/teacher/one", goodBody({ schoolid: S_X2 })).expect(201);
        expect(db.createdIn("schoolusers")[0]).toMatchObject({ schoolid: S_X2, schoolname: "សាលា គ" });
      });
      it("a platform user who is not acting as an organisation is asked to choose one", async () => {
        const res = await refuses("a platform user not acting", goodBody());
        expect(res.status).toBe(400);
        expect(res.body.errormessage).toBe("Choose an organisation.");
        expect(res.body.fields).toEqual([{ field: "schoolid", message: "Choose an organisation." }]);
      });
    });

    describe("the transaction", () => {
      it("writes the login inside the transaction it commits", async () => {
        const loginWrite = jest.spyOn(schoolusers, "bulkCreate");
        await send("X's Admin", "post", "/teacher/one", goodBody()).expect(201);
        expect(loginWrite).toHaveBeenCalledTimes(1);
        expect((loginWrite.mock.calls[0][1] as { transaction?: unknown }).transaction).toBe(transaction);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
      });
      it("rolls back, and does not commit or push, when the login cannot be written", async () => {
        jest.spyOn(schoolusers, "bulkCreate").mockRejectedValueOnce(new Error("insert failed"));
        const res = await send("X's Admin", "post", "/teacher/one", goodBody());
        expect(res.status).toBe(500);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(axios.put).not.toHaveBeenCalled();
      });
    });

    describe("the push to the student server", () => {
      it("sends only this teacher, as { schoolid, teachers }, with the organisation and a timeout", async () => {
        mockZipEntries.length = 0;
        const res = await send("X's Admin", "post", "/teacher/one", goodBody()).expect(201);
        expect(axios.put).toHaveBeenCalledTimes(1);
        const [url, , options] = (axios.put as jest.Mock).mock.calls[0];
        expect(url).toBe("http://learner-server.invalid/import/teachers");
        expect(options.headers["X-Organisation-Id"]).toBe(X);
        expect(options.timeout).toBe(15_000);
        expect(mockZipEntries).toHaveLength(1);
        expect(mockZipEntries[0].name).toBe("teachers.ini");
        expect(mockZipEntries[0].json.schoolid).toBe(S_X);
        const sent = mockZipEntries[0].json.teachers as Row[];
        expect(sent.map((r) => r.schooluserid)).toEqual([res.body.schooluserid]);
        expect(sent.map((r) => r.schoolusername)).toEqual(["teacher7"]);
        expect(sent[0].schoolid).toBe(S_X);
      });
      it("a refused push leaves the account and says to run Sync Teachers, without the server key", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true, config: { headers: { Authorization: "SECRET-KEY" } } }));
        const res = await send("X's Admin", "post", "/teacher/one", goodBody()).expect(201);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe("The account was saved, but the learning server did not answer. Run Sync Teachers for this school on the Schools screen.");
        expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
        expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
        expect(db.createdIn("schoolusers")).toHaveLength(1);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(JSON.stringify((Logger.error as jest.Mock).mock.calls)).not.toContain("SECRET-KEY");
      });
      it("a 400 naming the school (schoolid or schoolname) says to run Sync Content, then Sync Teachers", async () => {
        for (const field of ["schoolid", "schoolname"]) {
          (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "SERVER-TEXT", fields: [{ field, message: "SERVER-TEXT" }] } } }));
          const res = await send("X's Admin", "post", "/teacher/one", goodBody({ schoolusername: `t${field.slice(-4)}` })).expect(201);
          expect(res.body.push.status).toBe("failed");
          expect(res.body.push.message).toBe("Saved, but the learning server doesn't have this school yet. Run Sync Content, then Sync Teachers for this school.");
          expect(JSON.stringify(res.body)).not.toContain("SERVER-TEXT");
        }
      });
      it("a 400 naming the class keeps the teacher's own failed message", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "SERVER-TEXT", hint: "SERVER-TEXT", fields: [{ field: "standard", message: "SERVER-TEXT" }] } } }));
        const res = await send("X's Admin", "post", "/teacher/one", goodBody()).expect(201);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe("The account was saved, but the learning server did not answer. Run Sync Teachers for this school on the Schools screen.");
        expect(JSON.stringify(res.body)).not.toContain("SERVER-TEXT");
      });
      it("a timed-out push is a failed outcome too", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
        const res = await send("X's Admin", "post", "/teacher/one", goodBody()).expect(201);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.schoolusername).toBe("teacher7");
      });
      it("is skipped when no student server is set up", async () => {
        rpi.cloud = undefined;
        const res = await send("X's Admin", "post", "/teacher/one", goodBody()).expect(201);
        expect(res.body.push).toEqual({ status: "skipped", reason: "nocloud", message: "Added. No learner server is set up here, so nothing was pushed." });
        expect(axios.put).not.toHaveBeenCalled();
        expect(db.createdIn("schoolusers")).toHaveLength(1);
      });
    });
  });
});
