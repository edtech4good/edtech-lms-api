import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import axios from "axios";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { CENTRAL_ACTIVITY } from "src/business/remove-learner";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { schoolusers } from "src/models/data-models/schoolusers";
import { tokens } from "src/models/data-models/tokens";
import { Role } from "src/models/enums";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake, ContentTable } from "src/test-support/content-fake";
import { StudentController } from "./students/student.controller";

/**
 * Removing a learner who has never signed in (POST /student/:schooluserid/remove), driven over real HTTP through the real
 * strategy, guards, controller and business classes. Replaced are the models (an in-memory copy of the tables), the token
 * lookup, the transaction and the learning server (axios).
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = uuid(101);
const S_X = uuid(201);
const S_Y = uuid(202);
const L_X = uuid(411); // the learner to remove
const L_X_OTHER = uuid(414); // a second learner of the same school
const L_Y = uuid(412);
const L_GONE = uuid(416);
const T_X = uuid(421);
const STU_X = uuid(401);
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
  "an Admin without the delete permission": bearer({ lmsuserid: "np", lmsuserroles: [Role.admin], permissions: PERMS.filter((p) => p !== "delete_student"), organisationid: X, isplatform: false }),
} as const;
type Who = keyof typeof callers;
const IN_X: Who[] = ["X's Organisation Admin", "X's Admin", "a platform user acting as X"];

type Row = Record<string, unknown>;
const withoutReference = (body: Row) => {
  const { reference, logid, stack, ...rest } = body;
  return rest;
};
const said = (res: request.Response) => ({ status: res.status, body: withoutReference(res.body) });

const ACTIVITY = "This learner has signed in or has progress, so it can't be removed. Disable it instead.";
const UNREACHABLE = "The learning server didn't answer, so nothing was removed. Try again later.";
const HALF = "Removed from the learning server, but not here. Try again.";

/** One row for the learner in each table the central check covers (by the fake's table name). */
const ACTIVITY_ROWS: Array<{ table: string; fake: ContentTable; row: Row }> = [
  { table: "rpiuseraccess", fake: "rpiuseraccess", row: { rpiuseraccessid: "a1", userid: L_X } },
  { table: "studentappusages", fake: "studentappusages", row: { studentappusageid: "a2", schooluserid: L_X } },
  { table: "feedbacks", fake: "feedbacks", row: { feedbackid: "a3", created_by: L_X } },
  { table: "syncrecords", fake: "syncs", row: { syncid: "a4", created_by: L_X } },
  { table: "studentprogress", fake: "studentprogress", row: { studentprogressid: "a5", studentid: STU_X } },
  { table: "studentlearningprogress", fake: "studentlearningprogress", row: { studentlearningprogressid: "a6", studentid: STU_X } },
  { table: "studentpracticesprogress", fake: "studentpracticesprogress", row: { studentpracticeprogressid: "a7", studentid: STU_X } },
  { table: "studentquizzesprogress", fake: "studentquizzesprogress", row: { studentquizprogressid: "a8", studentid: STU_X } },
  { table: "studentgradesprogress", fake: "studentgradesprogress", row: { studentgradeprogressid: "a9", studentid: STU_X } },
  { table: "studentlevelsprogress", fake: "studentlevelsprogress", row: { studentlevelprogressid: "b1", studentid: STU_X } },
  { table: "studentlessonsprogress", fake: "studentlessonsprogress", row: { studentlessonprogressid: "b2", studentid: STU_X } },
  { table: "studentpoints", fake: "studentpoints", row: { studentpointid: "b3", studentid: STU_X } },
  { table: "studentactives", fake: "studentactives", row: { studentactiveid: "b4", studentid: STU_X } },
];

