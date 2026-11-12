import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import axios from "axios";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { certificates as certificatesModel } from "src/models/data-models/certificates";
import { shortcodes } from "src/business/certificate-shortcode";
import { CertificateController, CertificateVerifyController } from "./certificate.controller";

/**
 * Certificates (staff routes and the public check), driven over real HTTP through the real strategy, guards, validators,
 * controllers and business class. Replaced: the models (an in-memory copy), the token lookup, the transaction, and the
 * learning server (axios), which answers with the shape of its real route: `{ error: false, data: [...] }`.
 * Nothing here ran on MySQL: the in-memory copy has no row locks, so the double-issue rule is proved by what the code asks
 * the database for (a locking read inside the transaction) and by a second issue landing between the two reads.
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
const CUR_X = uuid(301);
const CUR_Y = uuid(302);
const CUR_X2 = uuid(303); // curriculum of X that gives no certificate for a level
const GRADE_X = uuid(311);
const LEVEL_X = uuid(321);
const LEVEL_Y = uuid(322);
const SCH_COMPANY = uuid(201);
const SCH_SCHOOL = uuid(202);
const SCH_Y = uuid(203);
const K_1 = uuid(501);
const K_2 = uuid(502);
const L = (n: number) => uuid(400 + n); // learners of X
const L_Y = uuid(499);
const MISSING = uuid(999);
const CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const db = new ContentFake();
const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };
const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const ALL = ["list_certificate", "create_certificate", "revoke_certificate"];
const staff = (permissions: string[], organisationid: string | null = X) =>
  bearer({ lmsuserid: "staff-1", lmsuserroles: [Role.admin], permissions, organisationid, isplatform: false });
const tokens = {
  admin: staff(ALL),
  none: staff([]),
  listOnly: staff(["list_certificate"]),
  issueOnly: staff(["create_certificate"]),
  revokeOnly: staff(["revoke_certificate"]),
  otherOrg: staff(ALL, Y),
  platform: bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: null, isplatform: true }),
};

type Entry = { status: string; reasons?: unknown[]; quizcount?: number; passedcount?: number };
let learning: Record<string, Entry>;
let learningDown: boolean;
const asked = () => (axios.post as jest.Mock).mock.calls;

const seed = () => {
  db.add("organisations", { organisationid: X, organisationname: "Mekong Learning Group", uitheme: "kids" });
  db.add("organisations", { organisationid: Y, organisationname: "Other Group" });
  const cur = (id: string, org: string, name: string, level: string) =>
    db.add("curriculums", { curriculumid: id, curriculumname: name, organisationid: org, curriculumstatus: true, levelrecognition: level, graderecognition: "certificate", curriculumrecognition: "none" });
  cur(CUR_X, X, "ភាសាខ្មែរ", "certificate");
  cur(CUR_X2, X, "គណិតវិទ្យា", "award");
  cur(CUR_Y, Y, "Other course", "certificate");
  db.add("grades", { gradeid: GRADE_X, curriculumid: CUR_X, gradename: "ថ្នាក់ទី១", gradeorder: 1, gradestatus: true, isdeleted: false });
  db.add("levels", { levelid: LEVEL_X, gradeid: GRADE_X, levelname: "មេរៀនទី២", levelorder: 1, levelstatus: true, isdeleted: false });
  db.add("grades", { gradeid: uuid(312), curriculumid: CUR_Y, gradename: "Grade Y", gradeorder: 1, gradestatus: true, isdeleted: false });
  db.add("levels", { levelid: LEVEL_Y, gradeid: uuid(312), levelname: "Level Y", levelorder: 1, levelstatus: true, isdeleted: false });
  db.add("schools", { schoolid: SCH_COMPANY, schoolname: "សាលាក", organisationid: X, brandingconfig: { labelPreset: "company" } });
  db.add("schools", { schoolid: SCH_SCHOOL, schoolname: "សាលាខ", organisationid: X, brandingconfig: null });
  db.add("schools", { schoolid: SCH_Y, schoolname: "Y school", organisationid: Y, brandingconfig: null });
  db.add("standards", { standardid: K_1, standardname: "ថ្នាក់ក", schoolid: SCH_COMPANY });
  db.add("standards", { standardid: K_2, standardname: "ថ្នាក់ខ", schoolid: SCH_SCHOOL });
  const learner = (id: string, first: string, school: string, klass: string | null, curs: string[]) =>
    db.add("students", { studentid: id, studentfirstname: first, studentlastname: "ចាន់", standard: klass, schoolid: school, curriculumid: curs[0], curriculumids: curs, isdeleted: false });
  learner(L(1), "សុខា", SCH_COMPANY, K_1, [CUR_X]);
  learner(L(2), "ដារា", SCH_COMPANY, K_1, [CUR_X]);
  learner(L(3), "វិបុល", SCH_SCHOOL, K_2, [CUR_X]);
  learner(L(4), "ចន្ទា", SCH_SCHOOL, K_2, [CUR_X]);
  learner(L(5), "សុភា", SCH_SCHOOL, null, [CUR_X2]); // not enrolled in CUR_X
  learner(L(6), "គ្រូ", SCH_SCHOOL, K_2, [CUR_X]);
  db.tables.students.find((r) => r.studentid === L(6))!.is_teacher_acc = true; // a teacher account stored as a student row
  learner(L_Y, "Yara", SCH_Y, null, [CUR_Y]);
  learning = {
    [L(1)]: { status: "ready", reasons: [], quizcount: 4, passedcount: 4 },
    [L(2)]: { status: "not_yet", reasons: [{ quiz: { id: "q1", kind: "level", name: "Quiz" }, level: { id: LEVEL_X, name: "Module 2" }, state: "below", bestpercent: 60 }], quizcount: 4, passedcount: 3 },
    [L(3)]: { status: "cant_check", reasons: [{ quiz: { id: "q2", kind: "lesson", name: "Quiz" }, level: { id: LEVEL_X, name: "Module 2" }, lesson: { id: "l1", name: "Lesson 1" }, state: "unverified", bestpercent: 90 }], quizcount: 4, passedcount: 3 },
    [L(4)]: { status: "ready", reasons: [], quizcount: 4, passedcount: 4 },
  };
};

const issueRow = (studentid: string, extra: Record<string, unknown> = {}) =>
  db.add("certificates", {
    certificateid: uuid(800 + db.tables.certificates.length), shortcode: "AAAA-BBBB", organisationid: X, studentid, curriculumid: CUR_X, scope: "level", scopeid: LEVEL_X,
    standardid: null, issuedat: new Date("2026-11-01T00:00:00Z"), issuedby: "staff-0", revokedat: null, revokedby: null, revokereason: null,
    snapshot: { learnername: "Test Learner", curriculumname: "Course", scopename: "Module", tierlabel: "Module", classname: null, organisationname: "Group", schoolname: "School", quizcount: 4 }, ...extra,
  });

describe("certificates", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ ttl: 60, limit: 1000 })],
      controllers: [CertificateController, CertificateVerifyController],
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
    tokenExists.mockResolvedValue(true);
    db.install();
    seed();
    learningDown = false;
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    transaction.commit.mockClear();
    transaction.rollback.mockClear();
    (axios.put as jest.Mock).mockReset().mockResolvedValue({ status: 200, data: { error: false, data: { upserted: 0, deleted: 0 } } });
    (axios.post as jest.Mock).mockReset().mockImplementation(async (_url: string, body: { studentids: string[] }) => {
      if (learningDown) throw Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true });
      return { data: { error: false, data: body.studentids.filter((id) => learning[id]).map((id) => ({ studentid: id, reasons: [], quizcount: 0, passedcount: 0, ...learning[id] })) } };
    });
  });

  const send = (who: keyof typeof tokens | null, method: "get" | "post", path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](path).set("Connection", "close");
    const a = who ? r.set("Authorization", tokens[who]) : r;
    return body ? a.send(body) : a;
  };
  const noRef = (b: Record<string, unknown>) => {
    const { reference, logid, stack, ...rest } = b;
    return rest;
  };
  const scopeBody = { curriculumid: CUR_X, scope: "level", scopeid: LEVEL_X };
  const candidates = (extra: object = {}) => send("admin", "post", "/certificate/candidates", { ...scopeBody, ...extra });
  const issue = (studentids: string[], extra: object = {}) => send("admin", "post", "/certificate/issue", { ...scopeBody, studentids, ...extra });
  const byId = (rows: Array<{ student: { studentid: string }; status: string }>) => Object.fromEntries(rows.map((r) => [r.student.studentid, r.status]));

  describe("POST /certificate/candidates", () => {
    it("mixes issued, ready, not_yet and cant_check, only learners enrolled in the curriculum", async () => {
      issueRow(L(1));
      const res = await candidates().expect(200);
      expect(byId(res.body.data)).toEqual({ [L(1)]: "issued", [L(2)]: "not_yet", [L(3)]: "cant_check", [L(4)]: "ready" });
      // the learner holding a certificate is not asked about
      expect(asked()).toHaveLength(1);
      expect(asked()[0][1].studentids.sort()).toEqual([L(2), L(3), L(4)].sort());
      expect(asked()[0][2].headers["X-Organisation-Id"]).toBe(X);
      expect(asked()[0][0]).toMatch(/\/report\/certificate-eligibility$/);
    });

    it("leaves a teacher account out", async () => {
      learning[L(6)] = { status: "ready", reasons: [], quizcount: 4, passedcount: 4 };
      const res = await candidates().expect(200);
      expect(Object.keys(byId(res.body.data))).not.toContain(L(6));
      expect(asked()[0][1].studentids).not.toContain(L(6));
    });

    it("whole row of a ready learner and of an issued one", async () => {
      issueRow(L(1), { shortcode: "7Q2M-9KXA", certificateid: uuid(850) });
      const res = await candidates({ standardid: K_1 }).expect(200);
      expect(res.body).toEqual({
        error: false,
        data: [
          { student: { studentid: L(2), name: "ដារា ចាន់", standardid: K_1, classname: "ថ្នាក់ក" }, status: "not_yet", reasons: learning[L(2)].reasons, quizcount: 4, passedcount: 3, certificate: null },
          { student: { studentid: L(1), name: "សុខា ចាន់", standardid: K_1, classname: "ថ្នាក់ក" }, status: "issued", reasons: [], quizcount: 0, passedcount: 0, certificate: { certificateid: uuid(850), shortcode: "7Q2M-9KXA", issuedat: "2026-11-01T00:00:00.000Z" } },
        ].sort((a, b) => a.student.name.localeCompare(b.student.name)),
      });
    });

    it("a revoked certificate does not count as issued", async () => {
      issueRow(L(1), { revokedat: new Date(), revokedby: "x", revokereason: "mistake" });
      const res = await candidates().expect(200);
      expect(byId(res.body.data)[L(1)]).toBe("ready");
    });

    it("the class filter narrows to that class", async () => {
      const res = await candidates({ standardid: K_2 }).expect(200);
      expect(Object.keys(byId(res.body.data)).sort()).toEqual([L(3), L(4)].sort());
    });

    it("a learner the learning server does not hold cannot be checked", async () => {
      delete learning[L(4)];
      const res = await candidates().expect(200);
      const row = res.body.data.find((r: { student: { studentid: string } }) => r.student.studentid === L(4));
      expect(row.status).toBe("cant_check");
      expect(row.reasons).toEqual([{ reason: "not_on_learning_server" }]);
    });

    it("another organisation's curriculum answers as a missing one", async () => {
      const foreign = await send("admin", "post", "/certificate/candidates", { ...scopeBody, curriculumid: CUR_Y, scopeid: LEVEL_Y }).expect(404);
      const missing = await send("admin", "post", "/certificate/candidates", { ...scopeBody, curriculumid: MISSING }).expect(404);
      expect(noRef(foreign.body)).toEqual(noRef(missing.body));
      expect(asked()).toHaveLength(0);
    });

    it("scope not set to certificate on the curriculum is a 400 on scope; a scope id outside it is a 400 on scopeid", async () => {
      const a = await send("admin", "post", "/certificate/candidates", { curriculumid: CUR_X2, scope: "level", scopeid: LEVEL_X }).expect(400);
      expect(a.body.fields).toEqual([{ field: "scope", message: "This curriculum does not give certificates for that tier." }]);
      const b = await send("admin", "post", "/certificate/candidates", { ...scopeBody, scopeid: LEVEL_Y }).expect(400);
      expect(b.body.fields[0].field).toBe("scopeid");
      const c = await send("admin", "post", "/certificate/candidates", { ...scopeBody, scope: "curriculum", scopeid: CUR_X }).expect(400);
      expect(c.body.fields[0].field).toBe("scope");
      const d = await send("admin", "post", "/certificate/candidates", { ...scopeBody, scope: "grade", scopeid: GRADE_X }).expect(200);
      expect(d.body.data.length).toBeGreaterThan(0);
    });

    it("asks the learning server with the server key and the acting organisation", async () => {
      await candidates().expect(200);
      expect(asked()[0][2].headers).toEqual({ Authorization: Config.fortyk.api.serversynckey, "X-Organisation-Id": X });
    });

    it("the learning server refusing the question (400 or 404) says the curriculum is not there yet; a timeout says to retry", async () => {
      for (const status of [400, 404]) {
        (axios.post as jest.Mock).mockRejectedValueOnce(Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status } }));
        const res = await candidates().expect(502);
        expect(res.body.errormessage ?? res.body.message).toBe("This curriculum (or this part of it) is not on the learning server yet. Publish it, then try again.");
      }
      learningDown = true;
      const res = await candidates().expect(502);
      expect(res.body.errormessage ?? res.body.message).toMatch(/Try again in a few minutes/);
    });

    it("the learning server down is a 502 with a plain message", async () => {
      learningDown = true;
      const res = await candidates().expect(502);
      expect(res.body.errormessage ?? res.body.message).toMatch(/learning server could not be asked/);
    });

    it("a platform user who is not acting is told to choose an organisation", async () => {
      await send("platform", "post", "/certificate/candidates", scopeBody).expect(400);
    });
  });

  describe("POST /certificate/issue", () => {
    it("issues only ready learners, with the snapshot filled and a well-formed code", async () => {
      const res = await issue([L(1), L(2), L(3), L(4)]).expect(200);
      const issued = res.body.data.issued;
      expect(issued.map((c: { studentid: string }) => c.studentid).sort()).toEqual([L(1), L(4)].sort());
      for (const c of issued) expect(c.shortcode).toMatch(CODE);
      const one = issued.find((c: { studentid: string }) => c.studentid === L(1));
      expect(one).toMatchObject({
        organisationid: X, curriculumid: CUR_X, scope: "level", scopeid: LEVEL_X, standardid: K_1, issuedby: "staff-1", revokedat: null,
        snapshot: { learnername: "សុខា ចាន់", curriculumname: "ភាសាខ្មែរ", scopename: "មេរៀនទី២", tierlabel: "Module", classname: "ថ្នាក់ក", organisationname: "Mekong Learning Group", schoolname: "សាលាក", quizcount: 4 },
      });
      const other = issued.find((c: { studentid: string }) => c.studentid === L(4));
      expect(other.snapshot.tierlabel).toBe("Level");
      expect(res.body.data.refused).toEqual([
        { studentid: L(2), status: "not_yet", reasons: learning[L(2)].reasons },
        { studentid: L(3), status: "cant_check", reasons: learning[L(3)].reasons },
      ]);
      expect(db.tables.certificates).toHaveLength(2);
      // READ COMMITTED: no gap locks between issues for different learners
      expect(dbinstance.getdbinstance().transaction).toHaveBeenCalledWith({ isolationLevel: "READ COMMITTED" });
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    it("refuses a learner who already holds an unrevoked certificate, and one that is unknown, not enrolled or another organisation's, alike", async () => {
      issueRow(L(1));
      const res = await issue([L(1), L(5), L_Y, MISSING]).expect(200);
      expect(res.body.data.issued).toEqual([]);
      expect(res.body.data.refused).toEqual([
        { studentid: L(1), status: "issued", reasons: [] },
        { studentid: L(5), status: "not_found", reasons: [] },
        { studentid: L_Y, status: "not_found", reasons: [] },
        { studentid: MISSING, status: "not_found", reasons: [] },
      ]);
      expect(db.tables.certificates).toHaveLength(1);
      expect(asked()).toHaveLength(0);
    });

    it("refuses a teacher account exactly like an unknown id", async () => {
      learning[L(6)] = { status: "ready", reasons: [], quizcount: 4, passedcount: 4 };
      const res = await issue([L(6), MISSING]).expect(200);
      expect(res.body.data.issued).toEqual([]);
      expect(res.body.data.refused).toEqual([
        { studentid: L(6), status: "not_found", reasons: [] },
        { studentid: MISSING, status: "not_found", reasons: [] },
      ]);
      db.nothingCreated();
    });

    it("re-checks on the learning server: a not_yet learner named by the client is refused and nothing is written", async () => {
      const res = await issue([L(2)]).expect(200);
      expect(asked()).toHaveLength(1);
      expect(res.body.data.issued).toEqual([]);
      expect(res.body.data.refused[0]).toMatchObject({ studentid: L(2), status: "not_yet" });
      db.nothingCreated();
    });

    it("the learning server down is a 502 and writes nothing", async () => {
      learningDown = true;
      await issue([L(1)]).expect(502);
      db.nothingCreated();
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { error: false } });
      await issue([L(1)]).expect(502);
      db.nothingCreated();
    });

    it("validates: 1 to 200 learners, scope and scopeid", async () => {
      await issue([]).expect(400);
      await issue(Array.from({ length: 201 }, (_, i) => uuid(1000 + i))).expect(400);
      await issue([L(1)], { curriculumid: CUR_X2 }).expect(400);
      await issue([L(1)], { scopeid: LEVEL_Y }).expect(400);
      db.nothingCreated();
    });

    it("a collision on the code takes a new one", async () => {
      issueRow(L(3), { shortcode: "AAAA-AAAA" });
      const codes = ["AAAA-AAAA", "BBBB-BBBB"];
      jest.spyOn(shortcodes, "next").mockImplementation(() => codes.shift() ?? "CCCC-CCCC");
      const res = await issue([L(1)]).expect(200);
      expect(res.body.data.issued[0].shortcode).toBe("BBBB-BBBB");
    });

    it("a code meeting the unique index runs the whole issue once more with new codes, then answers 409", async () => {
      const clash = () => Object.assign(new Error("Validation error"), { name: "SequelizeUniqueConstraintError", fields: { shortcode: "AAAA-AAAA" } });
      const create = certificatesModel.create as jest.Mock;
      const real = create.getMockImplementation()!;
      create.mockImplementationOnce(async () => { throw clash(); });
      const ok = await issue([L(1)]).expect(200);
      expect(ok.body.data.issued).toHaveLength(1);
      expect(db.tables.certificates).toHaveLength(1);
      expect(transaction.rollback).toHaveBeenCalledTimes(1);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
      create.mockImplementation(async () => { throw clash(); });
      const refused = await issue([L(4)]).expect(409);
      expect(refused.body.errormessage ?? refused.body.message).toMatch(/unique certificate code/);
      expect(db.tables.certificates).toHaveLength(1);
      create.mockImplementation(real);
    });

    it("two issues at once for one learner: the second finds the first's certificate once it holds the lock", async () => {
      // the learner is not holding one when issue starts; the other issue commits while this one waits for the row lock
      const lockedReads: unknown[] = [];
      const model = jest.requireActual("src/models/data-models/students").students;
      const real = (model.findAll as jest.Mock).getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
      jest.spyOn(model, "findAll").mockImplementation((async (o: { lock?: unknown; transaction?: unknown }) => {
        if (o?.lock) {
          lockedReads.push(o);
          issueRow(L(1), { shortcode: "ZZZZ-ZZZZ" }); // the other issue's certificate, committed
        }
        return real.call(model, o);
      }) as never);
      const res = await issue([L(1)]).expect(200);
      expect(lockedReads).toHaveLength(1);
      expect((lockedReads[0] as { lock: unknown; transaction: unknown }).lock).toBe("UPDATE");
      expect((lockedReads[0] as { transaction: unknown }).transaction).toBe(transaction);
      expect(res.body.data.issued).toEqual([]);
      expect(res.body.data.refused).toEqual([{ studentid: L(1), status: "issued", reasons: [] }]);
      expect(db.tables.certificates).toHaveLength(1);
    });
  });

  describe("POST /certificate/:certificateid/revoke", () => {
    it("sets the fields; a reason is required; a second revoke is 409; a new issue is then allowed", async () => {
      const made = (await issue([L(1)])).body.data.issued[0];
      await send("admin", "post", `/certificate/${made.certificateid}/revoke`, {}).expect(400);
      await send("admin", "post", `/certificate/${made.certificateid}/revoke`, { reason: "   " }).expect(400);
      await send("admin", "post", `/certificate/${made.certificateid}/revoke`, { reason: "x".repeat(501) }).expect(400);
      const res = await send("admin", "post", `/certificate/${made.certificateid}/revoke`, { reason: "Issued to the wrong learner" }).expect(200);
      expect(res.body.data).toMatchObject({ certificateid: made.certificateid, revokedby: "staff-1", revokereason: "Issued to the wrong learner" });
      expect(res.body.data.revokedat).toBeTruthy();
      await send("admin", "post", `/certificate/${made.certificateid}/revoke`, { reason: "again" }).expect(409);
      const again = await issue([L(1)]).expect(200);
      expect(again.body.data.issued).toHaveLength(1);
      expect(again.body.data.issued[0].certificateid).not.toBe(made.certificateid);
    });

    it("another organisation's certificate answers as a missing one and stays unrevoked", async () => {
      issueRow(L(1), { certificateid: uuid(860) });
      const foreign = await send("otherOrg", "post", `/certificate/${uuid(860)}/revoke`, { reason: "no" }).expect(404);
      const missing = await send("otherOrg", "post", `/certificate/${MISSING}/revoke`, { reason: "no" }).expect(404);
      expect(noRef(foreign.body)).toEqual(noRef(missing.body));
      expect(db.tables.certificates[0].revokedat).toBeNull();
    });
  });

  describe("GET /certificate/:certificateid and GET /certificate/student/:studentid", () => {
    it("reads the whole certificate, and a learner's list newest first", async () => {
      issueRow(L(1), { certificateid: uuid(870), issuedat: new Date("2026-10-01T00:00:00Z") });
      issueRow(L(1), { certificateid: uuid(871), shortcode: "CCCC-DDDD", issuedat: new Date("2026-11-01T00:00:00Z"), revokedat: new Date("2026-11-02T00:00:00Z"), revokedby: "s", revokereason: "why" });
      const one = await send("admin", "get", `/certificate/${uuid(871)}`).expect(200);
      expect(one.body.data).toMatchObject({ certificateid: uuid(871), revokereason: "why", snapshot: { learnername: "Test Learner" } });
      const list = await send("admin", "get", `/certificate/student/${L(1)}`).expect(200);
      expect(list.body.data.map((c: { certificateid: string }) => c.certificateid)).toEqual([uuid(871), uuid(870)]);
    });

    it("another organisation's certificate and learner answer as missing ones", async () => {
      issueRow(L(1), { certificateid: uuid(870) });
      const a = await send("otherOrg", "get", `/certificate/${uuid(870)}`).expect(404);
      const b = await send("otherOrg", "get", `/certificate/${MISSING}`).expect(404);
      expect(noRef(a.body)).toEqual(noRef(b.body));
      const c = await send("otherOrg", "get", `/certificate/student/${L(1)}`).expect(404);
      const d = await send("otherOrg", "get", `/certificate/student/${MISSING}`).expect(404);
      expect(noRef(c.body)).toEqual(noRef(d.body));
    });
  });

  describe("permissions", () => {
    const routes: Array<[string, "get" | "post", string, object | undefined, keyof typeof tokens]> = [
      ["POST /certificate/candidates", "post", "/certificate/candidates", scopeBody, "listOnly"],
      ["POST /certificate/issue", "post", "/certificate/issue", { ...scopeBody, studentids: [L(1)] }, "issueOnly"],
      ["POST /certificate/:certificateid/revoke", "post", `/certificate/${uuid(880)}/revoke`, { reason: "r" }, "revokeOnly"],
      ["GET /certificate/:certificateid", "get", `/certificate/${uuid(880)}`, undefined, "listOnly"],
      ["GET /certificate/student/:studentid", "get", `/certificate/student/${L(1)}`, undefined, "listOnly"],
    ];
    it.each(routes)("%s refuses a staff token without its permission and admits the one that holds it", async (_t, method, path, body, holder) => {
      const refused = await send("none", method, path, body);
      expect(refused.status).toBe(403);
      for (const other of ["listOnly", "issueOnly", "revokeOnly"] as const) {
        if (other !== holder) expect((await send(other, method, path, body)).status).toBe(403);
      }
      expect((await send(holder, method, path, body)).status).not.toBe(403);
    });
    it("refuses a request with no token", async () => {
      await send(null, "get", `/certificate/${uuid(880)}`).expect(401);
    });
  });

  describe("certificates pushed to the learning server", () => {
    const puts = () => (axios.put as jest.Mock).mock.calls;
    const saved = { cloud: Config.fortyk.api.rpi.cloud, check: process.env.CERTIFICATE_CHECK_URL };
    beforeEach(() => {
      Config.fortyk.api.rpi.cloud = "http://learning.example.test";
      process.env.CERTIFICATE_CHECK_URL = "https://admin.example.test/v/";
    });
    afterEach(() => {
      Config.fortyk.api.rpi.cloud = saved.cloud;
      if (saved.check === undefined) delete process.env.CERTIFICATE_CHECK_URL;
      else process.env.CERTIFICATE_CHECK_URL = saved.check;
    });
    const revoke = (id: string, reason = "Issued to the wrong learner") => send("admin", "post", `/certificate/${id}/revoke`, { reason });

    it("issue: after the commit, one push of the issued rows, with the organisation header and the server key", async () => {
      let committedAtPush = -1;
      (axios.put as jest.Mock).mockImplementation(async () => {
        committedAtPush = transaction.commit.mock.calls.length;
        return { status: 200, data: { error: false, data: { upserted: 2, deleted: 0 } } };
      });
      const res = await issue([L(1), L(4)]).expect(200);
      expect(res.body.data.pushed).toBe(true);
      expect(committedAtPush).toBe(1); // the push happened after the transaction committed, never before or inside it
      expect(puts()).toHaveLength(1);
      const [url, body, config] = puts()[0];
      expect(url).toBe("http://learning.example.test/import/certificates");
      expect(config.headers).toEqual({ Authorization: Config.fortyk.api.serversynckey, "X-Organisation-Id": X });
      expect(Object.keys(body)).toEqual(["certificates"]);
      expect(body.certificates.map((r: { studentid: string }) => r.studentid).sort()).toEqual([L(1), L(4)].sort());
      const made = res.body.data.issued.find((c: { studentid: string }) => c.studentid === L(1));
      const sent = body.certificates.find((r: { studentid: string }) => r.studentid === L(1));
      expect(sent).toEqual({
        certificateid: made.certificateid, shortcode: made.shortcode, studentid: L(1), curriculumid: CUR_X, scope: "level", scopeid: LEVEL_X,
        issuedat: expect.any(Date), revokedat: null, snapshot: made.snapshot, checkurl: `https://admin.example.test/v/${made.shortcode}`,
      });
    });

    it("issue: a push the learning server refuses leaves the issue standing, with pushed false and no personal data in the log", async () => {
      (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { code: "INVALID_INPUT", fields: [{ field: "certificates row 1 studentid" }], errormessage: "សុខា ចាន់" } }, config: { headers: { Authorization: "SECRET-KEY" } } }));
      const res = await issue([L(1)]).expect(200);
      expect(res.body.data.pushed).toBe(false);
      expect(res.body.data.issued).toHaveLength(1);
      expect(db.tables.certificates).toHaveLength(1);
      const logged = JSON.stringify((Logger.warn as jest.Mock).mock.calls);
      expect(logged).toContain("push of certificates");
      for (const leak of ["SECRET-KEY", "សុខា", L(1)]) expect(logged).not.toContain(leak);
    });

    it("issue: with no learning server set up, pushed is false and nothing is called", async () => {
      Config.fortyk.api.rpi.cloud = "your-cloud-endpoint";
      const res = await issue([L(1)]).expect(200);
      expect(res.body.data.pushed).toBe(false);
      expect(res.body.data.issued).toHaveLength(1);
      expect(puts()).toHaveLength(0);
    });

    it("issue: when nothing is issued nothing is pushed", async () => {
      const res = await issue([L(2)]).expect(200);
      expect(res.body.data.issued).toEqual([]);
      expect(puts()).toHaveLength(0);
    });

    it("revoke: after the commit, the one row is pushed with its revokedat and no reason", async () => {
      const made = (await issue([L(1)])).body.data.issued[0];
      (axios.put as jest.Mock).mockClear();
      let committedAtPush = -1;
      (axios.put as jest.Mock).mockImplementation(async () => {
        committedAtPush = transaction.commit.mock.calls.length;
        return { status: 200, data: {} };
      });
      transaction.commit.mockClear();
      const res = await revoke(made.certificateid, "SECRET-REASON").expect(200);
      expect(res.body.data.pushed).toBe(true);
      expect(committedAtPush).toBe(1);
      expect(puts()).toHaveLength(1);
      const [, body, config] = puts()[0];
      expect(config.headers["X-Organisation-Id"]).toBe(X);
      expect(body.certificates).toHaveLength(1);
      expect(body.certificates[0]).toMatchObject({ certificateid: made.certificateid, revokedat: expect.any(Date) });
      expect(JSON.stringify(body)).not.toContain("SECRET-REASON");
    });

    it("revoke: a failed push leaves the revoke standing, with pushed false", async () => {
      const made = (await issue([L(1)])).body.data.issued[0];
      (axios.put as jest.Mock).mockRejectedValue(Object.assign(new Error("timeout of 30000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
      const res = await revoke(made.certificateid).expect(200);
      expect(res.body.data.pushed).toBe(false);
      expect(res.body.data.revokedat).toBeTruthy();
      expect(db.tables.certificates[0].revokedat).toBeTruthy();
    });

    it("what is pushed never carries the revoke reason, who issued or revoked, or the organisation id", async () => {
      const made = (await issue([L(1)])).body.data.issued[0];
      await revoke(made.certificateid, "SECRET-REASON").expect(200);
      expect(puts()).toHaveLength(2);
      for (const [, body] of puts()) {
        for (const row of body.certificates) {
          expect(Object.keys(row).sort()).toEqual(["certificateid", "checkurl", "curriculumid", "issuedat", "revokedat", "scope", "scopeid", "shortcode", "snapshot", "studentid"]);
        }
        const text = JSON.stringify(body);
        for (const leak of ["revokereason", "revokedby", "issuedby", "organisationid", "SECRET-REASON", "staff-1", X]) expect(text).not.toContain(leak);
      }
    });

    it("checkurl is the base and the code, a trailing slash handled, and null when the variable is unset", async () => {
      process.env.CERTIFICATE_CHECK_URL = "  https://admin.example.test/v//  ";
      const a = await issue([L(1)]).expect(200);
      expect(puts()[0][1].certificates[0].checkurl).toBe(`https://admin.example.test/v/${a.body.data.issued[0].shortcode}`);
      delete process.env.CERTIFICATE_CHECK_URL;
      await issue([L(4)]).expect(200);
      expect(puts()[1][1].certificates[0].checkurl).toBeNull();
    });
  });

  describe("GET /certificates/verify/:shortcode", () => {
    const row = () =>
      issueRow(L(1), {
        shortcode: "7Q2M-9KXA", certificateid: uuid(890), standardid: K_1, issuedat: new Date("2026-11-03T04:05:06.000Z"),
        snapshot: { learnername: "សុខា ចាន់", curriculumname: "ភាសាខ្មែរ", scopename: "មេរៀនទី២", tierlabel: "Module", classname: "ថ្នាក់ក", organisationname: "Mekong Learning Group", schoolname: "សាលាក", quizcount: 4 },
      });
    const valid = {
      error: false,
      data: { status: "valid", learnername: "សុខា ចាន់", scope: "level", tierlabel: "Module", scopename: "មេរៀនទី២", curriculumname: "ភាសាខ្មែរ", classname: "ថ្នាក់ក", organisationname: "Mekong Learning Group", schoolname: "សាលាក", issuedat: "2026-11-03T04:05:06.000Z", shortcode: "7Q2M-9KXA", look: "school" },
    };
    it("a valid code answers with exactly the snapshot's fields, no sign-in", async () => {
      row();
      const res = await send(null, "get", "/certificates/verify/7Q2M-9KXA").expect(200);
      expect(res.body).toEqual(valid);
      const text = JSON.stringify(res.body);
      for (const leak of ["studentid", "organisationid", "certificateid", "reason", "issuedby", L(1), X, uuid(890)]) expect(text).not.toContain(leak);
    });
    it("look is corporate when the organisation's theme is corporate, school otherwise", async () => {
      row();
      db.tables.organisations.find((o) => o.organisationid === X)!.uitheme = "corporate";
      expect((await send(null, "get", "/certificates/verify/7Q2M-9KXA").expect(200)).body).toEqual({ ...valid, data: { ...valid.data, look: "corporate" } });
      db.tables.organisations.find((o) => o.organisationid === X)!.uitheme = "kids";
      expect((await send(null, "get", "/certificates/verify/7Q2M-9KXA").expect(200)).body.data.look).toBe("school");
    });
    it("is rate limited by the throttler guard", () => {
      const handler = CertificateVerifyController.prototype.verify;
      expect(Reflect.getMetadata("__guards__", handler)).toContain(ThrottlerGuard);
      expect(Reflect.getMetadata("THROTTLER:LIMIT", handler)).toBe(30);
      expect(Reflect.getMetadata("THROTTLER:TTL", handler)).toBe(60);
    });
    it("lower case and no dash work", async () => {
      row();
      expect((await send(null, "get", "/certificates/verify/7q2m-9kxa").expect(200)).body).toEqual(valid);
      expect((await send(null, "get", "/certificates/verify/7q2m9kxa").expect(200)).body).toEqual(valid);
    });
    it("a revoked one says only that, when, and the code", async () => {
      row();
      db.tables.certificates[0].revokedat = new Date("2026-11-05T00:00:00.000Z");
      db.tables.certificates[0].revokereason = "secret reason";
      const res = await send(null, "get", "/certificates/verify/7Q2M-9KXA").expect(200);
      expect(res.body).toEqual({ error: false, data: { status: "revoked", revokedat: "2026-11-05T00:00:00.000Z", shortcode: "7Q2M-9KXA" } });
      expect(JSON.stringify(res.body)).not.toContain("look");
    });
    it("an unknown code and a malformed one are the same 404", async () => {
      row();
      const unknown = await send(null, "get", "/certificates/verify/ZZZZ-ZZZZ").expect(404);
      for (const bad of ["nonsense", "7Q2M-9KX", "7Q2M-9KXI", "7Q2M-9KXAA", "%20"]) {
        const res = await send(null, "get", `/certificates/verify/${bad}`).expect(404);
        expect(noRef(res.body)).toEqual(noRef(unknown.body));
      }
    });
  });
});
