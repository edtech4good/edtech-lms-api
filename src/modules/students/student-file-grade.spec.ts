import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import axios from "axios";
import { csv2json } from "json-2-csv";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { StudentController } from "./student.controller";

/**
 * A learner's grade on the two file routes: Upload Users (POST /student/create, one grade for the whole file) and Upload Edited
 * Students (PUT /student/update, a `grade` column holding the grade's NAME), and the download (GET /student/download-students)
 * that writes the same column. Driven over real HTTP through the real guards, controller and business classes; replaced are the
 * models (an in-memory copy of the tables), the token lookup, the transaction and the student server.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn() } }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = uuid(101);
const S_X = uuid(201);
const NAME_X = "សាលាបឋមសិក្សា ក";
const K_X = uuid(501);
const KLASS = "ថ្នាក់ទី១";
const CUR_ONE = uuid(301); // one grade
const CUR_ONE_B = uuid(302); // one grade
const CUR_TWO = uuid(303); // two grades
const CUR_NONE = uuid(304); // no grade
const CUR_DEL = uuid(305); // its only grade is deleted
const CUR_Y = uuid(306); // another organisation's
const NAME = {
  [CUR_ONE]: "ភាសាខ្មែរ ក",
  [CUR_ONE_B]: "ភាសាខ្មែរ ខ",
  [CUR_TWO]: "ភាសាខ្មែរ គ",
  [CUR_NONE]: "ភាសាខ្មែរ ឃ",
  [CUR_DEL]: "ភាសាខ្មែរ ង",
  [CUR_Y]: "ភាសាខ្មែរ ច",
} as Record<string, string>;
const G_ONE = uuid(601);
const G_ONE_B = uuid(602);
const G_TWO_A = uuid(603);
const G_TWO_B = uuid(604);
const G_DEL = uuid(605);
const G_Y = uuid(606);
const GRADE_NAME = { A: "ថ្នាក់ទី១", B: "ថ្នាក់ទី២" };
const L1 = { studentid: uuid(401), schooluserid: uuid(411), username: "learner1" };
const L2 = { studentid: uuid(402), schooluserid: uuid(412), username: "learner2" };
const MISSING = uuid(999);

const db = new ContentFake();
const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };
const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002];
const ADMIN = bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false });

type Row = Record<string, unknown>;
const withoutReference = (body: Row) => {
  const { reference, logid, stack, ...rest } = body;
  return rest;
};

const addCurriculum = (id: string, owner: string, over: Row = {}) =>
  db.add("curriculums", { curriculumid: id, curriculumname: NAME[id], organisationid: owner, curriculumstatus: true, ...over });
const addGrade = (gradeid: string, curriculumid: string, gradename: string, gradeorder: number, over: Row = {}) =>
  db.add("grades", { gradeid, curriculumid, gradename, gradeorder, gradestatus: true, isdeleted: false, ...over });

const seed = () => {
  db.add("organisations", { organisationid: X });
  db.add("organisations", { organisationid: Y });
  db.add("countries", { countryid: C1, countryname: "កម្ពុជា", expectedusage: 1 });
  db.add("organisationcountry", { organisationcountryid: uuid(701), organisationid: X, countryid: C1 });
  for (const id of [CUR_ONE, CUR_ONE_B, CUR_TWO, CUR_NONE, CUR_DEL]) addCurriculum(id, X);
  addCurriculum(CUR_Y, Y);
  // an enrolment needs a published curriculum: every curriculum these specs enrol into is one
  for (const id of [CUR_ONE, CUR_ONE_B, CUR_TWO, CUR_NONE, CUR_DEL]) db.publish(id, X);
  db.publish(CUR_Y, Y);
  addGrade(G_ONE, CUR_ONE, GRADE_NAME.A, 1);
  addGrade(G_ONE_B, CUR_ONE_B, GRADE_NAME.A, 1);
  addGrade(G_TWO_A, CUR_TWO, GRADE_NAME.A, 1);
  addGrade(G_TWO_B, CUR_TWO, GRADE_NAME.B, 2);
  addGrade(G_DEL, CUR_DEL, GRADE_NAME.A, 1, { isdeleted: true });
  addGrade(G_Y, CUR_Y, GRADE_NAME.A, 1);
  db.add("schools", { schoolid: S_X, schoolname: NAME_X, organisationid: X, countryid: C1, curriculums: [CUR_ONE] });
  db.add("standards", { standardid: K_X, standardname: KLASS, schoolid: S_X, schoolname: NAME_X });
  const learner = (l: typeof L1, curriculumid: string, gradeid: string | null) => {
    db.add("schoolusers", { schooluserid: l.schooluserid, schoolusername: l.username, schooluserrole: SchoolRole.STUDENT, schoolid: S_X, schoolname: NAME_X, schooluserstatus: true, isdisabled: false, schooluserpasswordhash: "hash" });
    db.add("students", {
      studentid: l.studentid, schooluserid: l.schooluserid, schoolid: S_X, schoolname: NAME_X, studentfirstname: "សុខា", studentlastname: "ចាន់", standard: K_X,
      curriculumid, curriculumids: [curriculumid], gradeid, genderid: 1, isactive: 1, is_teacher_acc: false, type: "online", city: "ភ្នំពេញ", country: "Cambodia",
      state: "Phnom Penh", dateofbirth: new Date(2015, 2, 9), dateofjoin: new Date(2024, 0, 1),
    });
  };
  learner(L1, CUR_TWO, G_TWO_B);
  learner(L2, CUR_ONE, G_ONE);
};

describe("a learner's grade in the file routes", () => {
  let app: INestApplication;
  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ imports: [ThrottlerModule.forRoot({ ttl: 60, limit: 1000 })], controllers: [StudentController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0);
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    tokenExists.mockResolvedValue(true);
    transaction.commit.mockReset();
    transaction.rollback.mockReset();
    db.install();
    seed();
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    (axios.put as jest.Mock).mockReset().mockResolvedValue({ status: 200, data: {} });
  });

  const send = (method: "get" | "post" | "put", path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](path).set("Authorization", ADMIN).set("Connection", "close");
    return body ? r.send(body) : r;
  };
  const refuses = async (method: "post" | "put", path: string, body: object) => {
    const before = db.snapshot();
    const res = await send(method, path, body);
    expect(db.snapshot()).toEqual(before);
    return res;
  };
  const gradeOf = (studentid: string) => db.tables.students.find((s) => s.studentid === studentid)!.gradeid;

  const CHOOSE = "Choose a grade for this student.";
  const INVALID = "Choose a grade of this curriculum.";
  const NONE = "This curriculum has no grade yet, so a learner can't be put in it.";

  describe("POST /student/create (Upload Users)", () => {
    const newRow = (n: number, over: Row = {}) => ({
      city: "ភ្នំពេញ", country: "Cambodia", dateofjoin: "01-01-2026", studentfirstname: `សុខា${n}`, genderid: "1", state: "Phnom Penh",
      schoolusername: `newlearner${n}`, schooluserpasswordhash: "pass1234", ...over,
    });
    const upload = (curriculumid: string[], over: Row = {}, rows: Row[] = [newRow(1), newRow(2)]) => ({
      curriculumid, schoolid: S_X, standard: K_X, students: rows, ...over,
    });
    const refusedOn = (res: request.Response, field: string, message: string) => {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_INPUT");
      expect(res.body.fields).toEqual([{ field, message }]);
      expect(transaction.commit).not.toHaveBeenCalled();
      db.nothingCreated();
    };

    it("(a) a curriculum with one grade and none named stores that grade on every learner of the file", async () => {
      await send("post", "/student/create", upload([CUR_ONE])).expect(200);
      expect(db.createdIn("students").map((s) => s.gradeid)).toEqual([G_ONE, G_ONE]);
    });
    it("(b) a curriculum with two grades and none named is a 400 naming gradeid, nothing written", async () => {
      refusedOn(await refuses("post", "/student/create", upload([CUR_TWO])), "gradeid", CHOOSE);
    });
    it("(c) a curriculum with two grades and a valid gradeid stores it", async () => {
      await send("post", "/student/create", upload([CUR_TWO], { gradeid: G_TWO_B })).expect(200);
      expect(db.createdIn("students").map((s) => s.gradeid)).toEqual([G_TWO_B, G_TWO_B]);
    });
    it("(d) a grade of ANOTHER curriculum of the organisation is a 400, nothing written", async () => {
      refusedOn(await refuses("post", "/student/create", upload([CUR_ONE], { gradeid: G_TWO_A })), "gradeid", INVALID);
      // the grade is one of the FIRST curriculum's
      refusedOn(await refuses("post", "/student/create", upload([CUR_ONE, CUR_TWO], { gradeid: G_TWO_A })), "gradeid", INVALID);
    });
    it("(d) another organisation's grade is the same 400 as a grade that does not exist", async () => {
      const foreign = await refuses("post", "/student/create", upload([CUR_ONE], { gradeid: G_Y }));
      const missing = await refuses("post", "/student/create", upload([CUR_ONE], { gradeid: MISSING }));
      refusedOn(foreign, "gradeid", INVALID);
      expect({ status: foreign.status, body: withoutReference(foreign.body) }).toEqual({ status: missing.status, body: withoutReference(missing.body) });
    });
    it("(e) a deleted grade is a 400", async () => {
      refusedOn(await refuses("post", "/student/create", upload([CUR_DEL], { gradeid: G_DEL })), "gradeid", INVALID);
    });
    it("(f) a curriculum with no grade, or only a deleted one, is a 400", async () => {
      refusedOn(await refuses("post", "/student/create", upload([CUR_NONE])), "gradeid", NONE);
      refusedOn(await refuses("post", "/student/create", upload([CUR_DEL])), "gradeid", NONE);
    });
    it("a primary curriculum that does not exist or is deleted is a 400 naming curriculumid, nothing written", async () => {
      refusedOn(await refuses("post", "/student/create", upload([MISSING])), "curriculumid", "Choose curricula that exist.");
      db.tables.curriculums.find((c) => c.curriculumid === CUR_ONE)!.isdeleted = true;
      refusedOn(await refuses("post", "/student/create", upload([CUR_ONE])), "curriculumid", "Choose curricula that exist.");
    });
    it("another organisation's curriculum is refused and nothing is written", async () => {
      const res = await refuses("post", "/student/create", upload([CUR_Y]));
      expect(res.status).toBe(400);
      db.nothingCreated();
    });
    it("a teacher account in the file gets the resolved grade too", async () => {
      await send("post", "/student/create", upload([CUR_ONE], {}, [newRow(1, { is_teacher_acc: "1" }), newRow(2)])).expect(200);
      expect(db.createdIn("students").map((s) => [s.is_teacher_acc, s.gradeid])).toEqual([[true, G_ONE], [false, G_ONE]]);
    });
    it("a teacher account in a file for a several-grade curriculum is refused without a grade", async () => {
      refusedOn(await refuses("post", "/student/create", upload([CUR_TWO], {}, [newRow(1, { is_teacher_acc: "1" })])), "gradeid", CHOOSE);
    });
    it("a blank gradeid counts as none", async () => {
      await send("post", "/student/create", upload([CUR_ONE], { gradeid: "" })).expect(200);
      expect(db.createdIn("students").map((s) => s.gradeid)).toEqual([G_ONE, G_ONE]);
    });
  });

  describe("PUT /student/update (Upload Edited Students)", () => {
    const rowFor = (l: typeof L1, curriculums: string, over: Row = {}) => ({
      studentid: l.studentid, schooluserid: l.schooluserid, schoolusername: l.username, schoolname: NAME_X, curriculums, standard: KLASS,
      studentfirstname: "សុខា", genderid: "1", city: "ភ្នំពេញ", country: "Cambodia", state: "Phnom Penh", dateofjoin: "01-01-2024", isactive: 1, ...over,
    });
    const update = (rows: Row[]) => send("put", "/student/update", { students: rows });
    const refusedOn = (res: request.Response, rowindex: number, message: string) => {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_INPUT");
      expect(res.body.fields).toEqual([{ field: `students.${rowindex}.grade`, message }]);
      expect(transaction.commit).not.toHaveBeenCalled();
    };
    const refusedUpdate = async (rows: Row[]) => {
      const before = db.snapshot();
      const res = await update(rows);
      expect(db.snapshot()).toEqual(before);
      return res;
    };

    it("(a) a new primary curriculum with one grade and no grade column stores that grade", async () => {
      await update([rowFor(L2, NAME[CUR_ONE_B])]).expect(200);
      expect(db.tables.students.find((s) => s.studentid === L2.studentid)).toMatchObject({ curriculumid: CUR_ONE_B, gradeid: G_ONE_B });
    });
    it("(b) a curriculum with two grades and a blank grade, for a learner that has none, is a 400 naming the row's grade, nothing written", async () => {
      db.tables.students.find((s) => s.studentid === L1.studentid)!.gradeid = null;
      refusedOn(await refusedUpdate([rowFor(L2, NAME[CUR_ONE]), rowFor(L1, NAME[CUR_TWO], { grade: "" })]), 1, CHOOSE);
    });
    it("(c) a grade name of a curriculum with two grades stores that grade, for every case and spacing of the name", async () => {
      await update([rowFor(L1, NAME[CUR_TWO], { grade: ` ${GRADE_NAME.A.toUpperCase()} ` })]).expect(200);
      expect(gradeOf(L1.studentid)).toBe(G_TWO_A);
      await update([rowFor(L1, NAME[CUR_TWO], { grade: GRADE_NAME.B })]).expect(200);
      expect(gradeOf(L1.studentid)).toBe(G_TWO_B);
    });
    it("(d) the name of a grade of ANOTHER curriculum of the organisation is a 400 naming the row's grade, nothing written", async () => {
      addGrade(uuid(607), CUR_ONE_B, "ថ្នាក់ពិសេស", 2);
      refusedOn(await refusedUpdate([rowFor(L2, NAME[CUR_ONE], { grade: "ថ្នាក់ពិសេស" })]), 0, INVALID);
      // and the row is named, not the first
      refusedOn(await refusedUpdate([rowFor(L1, NAME[CUR_TWO]), rowFor(L2, NAME[CUR_ONE], { grade: "ថ្នាក់ពិសេស" })]), 1, INVALID);
    });
    it("(d) another organisation's grade name, and a name nobody has, are the same 400", async () => {
      addGrade(uuid(608), CUR_Y, "ថ្នាក់របស់ Y", 2);
      const foreign = await refusedUpdate([rowFor(L2, NAME[CUR_ONE], { grade: "ថ្នាក់របស់ Y" })]);
      const nobody = await refusedUpdate([rowFor(L2, NAME[CUR_ONE], { grade: "ថ្នាក់ដែលមិនមាន" })]);
      refusedOn(foreign, 0, INVALID);
      expect({ status: foreign.status, body: withoutReference(foreign.body) }).toEqual({ status: nobody.status, body: withoutReference(nobody.body) });
    });
    it("(e) the name of a deleted grade is a 400", async () => {
      refusedOn(await refusedUpdate([rowFor(L2, NAME[CUR_DEL], { grade: GRADE_NAME.A })]), 0, INVALID);
    });
    it("(f) a curriculum with no grade is a 400", async () => {
      refusedOn(await refusedUpdate([rowFor(L2, NAME[CUR_NONE])]), 0, NONE);
      refusedOn(await refusedUpdate([rowFor(L2, NAME[CUR_DEL])]), 0, NONE);
    });
    it("(g) an unchanged curriculum keeps the current grade, with a blank grade or none, even when the curriculum has several", async () => {
      await update([rowFor(L1, NAME[CUR_TWO])]).expect(200);
      expect(gradeOf(L1.studentid)).toBe(G_TWO_B);
      await update([rowFor(L1, NAME[CUR_TWO], { grade: "" })]).expect(200);
      expect(gradeOf(L1.studentid)).toBe(G_TWO_B);
    });
    it("(h) a changed primary curriculum does not keep the old grade: the new curriculum's one grade is stored", async () => {
      await update([rowFor(L1, NAME[CUR_ONE_B])]).expect(200);
      expect(db.tables.students.find((s) => s.studentid === L1.studentid)).toMatchObject({ curriculumid: CUR_ONE_B, gradeid: G_ONE_B });
    });
    it("(h) a changed primary curriculum with several grades asks for a choice", async () => {
      refusedOn(await refusedUpdate([rowFor(L2, NAME[CUR_TWO])]), 0, CHOOSE);
    });
    it("a file is applied or refused as a whole: a bad grade on the second row writes nothing for the first", async () => {
      const res = await refusedUpdate([rowFor(L1, NAME[CUR_TWO], { grade: GRADE_NAME.A }), rowFor(L2, NAME[CUR_ONE], { grade: "ថ្នាក់ដែលមិនមាន" })]);
      refusedOn(res, 1, INVALID);
      expect(gradeOf(L1.studentid)).toBe(G_TWO_B);
    });
    it("a teacher row is graded like any other: a one-grade curriculum gives its grade", async () => {
      await update([rowFor(L2, NAME[CUR_ONE_B], { is_teacher_acc: "1" })]).expect(200);
      expect(db.tables.students.find((s) => s.studentid === L2.studentid)).toMatchObject({ curriculumid: CUR_ONE_B, gradeid: G_ONE_B, is_teacher_acc: true });
    });
    it("a teacher row changing to a several-grade curriculum without a grade is refused, and with a name is stored", async () => {
      refusedOn(await refusedUpdate([rowFor(L2, NAME[CUR_TWO], { is_teacher_acc: "1" })]), 0, CHOOSE);
      await update([rowFor(L2, NAME[CUR_TWO], { is_teacher_acc: "1", grade: GRADE_NAME.B })]).expect(200);
      expect(gradeOf(L2.studentid)).toBe(G_TWO_B);
    });
    it("a teacher row changing to a curriculum with no grade is refused", async () => {
      refusedOn(await refusedUpdate([rowFor(L2, NAME[CUR_NONE], { is_teacher_acc: "1" })]), 0, NONE);
    });
    it("a name that fits two live grades keeps the current grade when it is one of them", async () => {
      addGrade(uuid(609), CUR_TWO, GRADE_NAME.B, 3);
      await update([rowFor(L1, NAME[CUR_TWO], { grade: GRADE_NAME.B })]).expect(200);
      expect(gradeOf(L1.studentid)).toBe(G_TWO_B);
    });
    it("a name that fits two live grades, none of them the current one, is refused", async () => {
      addGrade(uuid(609), CUR_TWO, GRADE_NAME.B, 3);
      db.tables.students.find((s) => s.studentid === L1.studentid)!.gradeid = G_TWO_A;
      refusedOn(await refusedUpdate([rowFor(L1, NAME[CUR_TWO], { grade: GRADE_NAME.B })]), 0, INVALID);
    });
  });

  describe("GET /student/download-students", () => {
    const download = async () => {
      const res = await send("get", `/student/download-students?schoolid=${S_X}`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      return (await csv2json((res.body as Buffer).toString("utf8"))) as Row[];
    };

    it("(i) has a grade column with each learner's grade NAME, empty when there is none", async () => {
      db.tables.students.find((s) => s.studentid === L2.studentid)!.gradeid = null;
      const rows = await download();
      expect(rows.map((r) => [r.schoolusername, r.grade])).toEqual(expect.arrayContaining([[L1.username, GRADE_NAME.B], [L2.username, ""]]));
      expect(rows).toHaveLength(2);
    });
    it("a deleted grade, and a grade of a curriculum other than the learner's own, are written as empty", async () => {
      db.tables.grades.find((g) => g.gradeid === G_TWO_B)!.isdeleted = true;
      db.tables.students.find((s) => s.studentid === L2.studentid)!.gradeid = G_TWO_A;
      const rows = await download();
      expect(rows.map((r) => r.grade)).toEqual(["", ""]);
    });
    it("(i) downloading and uploading the file unchanged keeps every learner's grade", async () => {
      const before = db.tables.students.map((s) => [s.studentid, s.gradeid]);
      // a spreadsheet reader hands every cell over as text, except the active flag, which the form sends as a number
      const rows: Row[] = (await download()).map((r) => ({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")])), isactive: Number(r.isactive) }));
      expect(rows.map((r) => r.grade)).toEqual(expect.arrayContaining([GRADE_NAME.B, GRADE_NAME.A]));
      const up = await send("put", "/student/update", { students: rows });
      expect(up.body.fields ?? up.status).toBe(200); // (the fields, if refused, say why)
      expect(db.tables.students.map((s) => [s.studentid, s.gradeid])).toEqual(before);
    });
  });
});
