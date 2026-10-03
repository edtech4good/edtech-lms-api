import { schools } from "src/models/data-models/school";
import { ExportController } from "src/modules/export/export.controller";
import { ImportController } from "src/modules/import/import.controller";
import { SchoolExists, SchoolExistsForRead } from "./school.business.validator";

/**
 * A soft-deleted school is still a school: the id is identity, not liveness. The
 * export routes only READ, so they accept a soft-deleted school's id like the
 * reports and the edit export do. The teacher import WRITES, so its validator
 * keeps refusing a school that is gone.
 */
const LIVE = { schoolid: "11111111-1111-4111-8111-111111111111", schoolname: "Sample School", isdeleted: false };
const GONE = { schoolid: "22222222-2222-4222-8222-222222222222", schoolname: "Closed Sample School", isdeleted: true };
const table = [LIVE, GONE];

beforeEach(() => {
  jest.spyOn(schools, "findAll").mockImplementation((async (opts: { where: { logic: string } }) =>
    table.filter((s) => s.schoolname.toLowerCase() === String(opts.where.logic).toLowerCase())) as never);
  // the table honours `isdeleted: false` the way the database does
  jest.spyOn(schools, "findOne").mockImplementation((async (opts: { where: { schoolid: string; isdeleted?: boolean } }) =>
    table.find((s) => s.schoolid === opts.where.schoolid && (opts.where.isdeleted === undefined || s.isdeleted === opts.where.isdeleted)) ?? null) as never);
});
afterEach(() => jest.restoreAllMocks());

const req = {} as never;

describe("the read routes' validator (export of a school's learners and teachers)", () => {
  it("accepts a live school by id and by name", async () => {
    expect(await SchoolExistsForRead(req, { schoolname: LIVE.schoolid })).toEqual([]);
    expect(await SchoolExistsForRead(req, { schoolname: "sample school" })).toEqual([]);
  });

  it("accepts a soft-deleted school by its id, and by its name when no live school has it", async () => {
    expect(await SchoolExistsForRead(req, { schoolname: GONE.schoolid })).toEqual([]);
    expect(await SchoolExistsForRead(req, { schoolname: "Closed Sample School" })).toEqual([]);
  });

  it("refuses a school that does not exist", async () => {
    for (const segment of ["Nowhere", "33333333-3333-4333-8333-333333333333", ""]) {
      const errors = await SchoolExistsForRead(req, { schoolname: segment });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.details[0].message).toBe("That school doesn't exist.");
    }
  });
});

describe("the write route's validator (teacher import)", () => {
  it("accepts a live school by id and by name", async () => {
    expect(await SchoolExists(req, { schoolname: LIVE.schoolid })).toEqual([]);
    expect(await SchoolExists(req, { schoolname: "Sample School" })).toEqual([]);
  });

  it("still refuses a soft-deleted school, by id and by name", async () => {
    for (const segment of [GONE.schoolid, "Closed Sample School", "Nowhere"]) {
      expect(await SchoolExists(req, { schoolname: segment })).toHaveLength(1);
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
