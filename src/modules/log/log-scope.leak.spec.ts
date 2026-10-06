import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import archiver from "archiver";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { AWSService } from "src/services/aws.service";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { LOG_ZIP_PASSWORD, LogController } from "./log.controller";

/**
 * A teacher's zip of learner logs (`PUT log/import`) may hold rows of learners of the teacher's own school and of
 * no other. Driven over real HTTP through the real strategy, guards, controller and business classes, with a real
 * password-protected zip; replaced are the models (an in-memory copy of the tables), the token lookup, the
 * transaction and the object store.
 *
 * Fixtures: schools X and Y (of two organisations) and a school with no organisation; each has a learner with a
 * login, and X has a second learner, a deleted learner and a teacher; Y has a teacher.
 *
 * Every row type that names a learner is tried with a learner of another school, an unknown learner and a deleted
 * learner: the whole upload is refused (400), nothing is written, and the refusal says nothing about who the
 * learner is. The rows of the teacher's own school are imported as before.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const S_X = uuid(201);
const S_Y = uuid(202);
const S_U = uuid(203); // no organisation
const STU_X = uuid(401);
const STU_X2 = uuid(402);
const STU_X_GONE = uuid(403); // deleted, school X
const STU_Y = uuid(404);
const STU_U = uuid(405);
const USR_X = uuid(411); // the logins of the learners
const USR_X2 = uuid(412);
const USR_X_GONE = uuid(413);
const USR_Y = uuid(414);
const USR_U = uuid(415);
const TCH_X = uuid(421);
const TCH_Y = uuid(422);
const TCH_NO_SCHOOL = uuid(423);
const SP_X = uuid(601); // a stored result of an X learner
const SP_Y = uuid(602); // a stored result of a Y learner
const MISSING = uuid(999);

const db = new ContentFake();
const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const teacher = (schooluserid: string) => bearer({ schooluserid, schoolusername: "teacher", schooluserrole: SchoolRole.TEACHER });

type Row = Record<string, unknown>;
const KHMER = "សុខា";
let n = 0;
const next = () => uuid(9000 + ++n);

// one row of each kind, for a learner (`studentid`) whose login is `schooluserid`
const rows = {
  access: (_s: string, login: string) => ({ rpiuseraccessid: next(), userid: login, logintime: "2026-09-01T01:00:00.000Z", ipaddress: "10.0.0.2", timespent: 60, status: 3 }),
  result: (s: string, _l: string, questions: Row[] = []) => ({ studentprogressid: next(), studentid: s, ispass: 1, studentprogressreferenceid: next(), starttime: "2026-09-01T01:00:00.000Z", progresstype: 1, resultpercentage: 100, marks: 1, points: 1, fullpoints: 1, scores: 1, studentprogressquestions: questions }),
  studentactives: (s: string) => ({ studentactiveid: next(), studentid: s, referenceid: next(), referencetype: 1 }),
  studentlearningprogress: (s: string, l: string) => ({ studentlearningprogressid: next(), studentid: s, userid: l, lessonlearningid: next(), progress: 1 }),
  studentgradesprogress: (s: string) => ({ studentgradeprogressid: next(), studentid: s, gradeid: next(), curriculumid: next(), completed: 1 }),
  studentlevelsprogress: (s: string) => ({ studentlevelprogressid: next(), studentid: s, levelid: next(), gradeid: next(), curid: next(), completed: 1 }),
  studentlessonsprogress: (s: string) => ({ studentlessonprogressid: next(), studentid: s, lessonid: next(), levelid: next(), gradeid: next(), curid: next(), completed: 1 }),
  studentpoints: (s: string) => ({ studentpointid: next(), studentid: s, levelid: next(), lessonid: next(), totalgradepoints: 1 }),
  studentappusages: (_s: string, login: string) => ({ studentappusageid: next(), schooluserid: login, time_spent: 30 }),
} as const;
type Kind = keyof typeof rows;
const PROGRESS_KINDS: Kind[] = ["studentactives", "studentlearningprogress", "studentgradesprogress", "studentlevelsprogress", "studentlessonsprogress", "studentpoints", "studentappusages"];
const KINDS: Kind[] = ["access", "result", ...PROGRESS_KINDS];
const TABLE_OF: Record<Kind, string> = {
  access: "rpiuseraccess", result: "studentprogress", studentactives: "studentactives", studentlearningprogress: "studentlearningprogress",
  studentgradesprogress: "studentgradesprogress", studentlevelsprogress: "studentlevelsprogress", studentlessonsprogress: "studentlessonsprogress",
  studentpoints: "studentpoints", studentappusages: "studentappusages",
};

/** A learner of the fixtures: the id the rows carry as `studentid`, and the login they carry as a login id. */
const who = {
  x: [STU_X, USR_X], x2: [STU_X2, USR_X2], gone: [STU_X_GONE, USR_X_GONE], y: [STU_Y, USR_Y], u: [STU_U, USR_U], unknown: [MISSING, uuid(998)],
} as const;
type Learner = keyof typeof who;

