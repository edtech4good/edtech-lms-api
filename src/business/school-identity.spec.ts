import { schools } from "src/models/data-models/school";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { requireSchoolIdByName, resolveSchoolIdByName, withSchoolIds } from "./school-identity";

/**
 * The database is replaced by `schools.findAll`, which stands in for MySQL's
 * `WHERE schoolname = ?`: it returns every school whose name is EQUAL UNDER THE
 * COLLATION (the fake below models exactly that: case, trailing spaces and the
 * Khmer nikahit/bantoc marks do not count). What is under test is that the
 * resolver then picks only the candidate whose text is the same, character for
 * character. The real-collation proof (a real table, a real name that differs
 * by a Khmer mark) is in the PR description.
 */

// Case folded, trailing spaces ignored, nikahit (U+17C6) and bantoc (U+17CB) weigh nothing.
const collate = (s: string) => s.replace(/[ំ់]/g, "").replace(/ +$/, "").toLowerCase();

const SCHOOLS = [
  { schoolid: "id-sample", schoolname: "Sample School" },
  { schoolid: "id-khmer", schoolname: "សាលាគំរូ" }, // has nikahit U+17C6
  { schoolid: "id-deleted", schoolname: "Sample Closed School" }, // soft-deleted in the table
];

const fakeMysql = (rows = SCHOOLS) =>
  jest.spyOn(schools, "findAll").mockImplementation((async (opts: { where: { schoolname: string } }) =>
    rows.filter((r) => collate(r.schoolname) === collate(opts.where.schoolname))) as never);

afterEach(() => jest.restoreAllMocks());

describe("resolveSchoolIdByName", () => {
  it("returns the id of the school whose name is exactly the one given", async () => {
    fakeMysql();
    await expect(resolveSchoolIdByName("Sample School")).resolves.toBe("id-sample");
    await expect(resolveSchoolIdByName("សាលាគំរូ")).resolves.toBe("id-khmer");
  });

  it("does NOT resolve a name that is only equal under the collation: trailing space, case", async () => {
    fakeMysql();
    expect(await schools.findAll({ where: { schoolname: "Sample School " } } as never)).toHaveLength(1); // MySQL would match it
    await expect(resolveSchoolIdByName("Sample School ")).resolves.toBeNull();
    await expect(resolveSchoolIdByName("sample school")).resolves.toBeNull();
  });

  it("does NOT resolve a Khmer name that differs from the school's only by a mark the collation ignores", async () => {
    fakeMysql();
    const withoutNikahit = "សាលាគរូ";
    expect(withoutNikahit).not.toBe("សាលាគំរូ");
    expect(await schools.findAll({ where: { schoolname: withoutNikahit } } as never)).toHaveLength(1); // MySQL would match it
    await expect(resolveSchoolIdByName(withoutNikahit)).resolves.toBeNull();
  });

  it("picks the exact one when several names are collation-equal (as they can be once names are unique per organisation)", async () => {
    fakeMysql([
      { schoolid: "id-a", schoolname: "សាលាគរូ" },
      { schoolid: "id-b", schoolname: "សាលាគំរូ" },
    ]);
    await expect(resolveSchoolIdByName("សាលាគំរូ")).resolves.toBe("id-b");
    await expect(resolveSchoolIdByName("សាលាគរូ")).resolves.toBe("id-a");
  });

  it("returns null for a name that matches no school, and for empty, missing or non-string input, without asking the database", async () => {
    const find = fakeMysql();
    await expect(resolveSchoolIdByName("No Such School")).resolves.toBeNull();
    find.mockClear();
    for (const bad of ["", undefined, null, 5 as unknown as string]) {
      await expect(resolveSchoolIdByName(bad)).resolves.toBeNull();
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("resolves a soft-deleted school: the id is identity, not liveness (it does not filter isdeleted)", async () => {
    const find = fakeMysql();
    await expect(resolveSchoolIdByName("Sample Closed School")).resolves.toBe("id-deleted");
    expect(find.mock.calls[0][0]).toEqual(expect.objectContaining({ where: { schoolname: "Sample Closed School" } }));
    expect(JSON.stringify(find.mock.calls[0][0])).not.toMatch(/isdeleted/);
  });

  it("looks up inside the writer's transaction, under a shared lock on the school row", async () => {
    const find = fakeMysql();
    const tx = { LOCK: { SHARE: "SHARE-LOCK" } };
    await resolveSchoolIdByName("Sample School", tx as never);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ transaction: tx, lock: "SHARE-LOCK" }));
  });

  it("does not trim or case-fold the name it is given", async () => {
    const find = fakeMysql();
    await resolveSchoolIdByName(" Sample School");
    expect(find.mock.calls[0][0]).toEqual(expect.objectContaining({ where: { schoolname: " Sample School" } }));
  });
});

describe("requireSchoolIdByName", () => {
  it("returns the id", async () => {
    fakeMysql();
    await expect(requireSchoolIdByName("Sample School")).resolves.toBe("id-sample");
  });

  it("fails clearly with a 400 field error when the name matches no school, without echoing the name", async () => {
    fakeMysql();
    const err = await requireSchoolIdByName("Secret Unknown School", undefined, "schoolname").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    expect(err.getStatus()).toBe(400);
    expect(err.fields).toEqual([{ field: "schoolname", message: "That school doesn't exist." }]);
    expect(JSON.stringify([err.message, err.fields])).not.toContain("Secret Unknown School");
  });

  it("fails for a name that is only collation-equal, not just for an unknown one", async () => {
    fakeMysql();
    await expect(requireSchoolIdByName("Sample School ")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("withSchoolIds", () => {
  it("resolves the id for rows that carry only a name, once per distinct name", async () => {
    const find = fakeMysql();
    type Row = { schoolname: string; schoolid?: string; n: number };
    const input: Row[] = [
      { schoolname: "Sample School", n: 1 },
      { schoolname: "Sample School", n: 2 },
      { schoolname: "សាលាគំរូ", n: 3 },
    ];
    const rows = await withSchoolIds(input);
    expect(rows.map((r) => [r.n, r.schoolid])).toEqual([
      [1, "id-sample"],
      [2, "id-sample"],
      [3, "id-khmer"],
    ]);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("keeps a row that already has its id as it is (and does not look anything up)", async () => {
    const find = fakeMysql();
    const row = { schoolname: "Sample School", schoolid: "caller-resolved" };
    const [out] = await withSchoolIds([row]);
    expect(out).toEqual(row);
    expect(find).not.toHaveBeenCalled();
  });

  it("leaves a row with neither name nor id alone (the columns are nullable)", async () => {
    fakeMysql();
    const [out] = await withSchoolIds([{ n: 1 } as { schoolname?: string; schoolid?: string; n: number }]);
    expect(out).toEqual({ n: 1 });
  });

  it("fails the whole batch when one row names no school", async () => {
    fakeMysql();
    await expect(
      withSchoolIds([{ schoolname: "Sample School" }, { schoolname: "Sample School " }]),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
