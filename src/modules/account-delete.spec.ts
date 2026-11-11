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
import * as rowOwner from "src/business/row-owner";
import { ContentFake } from "src/test-support/content-fake";
import { StudentController } from "./students/student.controller";
import { TeacherController } from "./teachers/teacher.controller";

/**
 * Deleting one learner (DELETE /student/:schooluserid) or one teacher (DELETE /teacher/:schooluserid) and sending that one
 * account to the student server, driven over real HTTP through the real strategy, guards, controllers and business classes. Replaced are the models (an
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
  "an Admin without the delete permissions": bearer({ lmsuserid: "np", lmsuserroles: [Role.admin], permissions: PERMS.filter((p) => !/^delete_(student|teacher)$/.test(p)), organisationid: X, isplatform: false }),
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
  { kind: "learner", route: "student", own: L_X, other: L_X_OTHER, secondSchool: L_X2, foreign: L_Y, gone: L_GONE, file: "students.ini", rows: "studentusers", sync: "Sync Students" },
  { kind: "teacher", route: "teacher", own: T_X, other: T_X_OTHER, secondSchool: undefined, foreign: T_Y, gone: T_GONE, file: "teachers.ini", rows: "teachers", sync: "Sync Teachers" },
] as const;

const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("countries", { countryid: C1, countryname: "កម្ពុជា", expectedusage: 1 });
  db.add("schools", { schoolid: S_X, schoolname: "សាលា ក", organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_X2, schoolname: "សាលា គ", organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_Y, schoolname: "សាលា ខ", organisationid: Y, countryid: C1, curriculums: [] });
  const login = (id: string, name: string, role: SchoolRole, school: string, over: Row = {}) =>
    db.add("schoolusers", { schooluserid: id, schoolusername: name, schooluserrole: role, schoolid: school, schoolname: "x", schooluserstatus: true, isdisabled: false, isdeleted: false, schooluserpasswordhash: "hash", ...over });
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

describe("deleting one learner or teacher", () => {
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

  // the order in which the commit and the push happen
  const order: string[] = [];

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(Logger, "error").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    tokenExists.mockResolvedValue(true);
    order.length = 0;
    transaction.commit.mockReset().mockImplementation(async () => {
      order.push("commit");
    });
    transaction.rollback.mockReset();
    mockZipEntries.length = 0;
    db.install();
    seed();
    rpi.cloud = "http://learner-server.invalid";
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    (axios.put as jest.Mock).mockReset().mockImplementation(async () => {
      order.push("push");
      return { status: 200, data: {} };
    });
  });

  const del = (who: Who, route: string, id: string) =>
    request(app.getHttpServer()).delete(`/${route}/${id}`).set("Authorization", callers[who]).set("Connection", "close");
  const login = (id: string) => db.tables.schoolusers.find((r) => r.schooluserid === id)!;
  const learnerRow = (id: string) => db.tables.students.find((r) => r.schooluserid === id)!;
  const refuses = async (who: Who, route: string, id: string) => {
    const before = db.snapshot();
    const res = await del(who, route, id);
    expect(db.snapshot()).toEqual(before);
    expect(axios.put).not.toHaveBeenCalled();
    return res;
  };

  describe.each(KINDS)("DELETE /$route/:schooluserid ($kind)", ({ kind, route, own, other, secondSchool, foreign, gone, file, rows, sync }) => {
    it.each(IN_X)("%s: deletes the account and answers with the outcome of the push", async (who) => {
      const res = await del(who, route, own).expect(200);
      expect(res.body).toEqual({ error: false, data: true, push: { status: "pushed", message: `Deleted. The ${kind} can no longer sign in.` } });
      expect(login(own).isdeleted).toBe(true);
      expect(login(own).deleted_by).toBe(who === "X's Organisation Admin" ? "oa" : who === "X's Admin" ? "ad" : "p");
      if (kind === "learner") expect(learnerRow(own).isdeleted).toBe(true);
      expect(login(other).isdeleted).toBe(false);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    describe("whose account", () => {
      it.each(IN_X)("%s: another organisation's account is the 404 an account that is not there gets, nothing written or sent", async (who) => {
        const other404 = await refuses(who, route, foreign);
        const missing = await refuses(who, route, MISSING);
        expect(other404.status).toBe(404);
        expect(said(other404)).toEqual(said(missing));
      });
      it.each(IN_X)("%s: an account that was already deleted is a 404, nothing written or sent", async (who) => {
        const res = await refuses(who, route, gone);
        expect(res.status).toBe(404);
      });
      it("deleting the same account twice: the second call is a 404 and sends nothing", async () => {
        await del("X's Admin", route, own).expect(200);
        expect(axios.put).toHaveBeenCalledTimes(1);
        (axios.put as jest.Mock).mockClear();
        const res = await del("X's Admin", route, own);
        expect(res.status).toBe(404);
        expect(axios.put).not.toHaveBeenCalled();
      });
      it("an Admin without the delete permission is refused (403), nothing written or sent", async () => {
        const res = await refuses("an Admin without the delete permissions", route, own);
        expect(res.status).toBe(403);
      });
      it("a server token is refused (401), nothing written or sent", async () => {
        const res = await refuses("a server token", route, own);
        expect(res.status).toBe(401);
      });
      it("a platform user not acting as an organisation can still delete, and the push goes out under the account's own organisation", async () => {
        await del("a platform user not acting", route, foreign).expect(200);
        expect(login(foreign).isdeleted).toBe(true);
        expect(axios.put).toHaveBeenCalledTimes(1);
        expect((axios.put as jest.Mock).mock.calls[0][2].headers["X-Organisation-Id"]).toBe(Y);
        expect(mockZipEntries[0].json.schoolid).toBe(S_Y);
      });
    });

    describe("the transaction", () => {
      it("rolls back, and does not commit or push, when the write fails", async () => {
        const { schoolusers } = await import("src/models/data-models/schoolusers");
        jest.spyOn(schoolusers, "update").mockRejectedValueOnce(new Error("update failed"));
        const res = await del("X's Admin", route, own);
        expect(res.status).toBe(500);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(axios.put).not.toHaveBeenCalled();
      });
      it("does not push when the commit fails", async () => {
        transaction.commit.mockRejectedValueOnce(new Error("commit failed"));
        const res = await del("X's Admin", route, own);
        expect(res.status).toBe(500);
        expect(axios.put).not.toHaveBeenCalled();
      });
    });

    describe("the push to the student server", () => {
      it("happens after the commit, once", async () => {
        await del("X's Admin", route, own).expect(200);
        expect(order).toEqual(["commit", "push"]);
      });
      it("sends only this account, flagged deleted, with the organisation and a timeout", async () => {
        await del("X's Admin", route, own).expect(200);
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
        expect(sent[0].isdeleted).toBe(true);
        if (kind === "learner") expect((sent[0].student as Row | undefined)?.isdeleted ?? (sent[0].students as Row | undefined)?.isdeleted).toBe(true);
        expect(JSON.stringify(mockZipEntries[0].json)).not.toContain(login(other).schoolusername as string);
      });
      it("an account of the organisation's second school is pushed under that school", async () => {
        if (!secondSchool) return;
        await del("X's Admin", route, secondSchool).expect(200);
        expect(mockZipEntries[0].json.schoolid).toBe(S_X2);
        expect((mockZipEntries[0].json[rows] as Row[]).map((r) => r.schooluserid)).toEqual([secondSchool]);
      });
      it("with no learner server set up, the delete stands and nothing is sent", async () => {
        rpi.cloud = undefined;
        const res = await del("X's Admin", route, own).expect(200);
        expect(res.body.data).toBe(true);
        expect(res.body.push).toEqual({ status: "skipped", reason: "nocloud", message: "Deleted. No learner server is set up here, so nothing was pushed." });
        expect(login(own).isdeleted).toBe(true);
        expect(axios.put).not.toHaveBeenCalled();
      });
      it("a refused push keeps the delete and says to run the sync, without the server key", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true, config: { headers: { Authorization: "SECRET-KEY" } } }));
        const res = await del("X's Admin", route, own).expect(200);
        expect(res.body.error).toBe(false);
        expect(res.body.data).toBe(true);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe(`Deleted, but the learning server did not answer. Run ${sync} for this school on the Schools screen.`);
        expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
        expect(JSON.stringify((Logger.error as jest.Mock).mock.calls)).not.toContain("SECRET-KEY");
        expect(login(own).isdeleted).toBe(true);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
      });
      it("a timed-out push is a failed outcome too", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
        const res = await del("X's Admin", route, own).expect(200);
        expect(res.body.push.status).toBe("failed");
        expect(login(own).isdeleted).toBe(true);
      });
      it("a 400 naming the class gives a learner the Sync Content message (the account is deleted, not saved) and a teacher the school-only Sync Teachers one", async () => {
        (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { fields: [{ field: "schoolid", message: "SERVER-TEXT" }] } } }));
        const res = await del("X's Admin", route, own).expect(200);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe(
          kind === "learner"
            ? "Deleted, but the learning server doesn't have this school, class or curriculum yet, so the learner can still sign in there. Run Sync Content, then Sync Students for this school."
            : "Deleted, but the learning server doesn't have this school yet, so the teacher can still sign in there. Run Sync Content, then Sync Teachers for this school.",
        );
        expect(JSON.stringify(res.body)).not.toContain("SERVER-TEXT");
        expect(login(own).isdeleted).toBe(true);
      });
    });

    describe("the owner of the school", () => {
      it("is read after the commit, not inside the delete's transaction", async () => {
        const real = jest.requireActual("src/business/row-owner").ownersOfSchools;
        jest.spyOn(rowOwner, "ownersOfSchools").mockImplementation(async (...args: Parameters<typeof real>) => {
          order.push("owners");
          return real(...args);
        });
        await del("X's Admin", route, own).expect(200);
        expect(order).toEqual(["commit", "owners", "push"]);
        expect((axios.put as jest.Mock).mock.calls[0][2].headers["X-Organisation-Id"]).toBe(X);
      });
      it("a failed read leaves the delete standing and answers 200 with a failed push, nothing sent", async () => {
        jest.spyOn(rowOwner, "ownersOfSchools").mockRejectedValue(new Error("owner read failed"));
        const res = await del("X's Admin", route, own).expect(200);
        expect(res.body.error).toBe(false);
        expect(res.body.data).toBe(true);
        expect(res.body.push.status).toBe("failed");
        expect(res.body.push.message).toBe(`Deleted, but the learning server did not answer. Run ${sync} for this school on the Schools screen.`);
        expect(login(own).isdeleted).toBe(true);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
        expect(axios.put).not.toHaveBeenCalled();
      });
    });
  });

  describe("a login of the other kind", () => {
    it("DELETE /teacher/:id on a learner's login is the 404 of an account that is not there, nothing written or sent", async () => {
      const res = await refuses("X's Admin", "teacher", L_X);
      expect(res.status).toBe(404);
      expect(login(L_X).isdeleted).toBe(false);
    });
    it("DELETE /student/:id on a teacher's login that has a learner row deletes both, and pushes it as a learner", async () => {
      const res = await del("X's Admin", "student", T_STU).expect(200);
      expect(res.body.push).toEqual({ status: "pushed", message: "Deleted. The learner can no longer sign in." });
      expect(login(T_STU).isdeleted).toBe(true);
      expect(learnerRow(T_STU).isdeleted).toBe(true);
      expect(mockZipEntries.map((e) => e.name)).toEqual(["students.ini"]);
      expect((mockZipEntries[0].json.studentusers as Row[]).map((r) => r.schooluserid)).toEqual([T_STU]);
    });
  });
});
