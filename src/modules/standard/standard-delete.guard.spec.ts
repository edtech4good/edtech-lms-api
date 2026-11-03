import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { StandardController } from "./standard.controller";

/**
 * A class that still has learners cannot be deleted, and the refusal says how many. Learners store the class's ID
 * in `students.standard`; a learner who was deleted no longer counts; a row that still holds the class's NAME counts
 * only inside the class's own school. Driven over real HTTP through the real strategy, guards, controller, validators
 * and business classes; the tables are the in-memory copy in `ContentFake`.
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
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S_ONE = uuid(201); // X's school
const S_TWO = uuid(202); // X's other school
const S_Y = uuid(203); // Y's school
const CLASS_NAME = "ថ្នាក់ទី៤ក"; // the same name in two schools
const CLASS_ONE = uuid(501); // in S_ONE
const CLASS_TWO = uuid(502); // in S_TWO, the same name
const CLASS_Y = uuid(503); // Y's, with a learner
const CLASS_EMPTY = uuid(504); // in S_ONE, nobody in it
const CLASS_NO_SCHOOL = uuid(505); // an older class that belongs to no school
const MISSING = uuid(999);

const db = new ContentFake();
const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };
const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const platform = bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...ORGANISATION_ADMIN_PERMISSIONS_20261002], organisationid: null, isplatform: true });
const xAdmin = bearer({ lmsuserid: "oa", lmsuserroles: [Role.organisationadmin], permissions: [...ORGANISATION_ADMIN_PERMISSIONS_20261002], organisationid: X, isplatform: false });

let n = 1000;
/** A learner; `standard` is whatever the column holds: the class's id, or (older data) its name. */
const learner = (school: string, standard: string, extra: Record<string, unknown> = {}) => {
  n += 1;
  db.add("students", { studentid: uuid(n), schooluserid: uuid(n + 5000), schoolid: school, standard, studentfirstname: "សុខា", genderid: 1, isactive: 1, ...extra });
};

const withoutReference = (body: Record<string, unknown>) => {
  const { reference, logid, stack, ...rest } = body;
  return rest;
};
const said = (res: request.Response) => ({ status: res.status, body: withoutReference(res.body) });
/** The whole refusal: the sentence is on the field `standardid`; the top-level message is the generic one every 400 of this kind has. */
const refusal = (count: number) => ({
  status: 400,
  body: {
    error: true,
    code: "INVALID_INPUT",
    data: false,
    errormessage: "Some of the information isn't valid.",
    fields: [
      {
        field: "standardid",
        message: `That class has ${count} ${count === 1 ? "learner" : "learners"} and can't be deleted. Move or remove them first.`,
      },
    ],
    hint: "Check the highlighted fields.",
  },
});

