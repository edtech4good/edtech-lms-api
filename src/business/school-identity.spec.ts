import { schools } from "src/models/data-models/school";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import {
  findSchoolSegment,
  isSameSchoolName,
  normaliseSchoolName,
  requireSchoolByName,
  resolveSchoolById,
  resolveSchoolRef,
  resolveSchoolSegment,
  resolveSchoolByName,
  resolveSchoolByNameForRead,
  withSchoolIds,
} from "./school-identity";

/**
 * The database is replaced by `schools.findAll`/`findOne`. `findAll` stands in
 * for MySQL's `WHERE schoolname = ?` and returns every school whose name is
 * EQUAL UNDER THE COLLATION (case, trailing spaces and the Khmer nikahit/bantoc
 * marks do not count), exactly as the real column does. What is under test is
 * which of those candidates the resolver accepts, and what it returns. The
 * real-collation proof is in the PR description.
 */

// Case folded, trailing spaces ignored, nikahit (U+17C6) and bantoc (U+17CB) weigh nothing.
const collate = (s: string) => s.replace(/[ំ់]/g, "").replace(/ +$/, "").toLowerCase();

const SAMPLE = { schoolid: "id-sample", schoolname: "Sample School" };
const KHMER = { schoolid: "id-khmer", schoolname: "សាលាគំរូ" }; // has nikahit U+17C6
const CLOSED = { schoolid: "id-closed", schoolname: "Sample Closed School" }; // soft-deleted in the table
const SCHOOLS = [SAMPLE, KHMER, CLOSED];

// The lookup is `WHERE TRIM(schoolname) = ?` (a Sequelize `where(fn, value)`): `logic` is the given value.
const givenInWhere = (where: unknown): string => (where as { logic: string }).logic;
const sqlTrim = (s: string) => s.replace(/^ +| +$/g, "");

const fakeMysql = (rows = SCHOOLS) => {
  const findAll = jest.spyOn(schools, "findAll").mockImplementation((async (opts: { where: unknown }) => {
    // honour the function the lookup applies to the column: only TRIM strips the stored name's spaces
    const trims = (opts.where as { attribute: { fn: string } }).attribute.fn === "TRIM";
    return rows.filter((r) => collate(trims ? sqlTrim(r.schoolname) : r.schoolname) === collate(givenInWhere(opts.where)));
  }) as never);
  const findOne = jest.spyOn(schools, "findOne").mockImplementation((async (opts: { where: { schoolid: string } }) =>
    rows.find((r) => r.schoolid === opts.where.schoolid) ?? null) as never);
  return { findAll, findOne };
};

afterEach(() => jest.restoreAllMocks());

describe("the comparison", () => {
  it("normalises by trimming, NFC and lower-casing", () => {
    expect(normaliseSchoolName("  Sample School\t")).toBe("sample school");
    expect(normaliseSchoolName("Café")).toBe(normaliseSchoolName("Café")); // NFD == NFC
  });

  it("treats trailing space, surrounding space, capitals and NFC/NFD as the same name", () => {
    expect(isSameSchoolName("Sample School", "Sample School ")).toBe(true);
    expect(isSameSchoolName("Sample School", "  SAMPLE school")).toBe(true);
    expect(isSameSchoolName("Café School", "Café School")).toBe(true);
  });

  it("treats a Khmer mark, an accent or any other difference as a different name", () => {
    expect(isSameSchoolName("សាលាគំរូ", "សាលាគរូ")).toBe(false); // nikahit missing
    expect(isSameSchoolName("Café School", "Cafe School")).toBe(false);
    expect(isSameSchoolName("Sample School", "Sample  School")).toBe(false); // inner space
    expect(isSameSchoolName("Sample School", "Sample Schools")).toBe(false);
  });

  it("is false for empty or non-string input", () => {
    expect(isSameSchoolName("", "")).toBe(false);
    expect(isSameSchoolName("   ", " ")).toBe(false);
    expect(isSameSchoolName(undefined, "x")).toBe(false);
    expect(isSameSchoolName("x", null)).toBe(false);
  });
});