const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("countries", { countryid: C1, countryname: "កម្ពុជា", expectedusage: 1 });
  db.add("schools", { schoolid: S_X, schoolname: "សាលា ក", organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_Y, schoolname: "សាលា ខ", organisationid: Y, countryid: C1, curriculums: [] });
  const login = (id: string, name: string, role: SchoolRole, school: string, over: Row = {}) =>
    db.add("schoolusers", { schooluserid: id, schoolusername: name, schooluserrole: role, schoolid: school, schoolname: "x", schooluserstatus: true, isdisabled: false, isdeleted: false, schooluserpasswordhash: "hash", ...over });
  const learner = (id: string, login_: string, school: string, over: Row = {}) =>
    db.add("students", { studentid: id, schooluserid: login_, schoolid: school, schoolname: "x", studentfirstname: "សុខា", studentlastname: "ចាន់", standard: "k", curriculumid: "c", curriculumids: ["c"], genderid: 1, isactive: 1, is_teacher_acc: false, type: "online", isdeleted: false, ...over });
  login(L_X, "learnerx", SchoolRole.STUDENT, S_X);
  login(L_X_OTHER, "learnerx2", SchoolRole.STUDENT, S_X);
  login(L_Y, "learnery", SchoolRole.STUDENT, S_Y);
  login(L_GONE, "learnergone", SchoolRole.STUDENT, S_X, { isdeleted: true });
  login(T_X, "teacherx", SchoolRole.TEACHER, S_X);
  learner(STU_X, L_X, S_X);
  learner(uuid(402), L_X_OTHER, S_X);
  learner(uuid(404), L_Y, S_Y);
  learner(uuid(405), L_GONE, S_X, { isdeleted: true });
  db.add("tokens", { token: "token-of-x", lmsuserid: L_X, tokentype: "access" });
  db.add("tokens", { token: "token-of-other", lmsuserid: L_X_OTHER, tokentype: "access" });
};

