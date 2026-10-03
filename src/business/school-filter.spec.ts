import { Op } from "sequelize";
import { schools } from "src/models/data-models/school";
import { extractSchoolFilters, resolveSchoolFromFilters, schoolIdsWhere } from "./school-filter";

/**
 * A list's school filter is carried out on the schools, and the rows are then
 * limited to the schools' ids. `schools` is an in-memory table: `findAll`
 * answers the LIKE search, `findOne` a lookup by id.
 */
const ROWS = [
  { schoolid: "id-1", schoolname: "Riverside Primary School" },
  { schoolid: "id-2", schoolname: "Hillside Primary School" },
  { schoolid: "id-3", schoolname: "សាលាគំរូ" },
];

beforeEach(() => {
  jest.spyOn(schools, "findAll").mockImplementation((async (opts: { where: Record<symbol, Array<{ schoolname: Record<symbol, string> }>> }) => {
    const terms = opts.where[Op.and].map((t) => String(t.schoolname[Op.like]).replace(/%/g, "").toLowerCase());
    return ROWS.filter((r) => terms.every((t) => r.schoolname.toLowerCase().includes(t)));
  }) as never);
  jest.spyOn(schools, "findOne").mockImplementation((async (opts: { where: { schoolid: string } }) => ROWS.find((r) => r.schoolid === opts.where.schoolid) ?? null) as never);
});
afterEach(() => jest.restoreAllMocks());

describe("extractSchoolFilters", () => {
  it("passes every filter that is not about a school through untouched, and adds no school restriction", async () => {
    const filters = [{ key: "city", value: "x" }, { key: "state", value: "y" }];
    await expect(extractSchoolFilters(filters)).resolves.toEqual({ rest: filters, schoolids: undefined });
    await expect(extractSchoolFilters(undefined)).resolves.toEqual({ rest: [], schoolids: undefined });
  });

  it("a name search: the schools whose name contains the text (case-insensitive), by id", async () => {
    const out = await extractSchoolFilters([{ key: "schoolname", value: "PRIMARY" }, { key: "city", value: "x" }]);
    expect(out.schoolids).toEqual(["id-1", "id-2"]);
    expect(out.rest).toEqual([{ key: "city", value: "x" }]);
  });

  it("comma-separated terms must ALL match one school's name", async () => {
    expect((await extractSchoolFilters([{ key: "schoolname", value: "river, primary" }])).schoolids).toEqual(["id-1"]);
    expect((await extractSchoolFilters([{ key: "schoolname", value: "river, hill" }])).schoolids).toEqual([]);
  });

  it("a search that matches no school yields an empty list of ids (it must match no row)", async () => {
    expect((await extractSchoolFilters([{ key: "schoolname", value: "zzz" }])).schoolids).toEqual([]);
  });

  it("a Khmer name is searched as written", async () => {
    expect((await extractSchoolFilters([{ key: "schoolname", value: "សាលា" }])).schoolids).toEqual(["id-3"]);
  });

  it("a schoolid filter limits to that school; an unknown id is a 404", async () => {
    expect((await extractSchoolFilters([{ key: "schoolid", value: "id-2" }])).schoolids).toEqual(["id-2"]);
    await expect(extractSchoolFilters([{ key: "schoolid", value: "nope" }])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("two school filters narrow each other (intersection)", async () => {
    const out = await extractSchoolFilters([{ key: "schoolname", value: "primary" }, { key: "schoolid", value: "id-2" }]);
    expect(out.schoolids).toEqual(["id-2"]);
  });

  it("an empty value is no filter (as before)", async () => {
    expect((await extractSchoolFilters([{ key: "schoolname", value: "" }])).schoolids).toBeUndefined();
  });
});

describe("schoolIdsWhere", () => {
  it("adds nothing when no school filter was sent, and IN (...) otherwise, an empty IN included", () => {
    expect(schoolIdsWhere(undefined)).toEqual({});
    expect(schoolIdsWhere(["a"])).toEqual({ schoolid: { [Op.in]: ["a"] } });
    expect(schoolIdsWhere([])).toEqual({ schoolid: { [Op.in]: [] } });
  });
});

describe("resolveSchoolFromFilters (the report and feedback filters compare equal)", () => {
  it("returns nothing when no school filter is sent", async () => {
    await expect(resolveSchoolFromFilters([{ key: "city", value: "x" }])).resolves.toBeUndefined();
  });

  it("an id filter resolves to that school; an unknown id is a 404", async () => {
    await expect(resolveSchoolFromFilters([{ key: "schoolid", value: "id-1" }])).resolves.toEqual(ROWS[0]);
    await expect(resolveSchoolFromFilters([{ key: "schoolid", value: "nope" }])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