/** The `log.ini` document: `rowsFor` the given kinds and learners; the others empty. */
const logOf = (...parts: Array<[Kind, Learner]>) => {
  const log: { access: Row[]; result: Row[]; progress: Record<string, Row[]> } = {
    access: [], result: [],
    progress: { studentactives: [], studentlearningprogress: [], studentgradesprogress: [], studentlevelsprogress: [], studentlessonsprogress: [], studentpoints: [], studentappusages: [] },
  };
  for (const [kind, learner] of parts) {
    const row = rows[kind](who[learner][0], who[learner][1]);
    if (kind === "access") log.access.push(row);
    else if (kind === "result") log.result.push(row);
    else log.progress[kind].push(row);
  }
  return { log };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
archiver.registerFormat("zip-encrypted", require("archiver-zip-encrypted"));

/** A zip as a teacher's device makes one: `log.ini` inside, under the upload password. */
const zipOf = (logdata: object) =>
  new Promise<Buffer>((resolve, reject) => {
    const archive = archiver.create("zip-encrypted" as never, { zlib: { level: 8 }, encryptionMethod: "zip20", password: LOG_ZIP_PASSWORD } as never);
    const chunks: Buffer[] = [];
    archive.on("data", (c: Buffer) => chunks.push(c));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.append(JSON.stringify(logdata), { name: "log.ini" });
    void archive.finalize();
  });

const seed = () => {
  const login = (schooluserid: string, school: string, role: SchoolRole, name: string) =>
    db.add("schoolusers", { schooluserid, schoolusername: name, schooluserrole: role, schoolid: school, schooluserstatus: true, isdisabled: false, schooluserpasswordhash: "hash" });
  const learner = (studentid: string, schooluserid: string, school: string, extra: Row = {}) =>
    db.add("students", { studentid, schooluserid, schoolid: school, studentfirstname: KHMER, studentlastname: "ចាន់", isactive: 1, ...extra });
  login(USR_X, S_X, SchoolRole.STUDENT, "learnerx");
  login(USR_X2, S_X, SchoolRole.STUDENT, "learnerx2");
  login(USR_X_GONE, S_X, SchoolRole.STUDENT, "learnergone");
  login(USR_Y, S_Y, SchoolRole.STUDENT, "learnery");
  login(USR_U, S_U, SchoolRole.STUDENT, "learneru");
  login(TCH_X, S_X, SchoolRole.TEACHER, "teacherx");
  login(TCH_Y, S_Y, SchoolRole.TEACHER, "teachery");
  db.add("schoolusers", { schooluserid: TCH_NO_SCHOOL, schoolusername: "teachernone", schooluserrole: SchoolRole.TEACHER, schoolid: null, schooluserstatus: true, isdisabled: false, schooluserpasswordhash: "hash" });
  learner(STU_X, USR_X, S_X);
  learner(STU_X2, USR_X2, S_X);
  learner(STU_X_GONE, USR_X_GONE, S_X, { isdeleted: true });
  learner(STU_Y, USR_Y, S_Y);
  learner(STU_U, USR_U, S_U);
  db.add("studentprogress", { studentprogressid: SP_X, studentid: STU_X, ispass: 1 });
  db.add("studentprogress", { studentprogressid: SP_Y, studentid: STU_Y, ispass: 1 });
};

describe("a teacher's log upload is confined to the teacher's school", () => {
  let app: INestApplication;
  let originalEnabled: string | undefined;

  beforeAll(async () => {
    originalEnabled = process.env.LOG_IMPORT_ENABLED;
    process.env.LOG_IMPORT_ENABLED = "true";
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ controllers: [LogController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0);
  });
  afterAll(async () => {
    if (originalEnabled === undefined) delete process.env.LOG_IMPORT_ENABLED;
    else process.env.LOG_IMPORT_ENABLED = originalEnabled;
    await app.close();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    tokenExists.mockResolvedValue(true);
    transaction.commit.mockClear();
    transaction.rollback.mockClear();
    db.install();
    seed();
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    jest.spyOn(AWSService, "uploadS3").mockResolvedValue({ Location: "stored" } as never);
  });

  const upload = async (token: string, logdata: object) =>
    request(app.getHttpServer()).put("/log/import").set("Authorization", token).set("Connection", "close").attach("importfile", await zipOf(logdata), "log.zip");

  /** Refused (400, FILE_REJECTED) with nothing written and the transaction never opened. */
  const refused = async (token: string, logdata: object) => {
    const before = db.snapshot();
    const res = await upload(token, logdata);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("FILE_REJECTED");
    expect(db.snapshot()).toEqual(before);
    db.nothingCreated();
    expect(dbinstance.getdbinstance().transaction).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    return res;
  };

  describe("PUT /log/import", () => {
    it("a teacher of X's school: rows of every kind for X's learners, and the login of X's teacher, are imported", async () => {
      const logdata = logOf(...KINDS.map((k) => [k, "x"] as [Kind, Learner]), ["access", "x2"], ["studentappusages", "x2"]);
      logdata.log.access.push({ ...rows.access("", TCH_X) });
      logdata.log.result[0].studentprogressquestions = [{ studentprogressid: logdata.log.result[0].studentprogressid, studentprogressquestionid: next(), tries: 1, iscorrect: 1, referencequestionid: next() }];
      const res = await upload(teacher(TCH_X), logdata).then((r) => r);
      expect(res.status).toBe(200);
      expect(res.body.data).toBe(true);
      for (const kind of KINDS) expect(db.createdIn(TABLE_OF[kind] as never).length).toBeGreaterThan(0);
      expect(db.createdIn("studentprogressquestions")).toHaveLength(1);
      expect(db.createdIn("syncs")).toHaveLength(1);
      expect(db.createdIn("syncs")[0]).toMatchObject({ created_by: TCH_X });
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    it("a teacher of Y's school may upload Y's learners", async () => {
      expect((await upload(teacher(TCH_Y), logOf(["result", "y"], ["studentactives", "y"], ["access", "y"]))).status).toBe(200);
    });

    it("a teacher of Y's school may not upload X's learners", async () => {
      await refused(teacher(TCH_Y), logOf(["result", "x"], ["access", "x"]));
    });

    it("an upload with no rows is accepted: it names no learner", async () => {
      expect((await upload(teacher(TCH_X), logOf())).status).toBe(200);
    });

    describe.each(KINDS)("a %s row", (kind) => {
      it.each(["y", "u", "unknown", "gone"] as Learner[])("of a learner who is %s (another school, no organisation, not there, deleted) refuses the whole upload, which holds X's own rows too", async (other) => {
        await refused(teacher(TCH_X), logOf(["result", "x"], ["studentactives", "x"], [kind, other], ["access", "x"]));
      });
    });

    it("the refusal names no id and no name, and is the same whichever learner it was", async () => {
      const bodies: string[] = [];
      for (const other of ["y", "u", "unknown", "gone"] as Learner[]) {
        const res = await refused(teacher(TCH_X), logOf(["result", other]));
        const { reference, logid, stack, ...rest } = res.body as Row;
        bodies.push(JSON.stringify(rest));
        for (const secret of [...who[other], S_Y, S_U, KHMER, "learnery"]) expect(res.text).not.toContain(secret);
      }
      expect(new Set(bodies).size).toBe(1);
    });

    it("a question that belongs to a result of another school's learner (named by id, not carried with it) refuses the upload", async () => {
      const own = rows.result(STU_X, USR_X, [{ studentprogressid: SP_Y, studentprogressquestionid: next(), tries: 1, iscorrect: 1, referencequestionid: next() }]);
      await refused(teacher(TCH_X), { log: { access: [], result: [own], progress: logOf().log.progress } });
    });

    it("a question that belongs to a stored result of X's own learner is imported", async () => {
      const own = rows.result(STU_X, USR_X, [{ studentprogressid: SP_X, studentprogressquestionid: next(), tries: 1, iscorrect: 1, referencequestionid: next() }]);
      expect((await upload(teacher(TCH_X), { log: { access: [], result: [own], progress: logOf().log.progress } })).status).toBe(200);
    });

    it("a question that belongs to a result that is not there refuses the upload", async () => {
      const own = rows.result(STU_X, USR_X, [{ studentprogressid: MISSING, studentprogressquestionid: next(), tries: 1, iscorrect: 1, referencequestionid: next() }]);
      await refused(teacher(TCH_X), { log: { access: [], result: [own], progress: logOf().log.progress } });
    });

    it("a row with no learner id, or one that is not an id, refuses the upload", async () => {
      for (const bad of [undefined, null, "", 7, { studentid: STU_X }, [STU_X]]) {
        const logdata = logOf(["studentactives", "x"]);
        (logdata.log.progress.studentactives[0] as Row).studentid = bad;
        await refused(teacher(TCH_X), logdata);
      }
    });

    it("a section that is not a list of rows refuses the upload", async () => {
      for (const bad of ["x", { a: 1 }, [1], [null]]) {
        const logdata = logOf(["access", "x"]);
        (logdata.log as Row).access = bad;
        await refused(teacher(TCH_X), logdata);
      }
    });

    it("the learner's id is read from the row as given: another school's learner under X's school's name is still refused", async () => {
      const logdata = logOf(["result", "y"]);
      (logdata.log.result[0] as Row).schoolname = "សាលាបឋមសិក្សា ក";
      (logdata.log.result[0] as Row).schoolid = S_X;
      await refused(teacher(TCH_X), logdata);
    });

    it("a teacher whose login names no school has no learners to upload for", async () => {
      await refused(teacher(TCH_NO_SCHOOL), logOf(["result", "x"]));
    });

    it("the teacher's school is the one on the teacher's login row, not a school name or id the token carries", async () => {
      const token = bearer({ schooluserid: TCH_Y, schooluserrole: SchoolRole.TEACHER, schoolname: "សាលាបឋមសិក្សា ក", schoolid: S_X });
      await refused(token, logOf(["result", "x"]));
    });

    it("a teacher login that is deleted, disabled or not there is refused before the rows are read", async () => {
      db.tables.schoolusers.find((s) => s.schooluserid === TCH_X)!.isdeleted = true;
      const gone = await upload(teacher(TCH_X), logOf(["result", "x"]));
      expect(gone.status).toBe(403);
      const missing = await upload(teacher(MISSING), logOf(["result", "x"]));
      expect(missing.status).toBe(404);
      db.nothingCreated();
    });
  });
});