describe("resolveSchoolByName", () => {
  it("returns the id and the school's OWN stored name", async () => {
    fakeMysql();
    await expect(resolveSchoolByName("Sample School")).resolves.toEqual(SAMPLE);
    await expect(resolveSchoolByName("សាលាគំរូ")).resolves.toEqual(KHMER);
  });

  it("finds the school for a trailing space, surrounding space or different capitals, and returns the stored name, not the given one", async () => {
    fakeMysql();
    for (const given of ["Sample School ", "  Sample School", "SAMPLE SCHOOL", "sample school\t"]) {
      await expect(resolveSchoolByName(given)).resolves.toEqual(SAMPLE);
    }
  });

  it("does NOT resolve a Khmer name that differs from the school's only by a mark the collation ignores", async () => {
    fakeMysql();
    const withoutNikahit = "សាលាគរូ";
    expect(await schools.findAll({ where: { attribute: { fn: "TRIM" }, logic: withoutNikahit } } as never)).toHaveLength(1); // MySQL would offer it
    await expect(resolveSchoolByName(withoutNikahit)).resolves.toBeNull();
  });

  it("does NOT resolve an accent difference the collation ignores", async () => {
    // MySQL's _ci collation offers "Cafe School" as a candidate for "Café School"; the resolver must refuse it.
    jest.spyOn(schools, "findAll").mockResolvedValue([{ schoolid: "id-cafe", schoolname: "Cafe School" }] as never);
    await expect(resolveSchoolByName("Caf\u00e9 School")).resolves.toBeNull();
  });

  it("picks the one that passes when several names are collation-equal", async () => {
    fakeMysql([
      { schoolid: "id-a", schoolname: "សាលាគរូ" },
      { schoolid: "id-b", schoolname: "សាលាគំរូ" },
    ]);
    await expect(resolveSchoolByName("សាលាគំរូ")).resolves.toEqual({ schoolid: "id-b", schoolname: "សាលាគំរូ" });
    await expect(resolveSchoolByName("សាលាគរូ")).resolves.toEqual({ schoolid: "id-a", schoolname: "សាលាគរូ" });
  });

  it("acts on none when more than one candidate passes the comparison, and says so", async () => {
    fakeMysql([
      { schoolid: "id-1", schoolname: "Sample School" },
      { schoolid: "id-2", schoolname: "sample school" },
    ]);
    const err = await resolveSchoolByName("Sample School").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    expect(err.fields).toEqual([{ field: "schoolname", message: "That school name matches more than one school." }]);
  });

  it("returns null for a name that matches no school, and for empty, blank, missing or non-string input, without asking the database", async () => {
    const { findAll } = fakeMysql();
    await expect(resolveSchoolByName("No Such School")).resolves.toBeNull();
    findAll.mockClear();
    for (const bad of ["", "   ", undefined, null, 5 as unknown as string]) {
      await expect(resolveSchoolByName(bad)).resolves.toBeNull();
    }
    expect(findAll).not.toHaveBeenCalled();
  });

  it("resolves a soft-deleted school: the id is identity, not liveness (no isdeleted filter)", async () => {
    const { findAll } = fakeMysql();
    await expect(resolveSchoolByName("Sample Closed School")).resolves.toEqual(CLOSED);
    // the column is SELECTED (a read may prefer the live school) but never filtered on
    expect(JSON.stringify(findAll.mock.calls[0][0]?.where)).not.toMatch(/isdeleted/);
  });

  it("narrows the database lookup with TRIM(schoolname) = the trimmed, NFC form of the name", async () => {
    const { findAll } = fakeMysql();
    await resolveSchoolByName("  Cafe\u0301 School ");
    const where = findAll.mock.calls[0][0]!.where as unknown as { attribute: { fn: string }; logic: string };
    expect(where.attribute.fn).toBe("TRIM");
    expect(where.logic).toBe("Caf\u00e9 School");
  });

  it("finds a school whose STORED name has surrounding spaces (it would otherwise never be found by name)", async () => {
    fakeMysql([{ schoolid: "id-padded", schoolname: "  Padded School  " }]);
    await expect(resolveSchoolByName("Padded School")).resolves.toEqual({ schoolid: "id-padded", schoolname: "  Padded School  " });
    await expect(resolveSchoolByName(" padded school ")).resolves.toEqual({ schoolid: "id-padded", schoolname: "  Padded School  " });
  });

  describe("lock order: choose unlocked, then lock ONE row by primary key, then decide again on the locked row", () => {
    const tx = { LOCK: { SHARE: "SHARE-LOCK" } };

    it("the narrowing read takes NO lock (a locked scan of the name index blocks unrelated schools and deadlocks with a rename)", async () => {
      const { findAll } = fakeMysql();
      await resolveSchoolByName("Sample School", tx as never);
      const options = findAll.mock.calls[0][0] as Record<string, unknown>;
      expect(options.transaction).toBe(tx);
      expect(options.lock).toBeUndefined();
    });

    it("then locks the chosen school BY PRIMARY KEY, shared, in the writer's transaction", async () => {
      const { findOne } = fakeMysql();
      await expect(resolveSchoolByName("Sample School", tx as never)).resolves.toEqual(SAMPLE);
      expect(findOne).toHaveBeenCalledTimes(1);
      expect(findOne.mock.calls[0][0]).toEqual(
        expect.objectContaining({ where: { schoolid: SAMPLE.schoolid }, transaction: tx, lock: "SHARE-LOCK" }),
      );
    });

    it("applies the name comparison again on the LOCKED row: a school renamed after the narrowing read is not found", async () => {
      const { findOne } = fakeMysql();
      findOne.mockResolvedValue({ schoolid: SAMPLE.schoolid, schoolname: "Renamed Meanwhile" } as never);
      await expect(resolveSchoolByName("Sample School", tx as never)).resolves.toBeNull();
    });

    it("returns the name the locked row has now (it may differ in case or spacing from the narrowing read)", async () => {
      const { findOne } = fakeMysql();
      findOne.mockResolvedValue({ schoolid: SAMPLE.schoolid, schoolname: " SAMPLE school" } as never);
      await expect(resolveSchoolByName("Sample School", tx as never)).resolves.toEqual({ schoolid: SAMPLE.schoolid, schoolname: " SAMPLE school" });
    });

    it("a school that disappeared between the read and the lock is not found", async () => {
      const { findOne } = fakeMysql();
      findOne.mockResolvedValue(null as never);
      await expect(resolveSchoolByName("Sample School", tx as never)).resolves.toBeNull();
    });

    it("more than one candidate fails before any lock is taken", async () => {
      const { findOne } = fakeMysql([
        { schoolid: "id-1", schoolname: "Sample School" },
        { schoolid: "id-2", schoolname: "sample school" },
      ]);
      await expect(resolveSchoolByName("Sample School", tx as never)).rejects.toBeInstanceOf(ApiError);
      expect(findOne).not.toHaveBeenCalled();
    });

    it("no name match locks nothing", async () => {
      const { findOne } = fakeMysql();
      await expect(resolveSchoolByName("Nowhere", tx as never)).resolves.toBeNull();
      expect(findOne).not.toHaveBeenCalled();
    });

    it("without a transaction there is nothing to lock", async () => {
      const { findOne } = fakeMysql();
      await expect(resolveSchoolByName("Sample School")).resolves.toEqual(SAMPLE);
      expect(findOne).not.toHaveBeenCalled();
    });
  });
});

