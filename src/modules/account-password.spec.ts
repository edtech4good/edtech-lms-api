import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
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
import { hashPassword, verifyPassword } from "src/services/password.service";
import { ContentFake } from "src/test-support/content-fake";
import { StudentController } from "./students/student.controller";
import { TeacherController } from "./teachers/teacher.controller";

/**
 * Resetting the password of one learner (PUT /student/:schooluserid/password) or one teacher (PUT /teacher/:schooluserid/password),
 * driven over real HTTP through the real strategy, guards, controllers and business classes. Replaced are the models (an
 * in-memory copy of the tables), the token lookup, the transaction and the student server (axios).
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
const S_X2 = uuid(204);
const L_X = uuid(411); // a learner's login in X's school
const L_X_OTHER = uuid(414); // a second learner of the same school
const L_X2 = uuid(415); // a learner of X's second school
const L_Y = uuid(412);
const L_GONE = uuid(416); // a learner removed from the roster
const T_X = uuid(421);
const T_X_OTHER = uuid(424);
const T_Y = uuid(422);
const T_GONE = uuid(426);
const T_STU = uuid(431); // a teacher login that also has a live learner row
const MISSING = uuid(999);

const OLD = "Oldpass123";
const NEW = "Newpass456";
const OLD_HASH = hashPassword(OLD);

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
  "an Admin without the update permissions": bearer({ lmsuserid: "np", lmsuserroles: [Role.admin], permissions: PERMS.filter((p) => !/^update_(student|teacher)$/.test(p)), organisationid: X, isplatform: false }),
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

const KINDS = [
  { kind: "learner", route: "student", own: L_X, other: L_X_OTHER, secondSchool: L_X2, foreign: L_Y, gone: L_GONE, wrongKind: T_X, file: "students.ini", rows: "studentusers", sync: "Sync Students" },
  { kind: "teacher", route: "teacher", own: T_X, other: T_X_OTHER, secondSchool: undefined, foreign: T_Y, gone: T_GONE, wrongKind: L_X, file: "teachers.ini", rows: "teachers", sync: "Sync Teachers" },
] as const;

const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("countries", { countryid: C1, countryname: "កម្ពុជា", expectedusage: 1 });
  db.add("schools", { schoolid: S_X, schoolname: "សាលា ក", organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_X2, schoolname: "សាលា គ", organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_Y, schoolname: "សាលា ខ", organisationid: Y, countryid: C1, curriculums: [] });
  const login = (id: string, name: string, role: SchoolRole, school: string, over: Row = {}) =>
    db.add("schoolusers", { schooluserid: id, schoolusername: name, schooluserrole: role, schoolid: school, schoolname: "x", schooluserstatus: true, isdisabled: false, isdeleted: false, schooluserpasswordhash: OLD_HASH, ...over });
  const learner = (n: number, id: string, school: string, over: Row = {}) =>
    db.add("students", { studentid: uuid(n), schooluserid: id, schoolid: school, schoolname: "x", studentfirstname: "សុខា", studentlastname: "ចាន់", standard: "k", curriculumid: "c", curriculumids: ["c"], genderid: 1, isactive: 1, is_teacher_acc: false, type: "online", isdeleted: false, ...over });
  login(L_X, "learnerx", SchoolRole.STUDENT, S_X);
  login(L_X_OTHER, "learnerx2", SchoolRole.STUDENT, S_X);
  login(L_X2, "learnerx3", SchoolRole.STUDENT, S_X2);
  login(L_Y, "learnery", SchoolRole.STUDENT, S_Y);
  login(L_GONE, "learnergone", SchoolRole.STUDENT, S_X, { isdeleted: true });
  learner(401, L_X, S_X);
  learner(402, L_X_OTHER, S_X);
  learner(403, L_X2, S_X2);
  learner(404, L_Y, S_Y);
  learner(405, L_GONE, S_X, { isdeleted: true });
  login(T_X, "teacherx", SchoolRole.TEACHER, S_X);
  login(T_X_OTHER, "teacherx2", SchoolRole.TEACHER, S_X);
  login(T_Y, "teachery", SchoolRole.TEACHER, S_Y);
  login(T_GONE, "teachergone", SchoolRole.TEACHER, S_X, { isdeleted: true });
  login(T_STU, "teacherstu", SchoolRole.TEACHER, S_X);
  learner(406, T_STU, S_X);
};

describe("resetting the password of one learner or teacher", () => {
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
  });

  const put = (who: Who, route: string, id: string, body?: unknown) => {
    const r = request(app.getHttpServer()).put(`/${route}/${id}/password`).set("Authorization", callers[who]).set("Connection", "close");
    return body === undefined ? r : r.send(body as object);
  };
  const login = (id: string) => db.tables.schoolusers.find((r) => r.schooluserid === id)! as Row & { schooluserpasswordhash: string };
  const refuses = async (who: Who, route: string, id: string, body?: unknown) => {
    const before = db.snapshot();
    const res = await put(who, route, id, body ?? { password: NEW });
    expect(db.snapshot()).toEqual(before);
    expect(axios.put).not.toHaveBeenCalled();
    return res;
  };
  const everythingLogged = () =>
    JSON.stringify([...(Logger.error as jest.Mock).mock.calls, ...(Logger.warn as jest.Mock).mock.calls, ...(Logger.info as jest.Mock).mock.calls, ...(Logger.debug as jest.Mock).mock.calls, ...logged.map((l) => l.mock.calls)]);

  describe.each(KINDS)("PUT /$route/:schooluserid/password ($kind)", ({ kind, route, own, other, secondSchool, foreign, gone, wrongKind, file, rows, sync }) => {
    it.each(IN_X)("%s: stores the new password, whole answer, and no other login changes", async (who) => {
      const res = await put(who, route, own, { password: NEW }).expect(200);
      expect(res.body).toEqual({
        schooluserid: own,
        schoolusername: login(own).schoolusername,
        push: { status: "pushed", message: `Password changed. The ${kind} signs in with the new password.` },
      });
      expect(verifyPassword(NEW, login(own).schooluserpasswordhash)).toBe(true);
      expect(verifyPassword(OLD, login(own).schooluserpasswordhash)).toBe(false);
      expect(login(own).schooluserpasswordhash).not.toContain(NEW);
      expect(login(own).updated_by).toBe(who === "X's Organisation Admin" ? "oa" : who === "X's Admin" ? "ad" : "p");
      expect(login(own).isdeleted).toBe(false);
      expect(login(other).schooluserpasswordhash).toBe(OLD_HASH);
      expect(db.tables.schoolusers.filter((r) => r.schooluserpasswordhash !== OLD_HASH).map((r) => r.schooluserid)).toEqual([own]);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });
    it("a disabled account can have its password reset, and stays disabled", async () => {
      login(own).isdisabled = true;
      await put("X's Admin", route, own, { password: NEW }).expect(200);
      expect(verifyPassword(NEW, login(own).schooluserpasswordhash)).toBe(true);
      expect(login(own).isdisabled).toBe(true);
    });
    it("hashes the way an account made by the add form is hashed (bcrypt over the md5 of the password)", async () => {
      await put("X's Admin", route, own, { password: NEW }).expect(200);
      expect(login(own).schooluserpasswordhash).toMatch(/^\$2[aby]\$10\$/);
      expect(verifyPassword(NEW, login(own).schooluserpasswordhash)).toBe(true);
    });
    it("the answer and everything logged hold neither the password nor a hash", async () => {
      const res = await put("X's Admin", route, own, { password: NEW }).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(["push", "schooluserid", "schoolusername"]);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(NEW);
      expect(text).not.toContain("hash");
      expect(text).not.toContain(login(own).schooluserpasswordhash);
      expect(everythingLogged()).not.toContain(NEW);
      expect(everythingLogged()).not.toContain(login(own).schooluserpasswordhash);
    });

    describe("whose account", () => {
      it.each(IN_X)("%s: another organisation's account is the 404 an account that is not there gets, nothing written or sent", async (who) => {
        const other404 = await refuses(who, route, foreign);
        const missing = await refuses(who, route, MISSING);
        expect(other404.status).toBe(404);
        expect(said(other404)).toEqual(said(missing));
      });
      it.each(IN_X)("%s: an account of the other kind is the same 404", async (who) => {
        const wrong = await refuses(who, route, wrongKind);
        const missing = await refuses(who, route, MISSING);
        expect(wrong.status).toBe(404);
        expect(said(wrong)).toEqual(said(missing));
      });
      it("an account that was deleted is the same 404", async () => {
        const res = await refuses("X's Admin", route, gone);
        expect(res.status).toBe(404);
        expect(said(res)).toEqual(said(await refuses("X's Admin", route, MISSING)));
      });
      it("a platform user not acting is asked to choose an organisation, and nothing is written", async () => {
        const res = await refuses("a platform user not acting", route, own);
        expect(res.status).toBe(400);
        expect(res.body.errormessage).toBe("Choose an organisation.");
      });
      it("a server token is refused (401)", async () => {
        const res = await refuses("a server token", route, own);
        expect(res.status).toBe(401);
      });
      it("an Admin without the update permission is refused (403), nothing written", async () => {
        const res = await refuses("an Admin without the update permissions", route, own);
        expect(res.status).toBe(403);
      });
    });

    describe("a teacher login that has a live learner row", () => {
      it("is the same 404 on the learner route, and nothing is written or sent", async () => {
        if (route !== "student") return;
        const res = await refuses("X's Admin", route, T_STU);
        expect(res.status).toBe(404);
        expect(said(res)).toEqual(said(await refuses("X's Admin", route, MISSING)));
        expect(verifyPassword(OLD, login(T_STU).schooluserpasswordhash)).toBe(true);
      });
    });

    describe("the body", () => {
      const RULE = [{ field: "password", message: "Use 8 to 32 characters with at least one letter and one number, and no spaces." }];
      const cases: Array<[string, unknown, Array<{ field: string; message: string }>]> = [
        ["no password", {}, RULE],
        ["a number", { password: 12345678 }, RULE],
        ["null", { password: null }, RULE],
        ["7 characters", { password: "Abcde12" }, RULE],
        ["33 characters", { password: "Abcdefghijklmnopqrstuvwxyz1234567" }, RULE],
        ["no digit", { password: "Abcdefghij" }, RULE],
        ["no letter", { password: "12345678" }, RULE],
        ["a space inside", { password: "Abcd 1234" }, RULE],
        ["a tab inside", { password: "Abcd\t1234" }, RULE],
        ["another key beside it", { password: NEW, isdisabled: true }, [{ field: "body", message: "This request contains a field that isn't allowed." }]],
        ["another key alone", { isdisabled: true }, [{ field: "body", message: "This request contains a field that isn't allowed." }, ...RULE]],
        ["a list", [NEW], [{ field: "body", message: "Send the new password as an object." }]],
      ];
      it.each(cases)("%s is a 400 INVALID_INPUT naming the field, nothing written or sent", async (_name, body, fields) => {
        const res = await refuses("X's Admin", route, own, body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
        expect(res.body.fields).toEqual(fields);
        expect(transaction.commit).not.toHaveBeenCalled();
      });
      it("8 and 32 characters with a letter and a digit are accepted", async () => {
        await put("X's Admin", route, own, { password: "Abcdef12" }).expect(200);
        await put("X's Admin", route, own, { password: "Abcdefghijklmnopqrstuvwxyz123456" }).expect(200);
      });
      it("a rejected body does not echo the password or an unknown key", async () => {
        const res = await refuses("X's Admin", route, own, { password: "short1", evilkeyname: 1 });
        expect(JSON.stringify(res.body)).not.toContain("short1");
        expect(JSON.stringify(res.body)).not.toContain("evilkeyname");
      });
    });

    describe("the transaction", () => {
      it("rolls back, and does not commit or push, when the write fails", async () => {
        const { schoolusers } = await import("src/models/data-models/schoolusers");
        jest.spyOn(schoolusers, "update").mockRejectedValueOnce(new Error("update failed"));
        const res = await put("X's Admin", route, own, { password: NEW });
        expect(res.status).toBe(500);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(axios.put).not.toHaveBeenCalled();
        expect(verifyPassword(OLD, login(own).schooluserpasswordhash)).toBe(true);
      });
    });

    describe("the push to the student server", () => {
      it("sends only this account, with its new hash, the organisation and a timeout", async () => {
        await put("X's Admin", route, own, { password: NEW }).expect(200);
        expect(axios.put).toHaveBeenCalledTimes(1);
        const [url, , options] = (axios.put as jest.Mock).mock.calls[0];
        expect(url).toBe(`http://learner-server.invalid/import/${route === "student" ? "students" : "teachers"}`);
        expect(options.headers["X-Organisation-Id"]).toBe(X);
        expect(options.timeout).toBe(15_000);
        expect(mockZipEntries).toHaveLength(1);
        expect(mockZipEntries[0].name).toBe(file);
        expect(mockZipEntries[0].json.schoolid).toBe(S_X);
        const sent = mockZipEntries[0].json[rows] as Row[];
        expect(sent.map((r) => r.schooluserid)).toEqual([own]);
        expect(verifyPassword(NEW, JSON.stringify(sent[0]).match(/\$2[aby]\$10\$[./A-Za-z0-9]{53}/)![0])).toBe(true);
      });
      it("an account of the organisation's second school is pushed under that school", async () => {
        if (!secondSchool) return;
        await put("X's Admin", route, secondSchool, { password: NEW }).expect(200);
        expect(mockZipEntries[0].json.schoolid).toBe(S_X2);
        expect((mockZipEntries[0].json[rows] as Row[]).map((r) => r.schooluserid)).toEqual([secondSchool]);
      });
      it("a refused push keeps the change and says to run the sync, without the server key, the password or the hash", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true, config: { headers: { Authorization: "SECRET-KEY" } } }));
        const res = await put("X's Admin", route, own, { password: NEW }).expect(200);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe(`The password was saved, but the learning server did not answer. Run ${sync} for this school on the Schools screen.`);
        expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
        expect(JSON.stringify(res.body)).not.toContain(NEW);
        expect(Logger.error as jest.Mock).toHaveBeenCalled();
        expect(everythingLogged()).not.toContain("SECRET-KEY");
        expect(everythingLogged()).not.toContain(NEW);
        expect(everythingLogged()).not.toContain(login(own).schooluserpasswordhash);
        expect(verifyPassword(NEW, login(own).schooluserpasswordhash)).toBe(true);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
      });
      it("a 400 naming the class gives a learner the Sync Content message and a teacher the Sync Teachers one", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { errormessage: "SERVER-TEXT", hint: "SERVER-TEXT", fields: [{ field: "schoolid", message: "SERVER-TEXT" }] } } }));
        const res = await put("X's Admin", route, own, { password: NEW }).expect(200);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe(
          kind === "learner"
            ? "Saved, but the learning server doesn't have this school, class or curriculum yet. Run Sync Content, then Sync Students for this school."
            : `The password was saved, but the learning server did not answer. Run ${sync} for this school on the Schools screen.`,
        );
        expect(JSON.stringify(res.body)).not.toContain("SERVER-TEXT");
      });
      it("a timed-out push is a failed outcome too", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
        const res = await put("X's Admin", route, own, { password: NEW }).expect(200);
        expect(res.body.push.status).toBe("failed");
      });
      it("is skipped when no student server is set up", async () => {
        rpi.cloud = undefined;
        const res = await put("X's Admin", route, own, { password: NEW }).expect(200);
        expect(res.body.push).toEqual({ status: "skipped", reason: "nocloud", message: "Saved. No learner server is set up here, so nothing was pushed." });
        expect(axios.put).not.toHaveBeenCalled();
        expect(verifyPassword(NEW, login(own).schooluserpasswordhash)).toBe(true);
      });
    });
  });
});
