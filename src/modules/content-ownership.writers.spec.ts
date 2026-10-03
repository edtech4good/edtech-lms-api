import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { ContentFake } from "src/test-support/content-fake";
import { CurriculumController } from "./curriculum/curriculum.controller";
import { DocumentController } from "./document/document.controller";
import { DocumentTagController } from "./documenttag/documenttag.controller";
import { QuestionController } from "./question/question.controller";
import { QuestionTagController } from "./questiontag/questiontag.controller";
import { SubjectController } from "./subject/subject.controller";

/**
 * Every writer of owned content sets the owner from the caller's scope, with four
 * callers: a platform user NOT acting as an organisation (refused, 400, told to
 * choose one), a platform user acting as X, X's Organisation Admin and X's Admin
 * (each writes X). Driven over real HTTP through the real strategy, guards,
 * controllers, validators and business classes; replaced are the models (an
 * in-memory copy of the content tables) and the file store.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));
const uploadS3 = jest.fn();
jest.mock("src/services/aws.service", () => ({
  AWSService: { uploadS3: (...a: unknown[]) => uploadS3(...a), uploadS3InFolder: jest.fn() },
}));

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUBJECT_X = "11111111-1111-4111-8111-111111111111";
const SUBJECT_Y = "22222222-2222-4222-8222-222222222222";
const db = new ContentFake();

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002];
const callers = {
  "a platform user not acting": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: null, isplatform: true }),
  "a platform user acting as X": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: X, isplatform: true }),
  "X's Organisation Admin": bearer({ lmsuserid: "oa", lmsuserroles: [Role.organisationadmin], permissions: PERMS, organisationid: X, isplatform: false }),
  "X's Admin": bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false }),
} as const;
type Who = keyof typeof callers;
const IN_X: Who[] = ["a platform user acting as X", "X's Organisation Admin", "X's Admin"];

describe("content writers set the owner from the caller's scope", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [CurriculumController, QuestionController, DocumentController, QuestionTagController, DocumentTagController, SubjectController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    tokenExists.mockResolvedValue(true);
    uploadS3.mockReset().mockResolvedValue({ Key: "k" });
    db.install();
    db.add("subjects", { subjectid: SUBJECT_X, subjectname: "សមី", organisationid: X, subjectstatus: true });
    db.add("subjects", { subjectid: SUBJECT_Y, subjectname: "Other", organisationid: Y, subjectstatus: true });
  });

  const post = (path: string, who: Who, body: object = {}) => request(app.getHttpServer()).post(path).set("Authorization", callers[who]).send(body);

  const refusedForPlatform = async (path: string, body: object) => {
    const res = await post(path, "a platform user not acting", body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_INPUT");
    expect(res.body.errormessage).toMatch(/Choose an organisation to act in/);
    db.nothingCreated();
  };

  describe("POST /curriculum/create", () => {
    const body = (over: object = {}) => ({ curriculumname: "មេរៀនគំរូ", curriculumdescription: "ពិពណ៌នា", subjectid: SUBJECT_X, countryid: [], ...over });
    it("a platform user not acting is refused (400) and nothing is written", () => refusedForPlatform("/curriculum/create", body()));
    it.each(IN_X)("%s: the curriculum is X's", async (who) => {
      await post("/curriculum/create", who, body()).expect(200);
      expect(db.createdIn("curriculums")).toHaveLength(1);
      expect(db.createdIn("curriculums")[0]).toMatchObject({ organisationid: X, curriculumname: "មេរៀនគំរូ" });
    });
    it("the owner is not a client field: a body organisationid is refused (400)", async () => {
      await post("/curriculum/create", "X's Admin", body({ organisationid: Y })).expect(400);
      db.nothingCreated();
    });
    it("a subject of another organisation cannot be attached (400), nothing is written", async () => {
      db.tables.subjects.push({ subjectid: "33333333-3333-4333-8333-333333333333", organisationid: Y, isdeleted: false, subjectstatus: true });
      const res = await post("/curriculum/create", "X's Admin", body({ subjectid: "33333333-3333-4333-8333-333333333333" }));
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe("These belong to different organisations, so one can't be attached to the other.");
      db.nothingCreated();
    });
  });

  describe("POST /question/create", () => {
    const body = (over: object = {}) => ({ questionidentifier: "សំណួរ-001", questiontext: "សួស្តី", templatetypeid: 1, questioncorrectvalue: 1, ...over });
    it("a platform user not acting is refused (400) and nothing is written", () => refusedForPlatform("/question/create", body()));
    it.each(IN_X)("%s: the question is X's", async (who) => {
      await post("/question/create", who, body()).expect(200);
      expect(db.createdIn("questions")[0]).toMatchObject({ organisationid: X, questionidentifier: "សំណួរ-001" });
    });
    it("a body organisationid is refused (400)", async () => {
      await post("/question/create", "X's Admin", body({ organisationid: Y })).expect(400);
      db.nothingCreated();
    });
  });

  describe("POST /document/upload", () => {
    const upload = (who: Who) => request(app.getHttpServer()).post("/document/upload").set("Authorization", callers[who]).attach("file", Buffer.from("png"), "sample_file.png");
    it("a platform user not acting is refused (400) before anything is uploaded", async () => {
      const res = await upload("a platform user not acting");
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toMatch(/Choose an organisation to act in/);
      expect(uploadS3).not.toHaveBeenCalled();
      db.nothingCreated();
    });
    it.each(IN_X)("%s: the document is X's", async (who) => {
      await upload(who).expect(200);
      expect(db.createdIn("documents")[0]).toMatchObject({ organisationid: X, documentname: "sample_file.png" });
    });
  });

  describe.each([
    ["question tag", "/questiontag/create", { questiontagname: "easytag" }, "questiontags"],
    ["document tag", "/documenttag/create", { documenttagname: "doctag" }, "documenttags"],
    ["subject", "/subject/create", { subjectname: "គណិតវិទ្យា", subjectdescription: "ពិពណ៌នា" }, "subjects"],
  ] as const)("POST %s create", (_name, path, body, table) => {
    it("a platform user not acting is refused (400) and nothing is written", () => refusedForPlatform(path, body));
    it.each(IN_X)("%s: the row is X's", async (who) => {
      await post(path, who, body).expect(200);
      expect(db.createdIn(table)).toHaveLength(1);
      expect(db.createdIn(table)[0]).toMatchObject({ organisationid: X });
    });
    it("a body organisationid is refused (400)", async () => {
      await post(path, "X's Admin", { ...body, organisationid: Y }).expect(400);
      db.nothingCreated();
    });
  });

  describe("update never changes the owner", () => {
    it("PUT /curriculum/:id refuses an organisationid in the body, and the curriculum keeps its owner", async () => {
      db.add("curriculums", { curriculumid: "44444444-4444-4444-8444-444444444444", curriculumname: "Old", organisationid: X, curriculumstatus: true });
      const res = await request(app.getHttpServer())
        .put("/curriculum/44444444-4444-4444-8444-444444444444")
        .set("Authorization", callers["X's Admin"])
        .send({ curriculumname: "New name", subjectid: SUBJECT_X, countryid: [], organisationid: Y });
      expect(res.status).toBe(400);
      expect(db.tables.curriculums[0].organisationid).toBe(X);
    });

    it("PUT /question/:id refuses an organisationid in the body", async () => {
      db.add("questions", { questionid: "55555555-5555-4555-8555-555555555555", questionidentifier: "old-id", organisationid: X });
      const res = await request(app.getHttpServer())
        .put("/question/55555555-5555-4555-8555-555555555555")
        .set("Authorization", callers["X's Admin"])
        .send({ questionidentifier: "new-identifier", organisationid: Y });
      expect(res.status).toBe(400);
      expect(db.tables.questions[0].organisationid).toBe(X);
    });
  });
});