describe("resolveSchoolById", () => {
  it("reads the school inside the transaction under a shared lock, live or soft-deleted", async () => {
    const { findOne } = fakeMysql();
    const tx = { LOCK: { SHARE: "SHARE-LOCK" } };
    await expect(resolveSchoolById("id-closed", tx as never)).resolves.toEqual(CLOSED);
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction: tx, lock: "SHARE-LOCK" }));
    expect(JSON.stringify(findOne.mock.calls[0][0])).not.toMatch(/isdeleted/);
  });

  it("returns null for an unknown, empty or missing id", async () => {
    fakeMysql();
    await expect(resolveSchoolById("nope")).resolves.toBeNull();
    await expect(resolveSchoolById("")).resolves.toBeNull();
    await expect(resolveSchoolById(undefined)).resolves.toBeNull();
  });
});

describe("requireSchoolByName", () => {
  it("returns the school", async () => {
    fakeMysql();
    await expect(requireSchoolByName("sample school ")).resolves.toEqual(SAMPLE);
  });

  it("fails clearly with a 400 field error when the name matches no school, without echoing the name", async () => {
    fakeMysql();
    const err = await requireSchoolByName("Secret Unknown School", undefined, "schoolname").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    expect(err.getStatus()).toBe(400);
    expect(err.fields).toEqual([{ field: "schoolname", message: "That school doesn't exist." }]);
    expect(JSON.stringify([err.message, err.fields])).not.toContain("Secret Unknown School");
  });

  it("fails for a Khmer-mark variant, not just for an unknown name", async () => {
    fakeMysql();
    await expect(requireSchoolByName("សាលាគរូ")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("withSchoolIds", () => {
  type Row = { schoolname?: string; schoolid?: string; n: number };

  it("resolves id and stored name for name-only rows, once per distinct given text", async () => {
    const { findAll } = fakeMysql();
    const input: Row[] = [
      { schoolname: "sample school ", n: 1 },
      { schoolname: "sample school ", n: 2 },
      { schoolname: "សាលាគំរូ", n: 3 },
    ];
    const rows = await withSchoolIds(input);
    expect(rows.map((r) => [r.n, r.schoolid, r.schoolname])).toEqual([
      [1, "id-sample", "Sample School"],
      [2, "id-sample", "Sample School"],
      [3, "id-khmer", "សាលាគំរូ"],
    ]);
    expect(findAll).toHaveBeenCalledTimes(2);
  });

  it("re-reads the school for a row that already carries an id, and stores the school's CURRENT stored name", async () => {
    const { findOne } = fakeMysql([{ schoolid: "id-sample", schoolname: "Renamed School" }]);
    const tx = { LOCK: { SHARE: "S" } };
    const [row] = await withSchoolIds([{ schoolid: "id-sample", schoolname: "Sample School (read before the rename)" } as Row], tx as never);
    expect(row.schoolname).toBe("Renamed School");
    expect(row.schoolid).toBe("id-sample");
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction: tx, lock: "S" }));
  });

  it("fails when a row's id matches no school", async () => {
    fakeMysql();
    await expect(withSchoolIds([{ schoolid: "gone", schoolname: "x" }])).rejects.toBeInstanceOf(ApiError);
  });

  it("refuses a row with neither name nor id (400, nothing is returned to insert): a learner or login always belongs to a school", async () => {
    fakeMysql();
    const err = await withSchoolIds([{ n: 1 } as Row]).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.getStatus()).toBe(400);
    expect(err.message).toBe("Choose a school.");
    expect(err.fields).toEqual([{ field: "schoolid", message: "Choose a school." }]);
  });

  it("refuses a row whose name and id are both empty, and a batch where only the second row names no school", async () => {
    fakeMysql();
    await expect(withSchoolIds([{ schoolid: "", schoolname: "" } as Row])).rejects.toMatchObject({ message: "Choose a school." });
    await expect(withSchoolIds([{ schoolname: "Sample School" }, { n: 2 } as Row])).rejects.toMatchObject({ message: "Choose a school." });
  });

  it("fails the whole batch when one row names no school", async () => {
    fakeMysql();
    await expect(withSchoolIds([{ schoolname: "Sample School" }, { schoolname: "សាលាគរូ" }])).rejects.toBeInstanceOf(ApiError);
  });
});

describe("reading: a school named at a route's boundary", () => {
  it("resolveSchoolRef: an id is checked to exist and returned with the school's own name", async () => {
    fakeMysql();
    await expect(resolveSchoolRef({ schoolid: "id-sample" })).resolves.toEqual(SAMPLE);
  });

  it("resolveSchoolRef: a name is resolved with the writers' text rule", async () => {
    fakeMysql();
    await expect(resolveSchoolRef({ schoolname: " SAMPLE school " })).resolves.toEqual(SAMPLE);
    await expect(resolveSchoolRef({ schoolname: "សាលាគំរូ" })).resolves.toEqual(KHMER);
  });

  it("resolveSchoolRef: the id wins when both are given; blank or missing means no school filter", async () => {
    fakeMysql();
    await expect(resolveSchoolRef({ schoolid: "id-khmer", schoolname: "Sample School" })).resolves.toEqual(KHMER);
    for (const none of [{}, { schoolname: "" }, { schoolname: "   " }, { schoolid: null, schoolname: undefined }, { schoolid: 5 as never }]) {
      await expect(resolveSchoolRef(none)).resolves.toBeUndefined();
    }
  });

  it("resolveSchoolRef: an unknown id or name is a 404, and so is a name that differs only by a Khmer mark", async () => {
    fakeMysql();
    for (const ref of [{ schoolid: "nope" }, { schoolname: "Nowhere" }, { schoolname: "សាលាគរូ" }]) {
      await expect(resolveSchoolRef(ref)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, message: "That school doesn't exist." });
    }
  });

  it("resolveSchoolRef: an ambiguous name fails rather than picking one", async () => {
    fakeMysql([
      { schoolid: "id-1", schoolname: "Sample School" },
      { schoolid: "id-2", schoolname: "sample school" },
    ]);
    await expect(resolveSchoolRef({ schoolname: "Sample School" })).rejects.toBeInstanceOf(ApiError);
  });

  describe("a path segment that is a name or an id", () => {
    const ID = "11111111-1111-4111-8111-111111111111";
    const uuidSchool = { schoolid: ID, schoolname: "Uuid School" };

    it("a UUID that is a school's id is that school; a name is resolved as a name", async () => {
      fakeMysql([...SCHOOLS, uuidSchool]);
      await expect(findSchoolSegment(ID)).resolves.toEqual(uuidSchool);
      await expect(findSchoolSegment("Sample School")).resolves.toEqual(SAMPLE);
      await expect(findSchoolSegment("  uuid SCHOOL")).resolves.toEqual(uuidSchool);
    });

    it("a UUID that is no school's id falls through to the name rule, then is not found", async () => {
      fakeMysql();
      await expect(findSchoolSegment(ID)).resolves.toBeNull();
      await expect(resolveSchoolSegment(ID)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });

    it("resolveSchoolSegment returns the id and the school's stored name (for file names); unknown is a 404", async () => {
      fakeMysql();
      await expect(resolveSchoolSegment("sample school")).resolves.toEqual(SAMPLE);
      await expect(resolveSchoolSegment("Nowhere")).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
      await expect(resolveSchoolSegment("សាលាគរូ")).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });
  });
});

describe("reading prefers the live school; writing never guesses", () => {
  // Two schools may come to share a name once the unique index no longer covers soft-deleted rows.
  const LIVE = { schoolid: "id-live", schoolname: "Sample School", isdeleted: false };
  const GONE = { schoolid: "id-gone", schoolname: "Sample School", isdeleted: true };
  const LIVE2 = { schoolid: "id-live-2", schoolname: "sample school", isdeleted: false };
  const GONE2 = { schoolid: "id-gone-2", schoolname: "Sample School ", isdeleted: true };
  const ID = "11111111-1111-4111-8111-111111111111";

  it("one live and one soft-deleted school of the name: a read by name is the live one", async () => {
    fakeMysql([LIVE, GONE]);
    const live = { schoolid: "id-live", schoolname: "Sample School" };
    await expect(resolveSchoolByNameForRead("Sample School")).resolves.toEqual(live);
    await expect(resolveSchoolRef({ schoolname: " sample SCHOOL" })).resolves.toEqual(live);
    await expect(findSchoolSegment("Sample School", { forRead: true })).resolves.toEqual(live);
    await expect(resolveSchoolSegment("Sample School", { forRead: true })).resolves.toEqual(live);
  });

  it("the soft-deleted namesake is still reachable by its id", async () => {
    fakeMysql([LIVE, GONE]);
    await expect(resolveSchoolRef({ schoolid: "id-gone" })).resolves.toEqual({ schoolid: "id-gone", schoolname: "Sample School" });
  });

  it("two live schools of the name stay ambiguous (400) for a read, and so do two soft-deleted ones", async () => {
    fakeMysql([LIVE, LIVE2, GONE]);
    await expect(resolveSchoolByNameForRead("Sample School")).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    await expect(resolveSchoolRef({ schoolname: "Sample School" })).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    fakeMysql([GONE, GONE2]);
    await expect(resolveSchoolRef({ schoolname: "Sample School" })).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it("a single match is returned whether it is live or soft-deleted, and no match is null", async () => {
    fakeMysql([GONE]);
    await expect(resolveSchoolByNameForRead("Sample School")).resolves.toEqual({ schoolid: "id-gone", schoolname: "Sample School" });
    await expect(resolveSchoolByNameForRead("Nowhere")).resolves.toBeNull();
  });

  it("the writers' resolver does NOT prefer the live school: the id is identity, so a shared name fails", async () => {
    fakeMysql([LIVE, GONE]);
    await expect(resolveSchoolByName("Sample School")).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    await expect(requireSchoolByName("Sample School")).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    // and a segment resolved for a write (no forRead) fails the same way
    await expect(findSchoolSegment("Sample School")).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    await expect(resolveSchoolSegment("Sample School")).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it("a UUID segment that is a school's id is that school, forRead or not", async () => {
    fakeMysql([LIVE, GONE, { schoolid: ID, schoolname: "Uuid School", isdeleted: true }]);
    await expect(findSchoolSegment(ID, { forRead: true })).resolves.toEqual({ schoolid: ID, schoolname: "Uuid School" });
  });
});
