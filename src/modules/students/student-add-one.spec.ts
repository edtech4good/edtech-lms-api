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
import * as publishedContent from "src/business/published-content";
import { StudentController } from "./student.controller";

/**
 * Adding one learner (POST /student/one) and the username check (GET /student/username-available), driven over real HTTP
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
const CUR_X = uuid(301);
const CUR_X2 = uuid(303);
const CUR_Y = uuid(302);
const K_X = uuid(501);
const K_Y = uuid(502);
const K_X2 = uuid(504); // a class of X's second school
const MISSING = uuid(999);
const COUNTRY_X = "កម្ពុជា";
const KHMER_FIRST = "សុខា";
const KHMER_LAST = "ចាន់";
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
  schoolid: S_X,
  standard: K_X,
  curriculumids: [CUR_X],
  studentfirstname: KHMER_FIRST,
  studentlastname: KHMER_LAST,
  schoolusername: "sokha1",
  password: PASSWORD,
  genderid: 2,
  dateofbirth: "2015-03-09",
  ...over,
});

const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("countries", { countryid: C1, countryname: COUNTRY_X, expectedusage: 1 });
  db.add("countries", { countryid: C2, countryname: "Laos", expectedusage: 1 });
  db.add("curriculums", { curriculumid: CUR_X, curriculumname: "ភាសាខ្មែរ ក", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_X2, curriculumname: "ភាសាខ្មែរ គ", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CUR_Y, curriculumname: "ភាសាខ្មែរ ខ", organisationid: Y, curriculumstatus: true });
  db.publish(CUR_X, X);
  db.publish(CUR_X2, X);
  db.publish(CUR_Y, Y);
  db.add("schools", { schoolid: S_X, schoolname: "សាលា ក", organisationid: X, countryid: C1, curriculums: [CUR_X] });
  db.add("schools", { schoolid: S_X2, schoolname: "សាលា គ", organisationid: X, countryid: C1, curriculums: [CUR_X] });
  db.add("schools", { schoolid: S_Y, schoolname: "សាលា ខ", organisationid: Y, countryid: C2, curriculums: [CUR_Y] });
  db.add("standards", { standardid: K_X, standardname: "ថ្នាក់ទី១", schoolid: S_X, schoolname: "សាលា ក" });
  db.add("standards", { standardid: K_Y, standardname: "ថ្នាក់ទី២", schoolid: S_Y, schoolname: "សាលា ខ" });
  db.add("standards", { standardid: K_X2, standardname: "ថ្នាក់ទី៣", schoolid: S_X2, schoolname: "សាលា គ" });
  const login = (id: number, name: string, over: Row = {}) =>
    db.add("schoolusers", { schooluserid: uuid(id), schoolusername: name, schooluserrole: SchoolRole.STUDENT, schoolid: S_X, schoolname: "សាលា ក", schooluserstatus: true, isdisabled: false, schooluserpasswordhash: "hash", ...over });
  login(411, "Taken1");
  login(412, "Gone9", { isdeleted: true });
  login(413, "teacher1", { schooluserrole: SchoolRole.TEACHER });
};

describe("adding one learner", () => {
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
  const refuses = async (who: Who, path: string, body: object) => {
    const before = db.snapshot();
    const res = await send(who, "post", path, body);
    expect(db.snapshot()).toEqual(before);
    expect(axios.put).not.toHaveBeenCalled();
    return res;
  };

  describe("GET /student/username-available", () => {
    it.each(IN_X)("%s: a name nobody has is available", async (who) => {
      const res = await send(who, "get", "/student/username-available?username=fresh7").expect(200);
      expect(res.body).toEqual({ available: true });
    });
    it("a name in use is not available whatever its case", async () => {
      for (const name of ["Taken1", "taken1", "TAKEN1", "teacher1"]) {
        const res = await send("X's Admin", "get", `/student/username-available?username=${name}`).expect(200);
        expect(res.body).toEqual({ available: false });
      }
    });
    it("a name kept by a deleted login is not available", async () => {
      const res = await send("X's Admin", "get", "/student/username-available?username=GONE9").expect(200);
      expect(res.body).toEqual({ available: false });
    });
    it.each(["", "a", "abcdefghijklmnopq", "has space", "dot.name", "សុខា"])("a value that is not a login handle (%j) is a 400 naming username", async (value) => {
      const res = await send("X's Admin", "get", `/student/username-available?username=${encodeURIComponent(value)}`);
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual([{ field: "username", message: "Use 2 to 16 English letters or numbers." }]);
    });
    it("no username, or two, is a 400 naming username", async () => {
      for (const path of ["/student/username-available", "/student/username-available?username=ab&username=cd"]) {
        const res = await send("X's Admin", "get", path);
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "username", message: "Use 2 to 16 English letters or numbers." }]);
      }
    });
    it("the application's server token is refused", async () => {
      const res = await send("a server token", "get", "/student/username-available?username=fresh7");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /student/one", () => {
    it.each(IN_X)("%s: adds the learner, whole answer, and stores the login and the learner", async (who) => {
      const res = await send(who, "post", "/student/one", goodBody()).expect(201);
      expect(res.body).toEqual({
        schooluserid: expect.stringMatching(/^[0-9a-f-]{36}$/),
        schoolusername: "sokha1",
        studentname: `${KHMER_FIRST} ${KHMER_LAST}`,
        push: { status: "pushed", message: "Added. The learner can sign in now." },
      });
      const logins = db.createdIn("schoolusers");
      expect(logins).toHaveLength(1);
      expect(logins[0]).toMatchObject({ schoolusername: "sokha1", schooluserrole: SchoolRole.STUDENT, schooluserstatus: 1, schoolid: S_X, schooluserid: res.body.schooluserid });
      expect(logins[0].schooluserpasswordhash).not.toBe(PASSWORD);
      expect(String(logins[0].schooluserpasswordhash)).toMatch(/^\$2/);
      const learners = db.createdIn("students");
      expect(learners).toHaveLength(1);
      expect(learners[0]).toMatchObject({
        schooluserid: res.body.schooluserid,
        studentfirstname: KHMER_FIRST,
        studentlastname: KHMER_LAST,
        genderid: 2,
        standard: K_X,
        schoolid: S_X,
        curriculumid: CUR_X,
        curriculumids: [CUR_X],
        country: COUNTRY_X,
        city: "",
        state: "",
        type: "online",
        isactive: 1,
        is_teacher_acc: false,
      });
      expect(learners[0].dateofbirth).toEqual(new Date(2015, 2, 9));
      expect(transaction.commit).toHaveBeenCalledTimes(1);
      expect(transaction.rollback).not.toHaveBeenCalled();
    });
    it("the answer holds neither the password nor its hash", async () => {
      const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain("$2");
      expect(Object.keys(res.body).sort()).toEqual(["push", "schoolusername", "schooluserid", "studentname"].sort());
    });
    it("a learner with only the required fields is added, with several curricula in the order given", async () => {
      const body = goodBody({ curriculumids: [CUR_X2, CUR_X, CUR_X2] });
      delete body.studentlastname;
      delete body.dateofbirth;
      const res = await send("X's Admin", "post", "/student/one", body).expect(201);
      expect(res.body.studentname).toBe(KHMER_FIRST);
      expect(db.createdIn("students")[0]).toMatchObject({ curriculumid: CUR_X2, curriculumids: [CUR_X2, CUR_X] });
    });

    describe("validation", () => {
      const cases: Array<[string, Row, Array<{ field: string; message: string }>]> = [
        ["no school", goodBody({ schoolid: undefined }), [{ field: "schoolid", message: "Choose a school." }]],
        ["a school that is not an id", goodBody({ schoolid: "x" }), [{ field: "schoolid", message: "Choose a school." }]],
        ["no class", goodBody({ standard: undefined }), [{ field: "standard", message: "Choose a class for this student." }]],
        ["an empty class", goodBody({ standard: "" }), [{ field: "standard", message: "Choose a class for this student." }]],
        ["no curricula", goodBody({ curriculumids: [] }), [{ field: "curriculumids", message: "Choose at least one curriculum." }]],
        ["curricula that are not a list", goodBody({ curriculumids: CUR_X }), [{ field: "curriculumids", message: "Choose at least one curriculum." }]],
        ["a one-character first name", goodBody({ studentfirstname: "ក" }), [{ field: "studentfirstname", message: "Enter a name of 2 to 45 characters." }]],
        ["a first name of spaces", goodBody({ studentfirstname: "   " }), [{ field: "studentfirstname", message: "Enter a name of 2 to 45 characters." }]],
        ["a first name that is too long", goodBody({ studentfirstname: "ក".repeat(46) }), [{ field: "studentfirstname", message: "Enter a name of 2 to 45 characters." }]],
        ["a last name that is too long", goodBody({ studentlastname: "ក".repeat(46) }), [{ field: "studentlastname", message: "Enter a name of 1 to 45 characters." }]],
        ["a username with a dot", goodBody({ schoolusername: "so.kha" }), [{ field: "schoolusername", message: "Use 2 to 16 English letters or numbers." }]],
        ["a Khmer username", goodBody({ schoolusername: "សុខា" }), [{ field: "schoolusername", message: "Use 2 to 16 English letters or numbers." }]],
        ["a password with no digit", goodBody({ password: "mangotreeabc" }), [{ field: "password", message: "Use 8 to 32 characters with at least one letter and one number, and no spaces." }]],
        ["a password with no letter", goodBody({ password: "12345678" }), [{ field: "password", message: "Use 8 to 32 characters with at least one letter and one number, and no spaces." }]],
        ["a short password", goodBody({ password: "abc123" }), [{ field: "password", message: "Use 8 to 32 characters with at least one letter and one number, and no spaces." }]],
        ["a long password", goodBody({ password: `a1${"b".repeat(31)}` }), [{ field: "password", message: "Use 8 to 32 characters with at least one letter and one number, and no spaces." }]],
        ["a password with a space", goodBody({ password: "mango 2tree" }), [{ field: "password", message: "Use 8 to 32 characters with at least one letter and one number, and no spaces." }]],
        ["a gender of 3", goodBody({ genderid: 3 }), [{ field: "genderid", message: "Choose a gender." }]],
        ["no gender", goodBody({ genderid: undefined }), [{ field: "genderid", message: "Choose a gender." }]],
        ["a date of birth that is not a date", goodBody({ dateofbirth: "2015-02-30" }), [{ field: "dateofbirth", message: "Enter a real date in the past, as YYYY-MM-DD." }]],
        ["a date of birth in the other order", goodBody({ dateofbirth: "09-03-2015" }), [{ field: "dateofbirth", message: "Enter a real date in the past, as YYYY-MM-DD." }]],
        ["a date of birth in the future", goodBody({ dateofbirth: "2999-01-01" }), [{ field: "dateofbirth", message: "Enter a real date in the past, as YYYY-MM-DD." }]],
        [
          "several wrong at once",
          goodBody({ password: "short", genderid: 9 }),
          [
            { field: "password", message: "Use 8 to 32 characters with at least one letter and one number, and no spaces." },
            { field: "genderid", message: "Choose a gender." },
          ],
        ],
      ];
      it.each(cases)("%s is a 400 naming the field, nothing written", async (_name, body, fields) => {
        const res = await refuses("X's Admin", "/student/one", body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        expect(res.body.fields).toEqual(fields);
        expect(transaction.commit).not.toHaveBeenCalled();
      });
      it("a key the body should not have is refused without being echoed", async () => {
        const res = await refuses("X's Admin", "/student/one", goodBody({ isdeleted: true, evilkeyname: 1 }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "body", message: "This request contains a field that isn't allowed." }]);
        expect(JSON.stringify(res.body)).not.toContain("evilkeyname");
      });
      it("a body that is not an object is a 400", async () => {
        const res = await refuses("X's Admin", "/student/one", [goodBody()]);
        expect(res.status).toBe(400);
      });
    });

    describe("the username", () => {
      it.each(["Taken1", "taken1", "TAKEN1", "teacher1"])("%s is taken, in any case, and nothing is written", async (name) => {
        const res = await refuses("X's Admin", "/student/one", goodBody({ schoolusername: name }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "schoolusername", message: "That username is taken." }]);
      });
      it("a name kept by a deleted login is taken", async () => {
        const res = await refuses("X's Admin", "/student/one", goodBody({ schoolusername: "gone9" }));
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "schoolusername", message: "That username is taken." }]);
      });
      it("a name that reaches the unique key first is answered as taken, and rolled back", async () => {
        jest.spyOn(students, "bulkCreate").mockRejectedValueOnce(Object.assign(new Error("x"), { name: "SequelizeUniqueConstraintError" }));
        const res = await send("X's Admin", "post", "/student/one", goodBody());
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([{ field: "schoolusername", message: "That username is taken." }]);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
      });
    });

    describe("whose school and class", () => {
      it.each(IN_X)("%s: another organisation's school is the 404 a missing school gets, nothing written or sent", async (who) => {
        const foreign = await refuses(who, "/student/one", goodBody({ schoolid: S_Y, standard: K_Y, curriculumids: [CUR_Y] }));
        const missing = await refuses(who, "/student/one", goodBody({ schoolid: MISSING }));
        expect(foreign.status).toBe(404);
        expect(said(foreign)).toEqual(said(missing));
      });
      it.each(IN_X)("%s: another organisation's class is the 404 a missing class gets", async (who) => {
        const foreign = await refuses(who, "/student/one", goodBody({ standard: K_Y }));
        const missing = await refuses(who, "/student/one", goodBody({ standard: MISSING }));
        expect(foreign.status).toBe(404);
        expect(said(foreign)).toEqual(said(missing));
      });
      it("a class of another school of the same organisation is a 404", async () => {
        const res = await refuses("X's Admin", "/student/one", goodBody({ standard: K_X2 }));
        expect(res.status).toBe(404);
      });
      it("a curriculum of another organisation is answered exactly as one that does not exist: a 400 naming curriculumids", async () => {
        const foreign = await refuses("X's Admin", "/student/one", goodBody({ curriculumids: [CUR_X, CUR_Y] }));
        expect(foreign.status).toBe(400);
        expect(foreign.body.fields).toEqual([{ field: "curriculumids", message: "Choose curricula that exist." }]);
        const missing = await refuses("X's Admin", "/student/one", goodBody({ curriculumids: [MISSING] }));
        expect(missing.status).toBe(400);
        expect(missing.body.fields).toEqual([{ field: "curriculumids", message: "Choose curricula that exist." }]);
        expect(said(foreign)).toEqual(said(missing));
      });
      it("a platform user who is not acting as an organisation is asked to choose one", async () => {
        const res = await refuses("a platform user not acting", "/student/one", goodBody());
        expect(res.status).toBe(400);
        expect(res.body.errormessage).toBe("Choose an organisation.");
        expect(res.body.fields).toEqual([{ field: "schoolid", message: "Choose an organisation." }]);
      });
      it("the application's server token is refused", async () => {
        const res = await refuses("a server token", "/student/one", goodBody());
        expect(res.status).toBe(401);
      });
    });

    describe("the transaction", () => {
      it("writes the login and the learner inside the transaction it commits", async () => {
        const loginWrite = jest.spyOn(schoolusers, "bulkCreate");
        const learnerWrite = jest.spyOn(students, "bulkCreate");
        await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
        expect(loginWrite).toHaveBeenCalledTimes(1);
        expect(learnerWrite).toHaveBeenCalledTimes(1);
        expect((loginWrite.mock.calls[0][1] as { transaction?: unknown }).transaction).toBe(transaction);
        expect((learnerWrite.mock.calls[0][1] as { transaction?: unknown }).transaction).toBe(transaction);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
      });
      it("rolls back, and does not commit, when the learner row cannot be written", async () => {
        jest.spyOn(students, "bulkCreate").mockRejectedValueOnce(new Error("insert failed"));
        const res = await send("X's Admin", "post", "/student/one", goodBody());
        expect(res.status).toBe(500);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(axios.put).not.toHaveBeenCalled();
      });
    });

    describe("only a published curriculum can be enrolled", () => {
      const NEVER = uuid(901);
      const RETIRED = uuid(902);
      const AGAIN = uuid(903);
      const ruleFor = (name: string) => [{ field: "curriculumids", message: `Publish ${name} first, or choose another curriculum.` }];
      beforeEach(() => {
        db.add("curriculums", { curriculumid: NEVER, curriculumname: "មេរៀនមិនទាន់ផ្សព្វផ្សាយ", organisationid: X, curriculumstatus: true });
        db.add("curriculums", { curriculumid: RETIRED, curriculumname: "មេរៀនដកចេញ", organisationid: X, curriculumstatus: true });
        db.publish(RETIRED, X, "published", new Date(1000));
        db.publish(RETIRED, X, "withdrawn", new Date(2000));
        db.add("curriculums", { curriculumid: AGAIN, curriculumname: "មេរៀនផ្សព្វផ្សាយម្ដងទៀត", organisationid: X, curriculumstatus: true });
        db.publish(AGAIN, X, "published", new Date(1000));
        db.publish(AGAIN, X, "withdrawn", new Date(2000));
        db.publish(AGAIN, X, "published", new Date(3000));
      });
      it.each(IN_X)("%s: a curriculum never published is a 400 on curriculumids naming it, and nothing is written or sent", async (who) => {
        const res = await refuses(who, "/student/one", goodBody({ curriculumids: [NEVER] }));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        expect(res.body.errormessage).toBe("Publish មេរៀនមិនទាន់ផ្សព្វផ្សាយ first, or choose another curriculum.");
        expect(res.body.fields).toEqual(ruleFor("មេរៀនមិនទាន់ផ្សព្វផ្សាយ"));
      });
      it("a curriculum whose latest publication is a retirement is refused the same way, beside a published one too", async () => {
        for (const curriculumids of [[RETIRED], [CUR_X, RETIRED]]) {
          const res = await refuses("X's Admin", "/student/one", goodBody({ curriculumids: curriculumids }));
          expect(res.status).toBe(400);
          expect(res.body.fields).toEqual(ruleFor("មេរៀនដកចេញ"));
        }
      });
      it("a curriculum published again after a retirement is accepted, and so is a published one", async () => {
        for (const curriculumids of [[AGAIN], [CUR_X]]) {
          const res = await send("X's Admin", "post", "/student/one", goodBody({ curriculumids, schoolusername: `pub${(curriculumids as string[]).join("").length}${curriculumids[0] === AGAIN ? "a" : "b"}` }));
          expect(res.status).toBe(201);
          expect(res.body.push.status).toBe("pushed");
        }
      });
    });

    describe("the push to the student server", () => {
      it("sends only this learner's school roster, with the organisation and a timeout", async () => {
        mockZipEntries.length = 0;
        const added = mockZipEntries;
        const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
        expect(axios.put).toHaveBeenCalledTimes(1);
        const [url, , options] = (axios.put as jest.Mock).mock.calls[0];
        expect(url).toBe("http://learner-server.invalid/import/students");
        expect(options.headers["X-Organisation-Id"]).toBe(X);
        expect(options.timeout).toBe(15_000);
        expect(added).toHaveLength(1);
        expect(added[0].name).toBe("students.ini");
        expect(added[0].json.schoolid).toBe(S_X);
        const sent = added[0].json.studentusers as Row[];
        expect(sent.map((r) => r.schooluserid)).toEqual([res.body.schooluserid]);
        expect(sent.map((r) => r.schoolusername)).toEqual(["sokha1"]);
      });
      it("a refused push leaves the account and says to run Sync Students, without the server key", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true, config: { headers: { Authorization: "SECRET-KEY" } } }));
        const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe("The account was saved, but the learning server did not answer. Run Sync Students for this school on the Schools screen.");
        expect(res.body.push).not.toHaveProperty("hint");
        expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
        expect(db.createdIn("schoolusers")).toHaveLength(1);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        const logged = JSON.stringify((Logger.error as jest.Mock).mock.calls);
        expect(logged).not.toContain("SECRET-KEY");
      });
      it("the student server refusing the school, the class or the curriculum (400) says to run Sync Content first, then Sync Students", async () => {
        for (const field of ["schoolid", "schoolname", "standard", "curriculumid", "curriculumids"]) {
          (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "SERVER-TEXT", hint: "SERVER-TEXT", fields: [{ field, message: "SERVER-TEXT" }] } }, config: { headers: { Authorization: "SECRET-KEY" } } }));
          const res = await send("X's Admin", "post", "/student/one", goodBody({ schoolusername: `u${field.slice(-3)}${field.length}` })).expect(201);
          expect(res.body.push.status).toBe("failed");
          expect(res.body.push.message).toBe("Saved, but the learning server doesn't have this school, class or curriculum yet. Run Sync Content, then Sync Students for this school.");
          expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
          expect(JSON.stringify(res.body)).not.toContain("SERVER-TEXT");
          expect(db.createdIn("schoolusers").length).toBeGreaterThan(0);
        }
      });
      it("logs the learning server's own status, code and refused fields, not a mapped one, and logs a timeout as no answer", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { code: "INVALID_INPUT", errormessage: "SERVER-TEXT", fields: [{ field: "schoolid", message: "SERVER-TEXT" }] } } }));
        await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
        const call = (Logger.error as jest.Mock).mock.calls.find((c) => String(c[0]).includes("new learner"));
        expect(call[1]).toMatchObject({ status: 400, learnerserverstatus: 400, learnerservercode: "INVALID_INPUT", learnerserverfields: ["schoolid"] });
        expect(JSON.stringify(call)).not.toContain("SERVER-TEXT");
        (Logger.error as jest.Mock).mockClear();
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
        await send("X's Admin", "post", "/student/one", goodBody({ schoolusername: "sokha9" })).expect(201);
        const timed = (Logger.error as jest.Mock).mock.calls.find((c) => String(c[0]).includes("new learner"));
        expect(timed[1].status).toBe(503);
        expect(timed[1]).not.toHaveProperty("learnerserverstatus");
      });
      it("another 400 from the student server keeps the Sync Students message", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "x", fields: [{ field: "genderid", message: "x" }] } } }));
        const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toContain("Run Sync Students for this school on the Schools screen.");
        expect(res.body.push.message).not.toContain("Sync Content");
      });
      it("a timed-out push is a failed outcome too", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
        const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.schoolusername).toBe("sokha1");
      });
      describe("a school or class the learning server lacks is sent once, then the learner again", () => {
        const refusal = (field: string) =>
          Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "SERVER-TEXT", fields: [{ field, message: "SERVER-TEXT" }] } } });
        // what each PUT went to, in order: students, master (the organisation's set), students again
        const kinds = () => (axios.put as jest.Mock).mock.calls.map((c) => String(c[0]).split("/import/")[1]);
        const answers = (...steps: Array<"ok" | Error>) => {
          const queue = [...steps];
          (axios.put as jest.Mock).mockReset().mockImplementation(async () => {
            const next = queue.shift() ?? "ok";
            if (next instanceof Error) throw next;
            return { status: 200, data: {} };
          });
        };
        beforeEach(() => {
          jest.spyOn(publishedContent, "buildPublishedOrganisationContent").mockResolvedValue({ organisationid: X } as never);
        });
        it.each(["schoolid", "schoolname", "standard"])("a refusal naming %s: the organisation's set goes first, then the learner, and the answer is the usual success", async (field) => {
          answers(refusal(field), "ok", "ok");
          const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
          expect(kinds()).toEqual(["students", "master", "students"]);
          expect((axios.put as jest.Mock).mock.calls[1][2].headers["X-Organisation-Id"]).toBe(X);
          expect(res.body.push).toEqual({ status: "pushed", message: "Added. The learner can sign in now." });
          expect(db.createdIn("schoolusers")).toHaveLength(1);
        });
        it("a second refusal says the learning server lacks the school, class or curriculum; the set is not sent a second time", async () => {
          answers(refusal("schoolid"), "ok", refusal("standard"));
          const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
          expect(kinds()).toEqual(["students", "master", "students"]);
          expect(res.body.push.status).toBe("failed");
          expect(res.body.push.message).toBe("Saved, but the learning server doesn't have this school, class or curriculum yet. Run Sync Content, then Sync Students for this school.");
          expect(JSON.stringify(res.body)).not.toContain("SERVER-TEXT");
        });
        it("a refusal naming the curriculum is not healed: nothing is sent but the learner", async () => {
          for (const field of ["curriculumids", "curriculumid"]) {
            answers(refusal(field));
            const res = await send("X's Admin", "post", "/student/one", goodBody({ schoolusername: `cur${field.length}` })).expect(201);
            expect(kinds()).toEqual(["students"]);
            expect(res.body.push.message).toContain("doesn't have this school, class or curriculum yet");
          }
        });
        it("when the set cannot be sent the learner is not sent again, and the words are the missing-refs ones", async () => {
          answers(refusal("schoolid"), Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true }));
          const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
          expect(kinds()).toEqual(["students", "master"]);
          expect(res.body.push.status).toBe("failed");
          expect(res.body.push.message).toContain("doesn't have this school, class or curriculum yet");
        });
        it("when the second try gets no answer the words are the learning server did not answer", async () => {
          answers(refusal("schoolid"), "ok", Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
          const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
          expect(res.body.push.message).toBe("The account was saved, but the learning server did not answer. Run Sync Students for this school on the Schools screen.");
        });
        it("a refusal that names another field is not healed", async () => {
          answers(refusal("genderid"));
          await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
          expect(kinds()).toEqual(["students"]);
        });
        it("both tries are logged, with the fields the learning server named and never its text", async () => {
          answers(refusal("schoolid"), "ok", "ok");
          jest.spyOn(Logger, "info").mockImplementation(() => Logger);
          await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
          const logged = (Logger.info as jest.Mock).mock.calls;
          expect(logged.some((c) => String(c[0]).includes("lacks the school or class") && JSON.stringify(c[1]).includes("schoolid"))).toBe(true);
          expect(logged.some((c) => String(c[0]).includes("went through after"))).toBe(true);
          expect(JSON.stringify(logged)).not.toContain("SERVER-TEXT");
        });
      });
      it("is skipped when no student server is set up", async () => {
        rpi.cloud = undefined;
        const res = await send("X's Admin", "post", "/student/one", goodBody()).expect(201);
        expect(res.body.push).toEqual({ status: "skipped", reason: "nocloud", message: "Added. No learner server is set up here, so nothing was pushed." });
        expect(axios.put).not.toHaveBeenCalled();
        expect(db.createdIn("schoolusers")).toHaveLength(1);
      });
    });

    describe("the username check's rate limit", () => {
      let limited: INestApplication;
      beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
          imports: [ThrottlerModule.forRoot({ ttl: 60, limit: 1000 })],
          controllers: [StudentController],
          providers: [JwtAccessStrategy],
        }).compile();
        limited = moduleRef.createNestApplication();
        limited.useGlobalFilters(new GlobalExceptionFilter());
        await limited.listen(0);
      });
      afterEach(async () => limited.close());
      const check = (token?: string) => {
        const r = request(limited.getHttpServer()).get("/student/username-available?username=fresh7").set("Connection", "close");
        return token ? r.set("Authorization", token) : r;
      };

      it("allows 60 checks a minute and refuses the 61st with 429", async () => {
        for (let i = 0; i < 60; i++) {
          await check(callers["X's Admin"]).expect(200);
        }
        const res = await check(callers["X's Admin"]).expect(429);
        expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
      });
      it("requests refused by authentication do not use up the allowance", async () => {
        for (let i = 0; i < 70; i++) {
          await check().expect(401);
        }
        await check(callers["X's Admin"]).expect(200);
      });
    });
  });
});