describe("DELETE /standard/:standardid refuses a class that still has learners", () => {
  let app: INestApplication;
  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ controllers: [StandardController], providers: [JwtAccessStrategy] }).compile();
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
    db.install();
    n = 1000;
    db.add("organisations", { organisationid: X });
    db.add("organisations", { organisationid: Y });
    db.add("schools", { schoolid: S_ONE, schoolname: "សាលាបឋមសិក្សាគំរូ ក", organisationid: X });
    db.add("schools", { schoolid: S_TWO, schoolname: "សាលាបឋមសិក្សាគំរូ ខ", organisationid: X });
    db.add("schools", { schoolid: S_Y, schoolname: "សាលាបឋមសិក្សាគំរូ គ", organisationid: Y });
    db.add("standards", { standardid: CLASS_ONE, standardname: CLASS_NAME, schoolid: S_ONE, schoolname: "សាលាបឋមសិក្សាគំរូ ក" });
    db.add("standards", { standardid: CLASS_TWO, standardname: CLASS_NAME, schoolid: S_TWO, schoolname: "សាលាបឋមសិក្សាគំរូ ខ" });
    db.add("standards", { standardid: CLASS_Y, standardname: CLASS_NAME, schoolid: S_Y, schoolname: "សាលាបឋមសិក្សាគំរូ គ" });
    db.add("standards", { standardid: CLASS_EMPTY, standardname: "ថ្នាក់ទី៥ខ", schoolid: S_ONE, schoolname: "សាលាបឋមសិក្សាគំរូ ក" });
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
  });

  const del = (id: string) => request(app.getHttpServer()).delete(`/standard/${id}`).set("Authorization", xAdmin).set("Connection", "close");
  const isDeleted = (id: string) => db.tables.standards.find((k) => k.standardid === id)!.isdeleted;

  it("a class with one learner is refused with the count, and nothing is written", async () => {
    learner(S_ONE, CLASS_ONE);
    const before = db.snapshot();
    const res = await del(CLASS_ONE);
    expect(said(res)).toEqual(refusal(1));
    expect(db.snapshot()).toEqual(before);
  });

  it("a class with several learners is refused with the count of them", async () => {
    learner(S_ONE, CLASS_ONE);
    learner(S_ONE, CLASS_ONE);
    learner(S_ONE, CLASS_ONE);
    learner(S_ONE, CLASS_EMPTY); // another class's learner is not counted
    const before = db.snapshot();
    const res = await del(CLASS_ONE);
    expect(said(res)).toEqual(refusal(3));
    expect(db.snapshot()).toEqual(before);
  });

  it("an empty class is deleted", async () => {
    learner(S_ONE, CLASS_ONE);
    await del(CLASS_EMPTY).expect(200);
    expect(isDeleted(CLASS_EMPTY)).toBe(true);
    expect(isDeleted(CLASS_ONE)).toBe(false);
  });

  it("a class whose only learner was deleted is deleted", async () => {
    learner(S_ONE, CLASS_ONE, { isdeleted: true });
    await del(CLASS_ONE).expect(200);
    expect(isDeleted(CLASS_ONE)).toBe(true);
  });

  it("deleted learners are left out of the count", async () => {
    learner(S_ONE, CLASS_ONE, { isdeleted: true });
    learner(S_ONE, CLASS_ONE);
    learner(S_ONE, CLASS_ONE, { isdeleted: true });
    expect(said(await del(CLASS_ONE))).toEqual(refusal(1));
    expect(isDeleted(CLASS_ONE)).toBe(false);
  });

  it("the same class name in another school, with learners, does not block", async () => {
    learner(S_TWO, CLASS_TWO);
    learner(S_TWO, CLASS_NAME); // an older row in that school holding the name
    learner(S_Y, CLASS_NAME); // and one in another organisation's school
    await del(CLASS_ONE).expect(200);
    expect(isDeleted(CLASS_ONE)).toBe(true);
    expect(isDeleted(CLASS_TWO)).toBe(false);
  });

  it("a learner row in the same school that still holds the class's name blocks, together with those holding its id", async () => {
    learner(S_ONE, CLASS_NAME);
    learner(S_ONE, CLASS_ONE);
    learner(S_TWO, CLASS_NAME); // the other school's, not counted
    learner(S_ONE, CLASS_NAME, { isdeleted: true }); // a deleted one, not counted
    const before = db.snapshot();
    expect(said(await del(CLASS_ONE))).toEqual(refusal(2));
    expect(db.snapshot()).toEqual(before);
  });

  it("the name is compared as school names are: surrounding spaces do not matter", async () => {
    learner(S_ONE, ` ${CLASS_NAME} `);
    expect(said(await del(CLASS_ONE))).toEqual(refusal(1));
  });

  it("the class named in the path decides what the delete checks, whatever else the request carries", async () => {
    learner(S_ONE, CLASS_ONE);
    const withBody = (id: string, body: object) => request(app.getHttpServer()).delete(`/standard/${id}`).set("Authorization", xAdmin).set("Connection", "close").send(body);
    expect(said(await withBody(CLASS_ONE, { standardid: CLASS_EMPTY }))).toEqual(refusal(1));
    expect(isDeleted(CLASS_ONE)).toBe(false);
    await withBody(CLASS_EMPTY, { standardid: CLASS_ONE }).expect(200);
    expect(isDeleted(CLASS_EMPTY)).toBe(true);
    expect(isDeleted(CLASS_ONE)).toBe(false);
  });

  it("the class named in the path decides what the delete checks: a standardid in the query changes nothing", async () => {
    learner(S_ONE, CLASS_ONE);
    const withQuery = (id: string, standardid: string) => request(app.getHttpServer()).delete(`/standard/${id}`).query({ standardid }).set("Authorization", xAdmin).set("Connection", "close");
    expect(said(await withQuery(CLASS_ONE, CLASS_EMPTY))).toEqual(refusal(1));
    expect(isDeleted(CLASS_ONE)).toBe(false);
    await withQuery(CLASS_EMPTY, CLASS_ONE).expect(200);
    expect(isDeleted(CLASS_EMPTY)).toBe(true);
    expect(isDeleted(CLASS_ONE)).toBe(false);
  });

  it("several learners holding the class's name in its school are each counted", async () => {
    learner(S_ONE, CLASS_NAME);
    learner(S_ONE, CLASS_NAME);
    learner(S_ONE, CLASS_NAME);
    expect(said(await del(CLASS_ONE))).toEqual(refusal(3));
  });

  it("two groups of name rows, written differently, are added together with the learners holding the id", async () => {
    learner(S_ONE, CLASS_NAME);
    learner(S_ONE, CLASS_NAME);
    learner(S_ONE, ` ${CLASS_NAME}`);
    learner(S_ONE, CLASS_ONE);
    expect(said(await del(CLASS_ONE))).toEqual(refusal(4));
  });

  it("a class that belongs to no school is still counted by its id", async () => {
    db.add("standards", { standardid: CLASS_NO_SCHOOL, standardname: CLASS_NAME, schoolid: null, schoolname: null });
    learner(S_ONE, CLASS_NO_SCHOOL);
    learner(S_ONE, CLASS_NAME); // a name row is not counted for a class with no school
    const res = await request(app.getHttpServer()).delete(`/standard/${CLASS_NO_SCHOOL}`).set("Authorization", platform).set("Connection", "close");
    expect(said(res)).toEqual(refusal(1));
    expect(isDeleted(CLASS_NO_SCHOOL)).toBe(false);
  });

  it("another organisation's class is the 404 a missing class gets, unchanged", async () => {
    learner(S_Y, CLASS_Y);
    const before = db.snapshot();
    const res = await del(CLASS_Y);
    const none = await del(MISSING);
    expect(res.status).toBe(404);
    expect(said(res)).toEqual(said(none));
    expect(db.snapshot()).toEqual(before);
  });
});
