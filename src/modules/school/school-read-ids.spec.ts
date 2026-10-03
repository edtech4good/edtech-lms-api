import { ContentFake } from "src/test-support/content-fake";
import { ExportController } from "src/modules/export/export.controller";
import { ImportController } from "src/modules/import/import.controller";
import { SchoolExists, SchoolExistsForRead } from "./school.business.validator";

/**
 * A soft-deleted school is still a school: the id is identity, not liveness. The
 * export routes only READ, so they accept a soft-deleted school's id like the
 * reports and the edit export do. The teacher import WRITES, so its validator
 * keeps refusing a school that is gone. (Both look the school up among the
 * caller's schools: here a platform user not acting as an organisation, whose
 * schools are all of them. The organisation callers are in
 * people-scope.leak.spec.ts.)
 */
const LIVE = { schoolid: "11111111-1111-4111-8111-111111111111", schoolname: "Sample School", isdeleted: false };
const GONE = { schoolid: "22222222-2222-4222-8222-222222222222", schoolname: "Closed Sample School", isdeleted: true };
const db = new ContentFake();

beforeEach(() => {
  db.install();
  db.add("schools", LIVE);
  db.add("schools", GONE);
});
afterEach(() => jest.restoreAllMocks());

const req = { user: { lmsuserid: "p", organisationid: null, isplatform: true } } as never;
const refusal = { code: "NOT_FOUND", message: "That school doesn't exist." };

describe("the read routes' validator (export of a school's learners and teachers)", () => {
  it("accepts a live school by id and by name", async () => {
    expect(await SchoolExistsForRead(req, { schoolname: LIVE.schoolid })).toEqual([]);
    expect(await SchoolExistsForRead(req, { schoolname: "sample school" })).toEqual([]);
  });

  it("accepts a soft-deleted school by its id, and by its name when no live school has it", async () => {
    expect(await SchoolExistsForRead(req, { schoolname: GONE.schoolid })).toEqual([]);
    expect(await SchoolExistsForRead(req, { schoolname: "Closed Sample School" })).toEqual([]);
  });

  it("refuses a school that does not exist with a 404", async () => {
    for (const segment of ["Nowhere", "33333333-3333-4333-8333-333333333333", ""]) {
      await expect(SchoolExistsForRead(req, { schoolname: segment })).rejects.toMatchObject(refusal);
    }
  });
});

describe("the write route's validator (teacher import)", () => {
  it("accepts a live school by id and by name", async () => {
    expect(await SchoolExists(req, { schoolname: LIVE.schoolid })).toEqual([]);
    expect(await SchoolExists(req, { schoolname: "Sample School" })).toEqual([]);
  });

  it("still refuses a soft-deleted school, by id and by name, and a school that is not there", async () => {
    for (const segment of [GONE.schoolid, "Closed Sample School", "Nowhere"]) {
      await expect(SchoolExists(req, { schoolname: segment })).rejects.toMatchObject(refusal);
    }
  });
});

describe("which validator each route uses", () => {
  const rulesOf = (target: object, method: string) => {
    const interceptors = Reflect.getMetadata("__interceptors__", (target as Record<string, object>)[method]) as Array<{ rules?: unknown[] }>;
    return interceptors.flatMap((i) => i.rules ?? []);
  };

  it("the exports of a school's learners and teachers read, so they accept a soft-deleted school", () => {
    for (const method of ["getstudents", "getteachers"]) {
      const rules = rulesOf(ExportController.prototype, method);
      expect(rules).toContain(SchoolExistsForRead);
      expect(rules).not.toContain(SchoolExists);
    }
  });

  it("the teacher import writes, so it keeps the live-only validator", () => {
    const rules = rulesOf(ImportController.prototype, "putteachers");
    expect(rules).toContain(SchoolExists);
    expect(rules).not.toContain(SchoolExistsForRead);
  });
});