describe("removing a learner who has never signed in", () => {
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

  const asked = (): Row[] => (axios.delete as jest.Mock).mock.calls.map(([url, options]) => ({ url, options }));

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
    (axios.delete as jest.Mock).mockReset().mockResolvedValue({ status: 200, data: { removed: true } });
  });

  const remove = (who: Who, id: string) =>
    request(app.getHttpServer()).post(`/student/${id}/remove`).set("Authorization", callers[who]).set("Connection", "close");
  const refuses = async (who: Who, id: string) => {
    const before = db.snapshot();
    const res = await remove(who, id);
    expect(db.snapshot()).toEqual(before);
    return res;
  };
  const untouched = () => {
    expect(db.tables.schoolusers.some((r) => r.schooluserid === L_X)).toBe(true);
    expect(db.tables.students.some((r) => r.studentid === STU_X)).toBe(true);
    expect(db.tables.tokens.some((r) => r.lmsuserid === L_X)).toBe(true);
  };

  describe("a learner that can be removed", () => {
    it.each(IN_X)("%s: removes the login, the learner rows and the tokens, and nothing of anyone else", async (who) => {
      const res = await remove(who, L_X).expect(200);
      expect(res.body).toEqual({ schooluserid: L_X, username: "learnerx", removed: true, message: "Removed. The username learnerx can be used again." });
      expect(db.tables.schoolusers.map((r) => r.schooluserid).sort()).toEqual([L_X_OTHER, L_Y, L_GONE, T_X].sort());
      expect(db.tables.students.some((r) => r.schooluserid === L_X)).toBe(false);
      expect(db.tables.students.filter((r) => r.schooluserid === L_X_OTHER)).toHaveLength(1);
      expect(db.tables.tokens.map((r) => r.lmsuserid)).toEqual([L_X_OTHER]);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });
    it("frees the username for Add learner's check, the username route and the CSV's taken check", async () => {
      const free = () => request(app.getHttpServer()).get("/student/username-available").query({ username: "learnerx" }).set("Authorization", callers["X's Admin"]).set("Connection", "close");
      expect((await free().expect(200)).body).toEqual({ available: false });
      expect(await new SchoolUserBusiness().schoolUserExists(["learnerx"])).toHaveLength(1);
      await remove("X's Admin", L_X).expect(200);
      expect((await free().expect(200)).body).toEqual({ available: true });
      expect(await new SchoolUserBusiness().schoolUserExists(["learnerx"])).toHaveLength(0);
      // a login that was only soft-deleted still holds its name
      expect((await request(app.getHttpServer()).get("/student/username-available").query({ username: "learnergone" }).set("Authorization", callers["X's Admin"]).set("Connection", "close")).body).toEqual({ available: false });
    });
    it("asks the learning server with the server key, the organisation and a timeout, before it removes anything here", async () => {
      let seenAtTheCall: { login: boolean; rows: boolean; tokens: boolean } | undefined;
      (axios.delete as jest.Mock).mockImplementation(async () => {
        seenAtTheCall = {
          login: db.tables.schoolusers.some((r) => r.schooluserid === L_X),
          rows: db.tables.students.some((r) => r.schooluserid === L_X),
          tokens: db.tables.tokens.some((r) => r.lmsuserid === L_X),
        };
        return { status: 200, data: { removed: true } };
      });
      await remove("X's Admin", L_X).expect(200);
      expect(seenAtTheCall).toEqual({ login: true, rows: true, tokens: true });
      expect(asked()).toHaveLength(1);
      const [{ url, options }] = asked() as Array<{ url: string; options: { headers: Record<string, string>; timeout: number } }>;
      expect(url).toBe(`http://learner-server.invalid/import/students/${L_X}`);
      expect(options.headers["X-Organisation-Id"]).toBe(X);
      expect(options.headers.Authorization).toBe(Config.fortyk.api.serversynckey);
      expect(options.timeout).toBe(15_000);
    });
    it("is removed here when the learning server never held it", async () => {
      (axios.delete as jest.Mock).mockResolvedValue({ status: 200, data: { removed: false, absent: true } });
      await remove("X's Admin", L_X).expect(200);
      expect(db.tables.schoolusers.some((r) => r.schooluserid === L_X)).toBe(false);
    });
    it("is removed here, without a call, when no learning server is set up", async () => {
      rpi.cloud = undefined;
      await remove("X's Admin", L_X).expect(200);
      expect(axios.delete).not.toHaveBeenCalled();
      expect(db.tables.schoolusers.some((r) => r.schooluserid === L_X)).toBe(false);
    });
  });

  describe("central activity", () => {
    it("the check covers each of the tables, and the cases below cover each of them", () => {
      expect(CENTRAL_ACTIVITY.map((c) => c.table).sort()).toEqual(ACTIVITY_ROWS.map((a) => a.table).sort());
    });
    it.each(ACTIVITY_ROWS)("a row in $table is a 409, nothing removed, the learning server not asked", async ({ fake, row }) => {
      db.add(fake, row);
      const res = await refuses("X's Admin", L_X);
      expect(res.status).toBe(409);
      expect(res.body.errormessage).toBe(ACTIVITY);
      expect(axios.delete).not.toHaveBeenCalled();
      untouched();
    });
    it("activity that appears after the first look and before the lock is a 409 too, and rolls back", async () => {
      // the learning server answers, and a row lands on central before the transaction looks again
      (axios.delete as jest.Mock).mockImplementation(async () => {
        db.add("studentpoints", { studentpointid: "late", studentid: STU_X });
        return { status: 200, data: { removed: true } };
      });
      const res = await remove("X's Admin", L_X);
      expect(res.status).toBe(409);
      expect(transaction.rollback).toHaveBeenCalledTimes(1);
      expect(transaction.commit).not.toHaveBeenCalled();
      untouched();
    });
  });

  describe("the learning server", () => {
    it("a 409 is a 409 with the same message, nothing removed", async () => {
      (axios.delete as jest.Mock).mockResolvedValue({ status: 409, data: { removed: false, reason: "activity" } });
      const res = await refuses("X's Admin", L_X);
      expect(res.status).toBe(409);
      expect(res.body.errormessage).toBe(ACTIVITY);
      untouched();
    });
    const unreachable: Array<[string, () => void]> = [
      ["no answer", () => (axios.delete as jest.Mock).mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true, config: { headers: { Authorization: "SECRET-KEY" } } }))],
      ["a timeout", () => (axios.delete as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }))],
      ["a 500", () => (axios.delete as jest.Mock).mockResolvedValue({ status: 500, data: {} })],
      ["a 502", () => (axios.delete as jest.Mock).mockResolvedValue({ status: 502, data: {} })],
      ["a 401 (the key refused)", () => (axios.delete as jest.Mock).mockResolvedValue({ status: 401, data: {} })],
      ["a 404 (no such route there)", () => (axios.delete as jest.Mock).mockResolvedValue({ status: 404, data: {} })],
      ["a 200 that says neither removed nor absent", () => (axios.delete as jest.Mock).mockResolvedValue({ status: 200, data: {} })],
      ["a 204", () => (axios.delete as jest.Mock).mockResolvedValue({ status: 204, data: "" })],
    ];
    it.each(unreachable)("%s is a 503 with the contract message, nothing removed, no key in the answer or the log", async (_name, arrange) => {
      arrange();
      const res = await refuses("X's Admin", L_X);
      expect(res.status).toBe(503);
      expect(res.body.errormessage).toBe(UNREACHABLE);
      expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
      expect(JSON.stringify((Logger.error as jest.Mock).mock.calls)).not.toContain("SECRET-KEY");
      expect(transaction.commit).not.toHaveBeenCalled();
      untouched();
    });
  });

  describe("the central transaction failing after the learning server removed the account", () => {
    it("is a 500 with the contract message, and a retry (the learning server now saying absent) finishes", async () => {
      jest.spyOn(tokens, "destroy").mockRejectedValueOnce(new Error("delete failed"));
      const first = await remove("X's Admin", L_X);
      expect(first.status).toBe(500);
      expect(first.body.errormessage).toBe(HALF);
      expect(transaction.rollback).toHaveBeenCalledTimes(1);
      untouched();
      (axios.delete as jest.Mock).mockResolvedValue({ status: 200, data: { removed: false, absent: true } });
      await remove("X's Admin", L_X).expect(200);
      expect(db.tables.schoolusers.some((r) => r.schooluserid === L_X)).toBe(false);
    });
    it("a commit that fails is the same", async () => {
      transaction.commit.mockRejectedValueOnce(new Error("commit failed"));
      const res = await remove("X's Admin", L_X);
      expect(res.status).toBe(500);
      expect(res.body.errormessage).toBe(HALF);
    });
    it("when the learning server did not remove it (absent, or none set up) the failure is the ordinary 500", async () => {
      (axios.delete as jest.Mock).mockResolvedValue({ status: 200, data: { removed: false, absent: true } });
      jest.spyOn(schoolusers, "destroy").mockRejectedValueOnce(new Error("delete failed"));
      const res = await remove("X's Admin", L_X);
      expect(res.status).toBe(500);
      expect(res.body.errormessage).not.toBe(HALF);
    });
  });

  describe("whose account", () => {
    it.each(IN_X)("%s: another organisation's learner is the 404 an account that is not there gets, nothing removed or sent", async (who) => {
      const other = await refuses(who, L_Y);
      const missing = await refuses(who, MISSING);
      expect(other.status).toBe(404);
      expect(said(other)).toEqual(said(missing));
      expect(axios.delete).not.toHaveBeenCalled();
    });
    it.each(IN_X)("%s: a teacher is the same 404", async (who) => {
      const wrong = await refuses(who, T_X);
      expect(wrong.status).toBe(404);
      expect(said(wrong)).toEqual(said(await refuses(who, MISSING)));
      expect(axios.delete).not.toHaveBeenCalled();
    });
    it("an account that was already deleted is the same 404", async () => {
      const res = await refuses("X's Admin", L_GONE);
      expect(res.status).toBe(404);
      expect(said(res)).toEqual(said(await refuses("X's Admin", MISSING)));
    });
    it("a platform user not acting is asked to choose an organisation, and nothing is removed", async () => {
      const res = await refuses("a platform user not acting", L_X);
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe("Choose an organisation.");
      expect(axios.delete).not.toHaveBeenCalled();
    });
    it("an Admin without the delete permission is refused (403), nothing removed or sent", async () => {
      const res = await refuses("an Admin without the delete permission", L_X);
      expect(res.status).toBe(403);
      expect(axios.delete).not.toHaveBeenCalled();
    });
  });
});
