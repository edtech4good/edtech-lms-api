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
import { assertLogRowsInSchool, findInChunks } from "src/business/log-scope";
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
const STU_Y_GONE = uuid(406); // deleted, school Y
const USR_Y_GONE = uuid(416);
const USR_Y = uuid(414);
const USR_U = uuid(415);
const STU_XY = uuid(407); // a learner of X whose login row is in Y
const USR_XY = uuid(417);
const STU_YX = uuid(408); // a learner of Y whose login row is in X
const USR_YX = uuid(418);
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
  x: [STU_X, USR_X], x2: [STU_X2, USR_X2], gone: [STU_X_GONE, USR_X_GONE], ygone: [STU_Y_GONE, USR_Y_GONE], xy: [STU_XY, USR_XY], yx: [STU_YX, USR_YX], y: [STU_Y, USR_Y], u: [STU_U, USR_U], unknown: [MISSING, uuid(998)],
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
  login(USR_Y_GONE, S_Y, SchoolRole.STUDENT, "learnerygone");
  login(USR_Y, S_Y, SchoolRole.STUDENT, "learnery");
  login(USR_U, S_U, SchoolRole.STUDENT, "learneru");
  login(TCH_X, S_X, SchoolRole.TEACHER, "teacherx");
  login(TCH_Y, S_Y, SchoolRole.TEACHER, "teachery");
  db.add("schoolusers", { schooluserid: TCH_NO_SCHOOL, schoolusername: "teachernone", schooluserrole: SchoolRole.TEACHER, schoolid: null, schooluserstatus: true, isdisabled: false, schooluserpasswordhash: "hash" });
  login(USR_XY, S_Y, SchoolRole.STUDENT, "learnerxy");
  login(USR_YX, S_X, SchoolRole.STUDENT, "learneryx");
  learner(STU_XY, USR_XY, S_X);
  learner(STU_YX, USR_YX, S_Y);
  learner(STU_X, USR_X, S_X);
  learner(STU_X2, USR_X2, S_X);
  learner(STU_X_GONE, USR_X_GONE, S_X, { isdeleted: true });
  learner(STU_Y_GONE, USR_Y_GONE, S_Y, { isdeleted: true });
  // a deleted learner's login is deleted with them
  for (const id of [USR_X_GONE, USR_Y_GONE]) db.tables.schoolusers.find((u) => u.schooluserid === id)!.isdeleted = true;
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
      it.each(["y", "u", "unknown", "ygone"] as Learner[])("of a learner who is %s (another school, no organisation, not there, deleted in another school) refuses the whole upload, which holds X's own rows too", async (other) => {
        await refused(teacher(TCH_X), logOf(["result", "x"], ["studentactives", "x"], [kind, other], ["access", "x"]));
      });
      it("of a learner of X's school who has been deleted is imported with the rest (the export carries history)", async () => {
        const res = await upload(teacher(TCH_X), logOf(["result", "x"], [kind, "gone"]));
        expect(res.status).toBe(200);
        expect(db.createdIn(TABLE_OF[kind] as never).length).toBeGreaterThan(0);
      });
    });

    it("a learning-progress row of X's own learner that carries another school's login or learner as its `userid` refuses the upload", async () => {
      for (const foreign of [USR_Y, STU_Y, TCH_Y, USR_Y_GONE, STU_Y_GONE, MISSING]) {
        const logdata = logOf(["studentlearningprogress", "x"]);
        (logdata.log.progress.studentlearningprogress[0] as Row).userid = foreign;
        await refused(teacher(TCH_X), logdata);
      }
      for (const own of [USR_X, STU_X, TCH_X, USR_X_GONE, STU_X_GONE, null]) {
        const logdata = logOf(["studentlearningprogress", "x"]);
        (logdata.log.progress.studentlearningprogress[0] as Row).userid = own;
        expect((await upload(teacher(TCH_X), logdata)).status).toBe(200);
      }
    });

    it("an access or usage row that names another school's teacher login, or one that is nobody's, refuses the upload", async () => {
      for (const foreign of [TCH_Y, USR_Y_GONE, MISSING]) {
        const access = logOf(["access", "x"]);
        (access.log.access[0] as Row).userid = foreign;
        await refused(teacher(TCH_X), access);
        const usage = logOf(["studentappusages", "x"]);
        (usage.log.progress.studentappusages[0] as Row).schooluserid = foreign;
        await refused(teacher(TCH_X), usage);
      }
    });

    // Every table is written by the primary key the upload gives, so a row that carries the key of a STORED row also names that row's learner.
    const PK: Record<Kind, string> = {
      access: "rpiuseraccessid", result: "studentprogressid", studentactives: "studentactiveid", studentlearningprogress: "studentlearningprogressid",
      studentgradesprogress: "studentgradeprogressid", studentlevelsprogress: "studentlevelprogressid", studentlessonsprogress: "studentlessonprogressid",
      studentpoints: "studentpointid", studentappusages: "studentappusageid",
    };
    const sectionOf = (logdata: ReturnType<typeof logOf>, kind: Kind): Row[] =>
      kind === "access" ? logdata.log.access : kind === "result" ? logdata.log.result : logdata.log.progress[kind];
    const STORED_KEY = uuid(7001);
    const storedRow = (kind: Kind) => db.tables[TABLE_OF[kind]].filter((r) => r[PK[kind]] === STORED_KEY);

    describe.each(KINDS)("a %s row that carries the key of a stored row", (kind) => {
      const upload_ = (logdata: ReturnType<typeof logOf>) => {
        sectionOf(logdata, kind)[0][PK[kind]] = STORED_KEY;
        return logdata;
      };
      it.each(["y", "ygone", "u"] as Learner[])("that belongs to a learner of another school (%s), under X's learner, is refused and the stored row is left as it was", async (owner) => {
        db.add(TABLE_OF[kind] as never, { ...rows[kind](who[owner][0], who[owner][1]), [PK[kind]]: STORED_KEY });
        const before = JSON.stringify(storedRow(kind));
        await refused(teacher(TCH_X), upload_(logOf([kind, "x"])));
        expect(JSON.stringify(storedRow(kind))).toBe(before);
      });
      it("that belongs to a learner of X's school is updated in place, not added", async () => {
        db.add(TABLE_OF[kind] as never, { ...rows[kind](STU_X2, USR_X2), [PK[kind]]: STORED_KEY });
        expect((await upload(teacher(TCH_X), upload_(logOf([kind, "x"])))).status).toBe(200);
        expect(storedRow(kind)).toHaveLength(1);
        expect(storedRow(kind)[0]).toMatchObject(kind === "access" ? { userid: USR_X } : kind === "studentappusages" ? { schooluserid: USR_X } : { studentid: STU_X });
      });
      it("that belongs to nobody is a new row", async () => {
        expect((await upload(teacher(TCH_X), upload_(logOf([kind, "x"])))).status).toBe(200);
        expect(storedRow(kind)).toHaveLength(1);
      });
    });

    it("a learning-progress row of X's own learner that carries the key of a stored row whose `userid` is another school's is refused", async () => {
      db.add("studentlearningprogress", { ...rows.studentlearningprogress(STU_X, USR_Y), studentlearningprogressid: STORED_KEY });
      const logdata = logOf(["studentlearningprogress", "x"]);
      logdata.log.progress.studentlearningprogress[0].studentlearningprogressid = STORED_KEY;
      await refused(teacher(TCH_X), logdata);
    });

    describe("a question", () => {
      const withQuestion = (parent: string | null, key: string = STORED_KEY) => {
        const result = rows.result(STU_X, USR_X);
        const own = parent ?? (result.studentprogressid as string);
        result.studentprogressquestions = [{ studentprogressid: own, studentprogressquestionid: key, tries: 2, iscorrect: 1, referencequestionid: next() }];
        return { log: { access: [], result: [result], progress: logOf().log.progress } };
      };
      const storedQuestion = () => db.tables.studentprogressquestions.filter((q) => q.studentprogressquestionid === STORED_KEY);
      it("that carries the key of a stored question of another school's result, under X's own result, is refused and the stored question is left as it was", async () => {
        db.add("studentprogressquestions", { studentprogressquestionid: STORED_KEY, studentprogressid: SP_Y, tries: 1, iscorrect: 0, referencequestionid: next() });
        const before = JSON.stringify(storedQuestion());
        await refused(teacher(TCH_X), withQuestion(null));
        expect(JSON.stringify(storedQuestion())).toBe(before);
      });
      it("that carries the key of a stored question of X's own result is updated in place", async () => {
        db.add("studentprogressquestions", { studentprogressquestionid: STORED_KEY, studentprogressid: SP_X, tries: 1, iscorrect: 0, referencequestionid: next() });
        expect((await upload(teacher(TCH_X), withQuestion(null))).status).toBe(200);
        expect(storedQuestion()).toHaveLength(1);
        expect(storedQuestion()[0]).toMatchObject({ tries: 2 });
      });
      it("whose key is missing or not a string refuses the upload", async () => {
        for (const bad of [undefined, null, "", 7]) {
          const logdata = withQuestion(null);
          (logdata.log.result[0].studentprogressquestions as Row[])[0].studentprogressquestionid = bad;
          await refused(teacher(TCH_X), logdata);
        }
      });
    });

    it("a row whose primary key is missing or not a string refuses the upload, whatever the table", async () => {
      for (const kind of KINDS) {
        for (const bad of [undefined, null, "", 7]) {
          const logdata = logOf([kind, "x"]);
          sectionOf(logdata, kind)[0][PK[kind]] = bad;
          await refused(teacher(TCH_X), logdata);
        }
      }
    });

    it("a login whose learner row and login row are in different schools is refused (either way round), as a login id and as a learning-progress `userid`", async () => {
      for (const odd of ["xy", "yx"] as Learner[]) {
        for (const kind of ["access", "studentappusages"] as Kind[]) await refused(teacher(TCH_X), logOf([kind, odd]));
        const logdata = logOf(["studentlearningprogress", "x"]);
        (logdata.log.progress.studentlearningprogress[0] as Row).userid = who[odd][1];
        await refused(teacher(TCH_X), logdata);
      }
    });

    it("a login that two learner rows own is refused when either row is in another school, and accepted when both are in the school", async () => {
      db.add("students", { studentid: uuid(409), schooluserid: USR_X, schoolid: S_Y, studentfirstname: KHMER, isactive: 1 });
      await refused(teacher(TCH_X), logOf(["access", "x"]));
      await refused(teacher(TCH_X), logOf(["studentappusages", "x"]));
      db.tables.students.find((s) => s.studentid === uuid(409))!.schoolid = S_X;
      expect((await upload(teacher(TCH_X), logOf(["access", "x"], ["studentappusages", "x"]))).status).toBe(200);
    });

    it("the refusal names no id and no name, and is the same whichever learner it was", async () => {
      const bodies: string[] = [];
      for (const other of ["y", "u", "unknown", "ygone"] as Learner[]) {
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
      db.tables.schoolusers.find((s) => s.schooluserid === TCH_X)!.isdeleted = false;
      db.tables.schoolusers.find((s) => s.schooluserid === TCH_X)!.isdisabled = true;
      const disabled = await upload(teacher(TCH_X), logOf(["result", "x"]));
      expect(disabled.status).toBe(403);
      const missing = await upload(teacher(MISSING), logOf(["result", "x"]));
      expect(missing.status).toBe(404);
      db.nothingCreated();
    });
  });
});

