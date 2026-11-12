import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { dbinstance } from "src/services/dbservice";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { ContentFake } from "src/test-support/content-fake";
import { contentProblems } from "src/test-support/student-api-content-contract";
import { buildOrganisationContent } from "src/business/organisation-content-export";
import { firstBadRecognitionField, recognitionDefaultsFor } from "src/business/curriculum-recognition";
import { CurriculumController } from "./curriculum.controller";

/**
 * The per-tier recognition setting of a curriculum (levelrecognition, graderecognition, curriculumrecognition): the
 * rule, the create and edit routes, the reads and the content export. Driven over real HTTP through the real
 * strategy, guards, controller, validators and business classes; replaced are the models (an in-memory copy of the
 * tables) and the token lookup.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // a company organisation
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // a school organisation
const SUBJECT_X = "11111111-1111-4111-8111-111111111111";
const SUBJECT_Y = "22222222-2222-4222-8222-222222222222";
const CUR_X = "44444444-4444-4444-8444-444444444444";
const CUR_Y = "55555555-5555-4555-8555-555555555555";
const db = new ContentFake();

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002];
const adminOf = (organisationid: string) =>
  bearer({ lmsuserid: `admin-${organisationid.slice(0, 4)}`, lmsuserroles: [Role.admin], permissions: PERMS, organisationid, isplatform: false });
const ADMIN_X = adminOf(X);
const ADMIN_Y = adminOf(Y);

const ALLOWED = (label: string) => `${label} must be one of the allowed values.`;
const refusal = (fields: Array<{ field: string; message: string }>) => ({
  error: true, data: false, code: "INVALID_INPUT", errormessage: "Some of the information isn't valid.", hint: "Check the highlighted fields.", fields,
});
const withoutReference = (body: Record<string, unknown>) => ({ ...body, reference: undefined, logid: undefined, stack: undefined });

const COMPANY = { levelrecognition: "award", graderecognition: "none", curriculumrecognition: "certificate" };
const SCHOOL = { levelrecognition: "award", graderecognition: "certificate", curriculumrecognition: "none" };

describe("recognition rule", () => {
  it("has the company and school presets, and an unknown preset is the school's", () => {
    expect(recognitionDefaultsFor("company")).toEqual(COMPANY);
    expect(recognitionDefaultsFor("school")).toEqual(SCHOOL);
    expect(recognitionDefaultsFor("something-else")).toEqual(SCHOOL);
    expect(recognitionDefaultsFor(undefined)).toEqual(SCHOOL);
    expect(recognitionDefaultsFor(null)).toEqual(SCHOOL);
  });
  it("names the first bad field and nothing for good or absent values", () => {
    expect(firstBadRecognitionField({})).toBeNull();
    expect(firstBadRecognitionField({ levelrecognition: "none", graderecognition: "certificate", curriculumrecognition: "none" })).toBeNull();
    expect(firstBadRecognitionField({ graderecognition: "award" })).toBe("graderecognition");
    expect(firstBadRecognitionField({ curriculumrecognition: "award" })).toBe("curriculumrecognition");
    expect(firstBadRecognitionField({ levelrecognition: "AWARD" })).toBe("levelrecognition");
    expect(firstBadRecognitionField({ levelrecognition: " award" })).toBe("levelrecognition");
    expect(firstBadRecognitionField({ levelrecognition: null })).toBe("levelrecognition");
    expect(firstBadRecognitionField({ levelrecognition: 1 })).toBe("levelrecognition");
    expect(firstBadRecognitionField({ levelrecognition: "bad", graderecognition: "bad" })).toBe("levelrecognition");
  });
});

describe("curriculum recognition over HTTP", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ controllers: [CurriculumController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    tokenExists.mockResolvedValue(true);
    db.install();
    db.add("organisations", { organisationid: X, organisationpreset: "company", contentlanguage: null });
    db.add("organisations", { organisationid: Y, organisationpreset: "school", contentlanguage: null });
    db.add("subjects", { subjectid: SUBJECT_X, subjectname: "សមី", organisationid: X, subjectstatus: true });
    db.add("subjects", { subjectid: SUBJECT_Y, subjectname: "Other", organisationid: Y, subjectstatus: true });
  });

  const create = (who: string, over: object = {}, subjectid = SUBJECT_X) =>
    request(app.getHttpServer())
      .post("/curriculum/create")
      .set("Authorization", who)
      .send({ curriculumname: "មេរៀនគំរូ", curriculumdescription: "ពិពណ៌នា", subjectid, countryid: [], ...over });
  const edit = (who: string, id: string, over: object = {}, subjectid = SUBJECT_X) =>
    request(app.getHttpServer())
      .put(`/curriculum/${id}`)
      .set("Authorization", who)
      .send({ curriculumname: "New name", subjectid, countryid: [], ...over });

  const stored = { levelrecognition: "none", graderecognition: "none", curriculumrecognition: "none" };
  const seedX = () => db.add("curriculums", { curriculumid: CUR_X, curriculumname: "Old", organisationid: X, curriculumstatus: true, ...stored });
  const recognitionOf = (row: Record<string, unknown>) => ({
    levelrecognition: row.levelrecognition,
    graderecognition: row.graderecognition,
    curriculumrecognition: row.curriculumrecognition,
  });

  describe("POST /curriculum/create", () => {
    it("under a company organisation with no values stores the company defaults", async () => {
      await create(ADMIN_X).expect(200);
      expect(recognitionOf(db.createdIn("curriculums")[0])).toEqual(COMPANY);
    });
    it("under a school organisation with no values stores the school defaults", async () => {
      await create(ADMIN_Y, {}, SUBJECT_Y).expect(200);
      expect(recognitionOf(db.createdIn("curriculums")[0])).toEqual(SCHOOL);
    });
    it("stores the values the request names, the rest from the preset", async () => {
      await create(ADMIN_X, { levelrecognition: "certificate", curriculumrecognition: "none" }).expect(200);
      expect(recognitionOf(db.createdIn("curriculums")[0])).toEqual({ levelrecognition: "certificate", graderecognition: "none", curriculumrecognition: "none" });
    });
    it("refuses a bad value (400 naming the field) and writes nothing", async () => {
      const res = await create(ADMIN_X, { graderecognition: "award" });
      expect(res.status).toBe(400);
      expect(withoutReference(res.body)).toEqual(refusal([{ field: "graderecognition", message: ALLOWED("Graderecognition") }]));
      db.nothingCreated();
    });
  });

  describe("PUT /curriculum/:id", () => {
    it("stores a valid value and leaves the other two as they were", async () => {
      seedX();
      await edit(ADMIN_X, CUR_X, { levelrecognition: "certificate" }).expect(200);
      expect(recognitionOf(db.tables.curriculums[0])).toEqual({ levelrecognition: "certificate", graderecognition: "none", curriculumrecognition: "none" });
    });
    it("stores all three together", async () => {
      seedX();
      await edit(ADMIN_X, CUR_X, { levelrecognition: "award", graderecognition: "certificate", curriculumrecognition: "certificate" }).expect(200);
      expect(recognitionOf(db.tables.curriculums[0])).toEqual({ levelrecognition: "award", graderecognition: "certificate", curriculumrecognition: "certificate" });
    });
    it.each([
      ["graderecognition", { graderecognition: "award" }, [{ field: "graderecognition", message: ALLOWED("Graderecognition") }]],
      ["curriculumrecognition", { curriculumrecognition: "award" }, [{ field: "curriculumrecognition", message: ALLOWED("Curriculumrecognition") }]],
      ["levelrecognition", { levelrecognition: "AWARD" }, [{ field: "levelrecognition", message: ALLOWED("Levelrecognition") }]],
      ["levelrecognition", { levelrecognition: "" }, [{ field: "levelrecognition", message: ALLOWED("Levelrecognition") }, { field: "levelrecognition", message: "Levelrecognition can't be empty." }]],
      ["levelrecognition", { levelrecognition: null }, [{ field: "levelrecognition", message: ALLOWED("Levelrecognition") }, { field: "levelrecognition", message: "Levelrecognition isn't valid." }]],
    ])("a bad value is a 400 naming %s and nothing is written", async (_field, over, fields) => {
      seedX();
      const before = db.snapshot();
      const res = await edit(ADMIN_X, CUR_X, { ...over });
      expect(res.status).toBe(400);
      expect(withoutReference(res.body)).toEqual(refusal(fields));
      expect(db.snapshot()).toEqual(before);
    });
    it("with none of the fields leaves the stored values unchanged, and writes the name", async () => {
      db.add("curriculums", { curriculumid: CUR_X, curriculumname: "Old", organisationid: X, curriculumstatus: true, levelrecognition: "certificate", graderecognition: "certificate", curriculumrecognition: "certificate" });
      await edit(ADMIN_X, CUR_X).expect(200);
      expect(db.tables.curriculums[0]).toMatchObject({ curriculumname: "New name", levelrecognition: "certificate", graderecognition: "certificate", curriculumrecognition: "certificate" });
    });
    it("cannot reach another organisation's curriculum: the same answer as an absent one, nothing written", async () => {
      db.add("curriculums", { curriculumid: CUR_Y, curriculumname: "Theirs", organisationid: Y, curriculumstatus: true, ...stored });
      const before = db.snapshot();
      const res = await edit(ADMIN_X, CUR_Y, { levelrecognition: "certificate" });
      const absent = await edit(ADMIN_X, "66666666-6666-4666-8666-666666666666", { levelrecognition: "certificate" });
      expect({ status: res.status, body: { ...res.body, reference: undefined, logid: undefined } }).toEqual({
        status: absent.status,
        body: { ...absent.body, reference: undefined, logid: undefined },
      });
      expect(db.snapshot()).toEqual(before);
      expect(db.tables.curriculums[0]).toMatchObject(stored);
    });
  });

  describe("the reads the admin curriculum form uses", () => {
    it("GET /curriculum/:id returns the three stored values", async () => {
      db.add("curriculums", { curriculumid: CUR_X, curriculumname: "Old", organisationid: X, curriculumstatus: true, isdeleted: false, ...COMPANY });
      const res = await request(app.getHttpServer()).get(`/curriculum/${CUR_X}`).set("Authorization", ADMIN_X).expect(200);
      expect(recognitionOf(res.body.data)).toEqual(COMPANY);
    });
    it("POST /curriculum (the list) returns the three stored values on each row", async () => {
      db.add("curriculums", { curriculumid: CUR_X, curriculumname: "Old", organisationid: X, subjectid: SUBJECT_X, curriculumstatus: true, isdeleted: false, ...COMPANY });
      const res = await request(app.getHttpServer()).post("/curriculum").set("Authorization", ADMIN_X).send({ pageindex: 1, pagesize: 10 }).expect(200);
      expect(res.body.data.data.map((r: Record<string, unknown>) => recognitionOf(r))).toEqual([COMPANY]);
    });
  });
});

describe("the content export", () => {
  const AT = new Date("2026-11-12T05:00:00.000Z");
  beforeEach(() => {
    jest.restoreAllMocks();
    db.install();
    jest.spyOn(Logger, "info").mockImplementation(() => Logger);
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockRejectedValue(new Error("not under test"));
  });

  it("each curriculums row carries exactly the three stored values, and the payload passes the student API's rules", async () => {
    db.add("organisations", { organisationid: X, organisationpreset: "company", contentlanguage: null });
    db.add("curriculums", { curriculumid: CUR_X, curriculumname: "Reading", organisationid: X, curriculumstatus: true, isdeleted: false, levelrecognition: "none", graderecognition: "certificate", curriculumrecognition: "certificate" });
    const payload = await buildOrganisationContent({
      organisationid: X, organisationname: "Org X", organisationcode: "xorg", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, contentlanguage: null, isdeleted: false, created_at: AT,
    } as never);
    const rows = payload.curriculums as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(recognitionOf(rows[0])).toEqual({ levelrecognition: "none", graderecognition: "certificate", curriculumrecognition: "certificate" });
    expect(contentProblems(JSON.parse(JSON.stringify(payload)))).toEqual([]);
  });
});

function recognitionOf(row: Record<string, unknown>) {
  return { levelrecognition: row.levelrecognition, graderecognition: row.graderecognition, curriculumrecognition: row.curriculumrecognition };
}