describe("the lookups of a log upload go in chunks", () => {
  it("findInChunks looks up every id, in pieces of at most the size, and joins the answers", async () => {
    const calls: string[][] = [];
    const found = await findInChunks(["a", "b", "c", "d", "e"], async (chunk) => {
      calls.push(chunk);
      return chunk.map((id) => id.toUpperCase());
    }, 2);
    expect(calls).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(found).toEqual(["A", "B", "C", "D", "E"]);
    expect(await findInChunks([], async () => { throw new Error("no lookup for no ids"); }, 2)).toEqual([]);
    expect(await findInChunks(new Set(["a"]), async (chunk) => chunk, 5000)).toEqual(["a"]);
  });

  describe("assertLogRowsInSchool with a chunk size of 2", () => {
    const db = new ContentFake();
    beforeEach(() => {
      jest.restoreAllMocks();
      db.install();
      seed_(db);
    });
    // seven learners of X and one of Y: far more ids than one chunk holds
    const seed_ = (fake: ContentFake) => {
      for (let i = 0; i < 7; i++) {
        fake.add("students", { studentid: uuid(8100 + i), schooluserid: uuid(8200 + i), schoolid: S_X, isactive: 1 });
        fake.add("schoolusers", { schooluserid: uuid(8200 + i), schoolid: S_X, schooluserrole: SchoolRole.STUDENT });
        fake.add("studentprogress", { studentprogressid: uuid(8300 + i), studentid: uuid(8100 + i) });
      }
      fake.add("students", { studentid: uuid(8110), schooluserid: uuid(8210), schoolid: S_Y, isactive: 1 });
      fake.add("schoolusers", { schooluserid: uuid(8210), schoolid: S_Y, schooluserrole: SchoolRole.STUDENT });
      fake.add("studentprogress", { studentprogressid: uuid(8310), studentid: uuid(8110) });
    };
    const teacherRow = { schoolid: S_X } as never;
    const result = (n: number, studentid: string, id = uuid(8400 + n)) => ({ studentprogressid: id, studentid });
    const log = (...rows: Row[]) => ({ log: { access: [], result: rows, progress: {} } });

    it("accepts rows of seven learners (several chunks), and a row of another school's learner in the last chunk is still refused", async () => {
      const own = Array.from({ length: 7 }, (_, i) => result(i, uuid(8100 + i)));
      await expect(assertLogRowsInSchool(teacherRow, log(...own), 2)).resolves.toBeUndefined();
      await expect(assertLogRowsInSchool(teacherRow, log(...own, result(7, uuid(8110))), 2)).rejects.toMatchObject({ code: "FILE_REJECTED" });
    });

    it("a stored row of another school's learner, reached by the key of the last row of the upload, is still found", async () => {
      const own = Array.from({ length: 7 }, (_, i) => result(i, uuid(8100 + i)));
      own[6].studentprogressid = uuid(8310);
      await expect(assertLogRowsInSchool(teacherRow, log(...own), 2)).rejects.toMatchObject({ code: "FILE_REJECTED" });
    });
  });
});
