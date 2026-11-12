import { StudentProgress } from "src/business/studentprogress.business";
import { ContentFake } from "src/test-support/content-fake";

/**
 * The roster export that goes to the learning server (`GET export/:school/students`, built by `StudentProgress`)
 * carries each exported learner's level awards, and only theirs, as whole rows: a valid `earnedat` and a boolean
 * `earnedat_approximate`. The models are an in-memory copy of the tables.
 */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const STU_A = uuid(1);
const STU_B = uuid(2);
const STU_OTHER = uuid(3);
const CUR = uuid(11);
const GRADE = uuid(12);
const LEVEL_1 = uuid(13);
const LEVEL_2 = uuid(14);

const db = new ContentFake();
const award = (n: number, studentid: string, levelid: string, extra: Record<string, unknown> = {}) =>
  db.add("studentawards", { studentawardid: uuid(100 + n), studentid, levelid, gradeid: GRADE, curid: CUR, earnedat: new Date("2026-09-02T03:00:00Z"), earnedat_approximate: false, ...extra });
const asLogin = (studentid: string) => ({ student: { studentid } }) as never;

describe("the roster export carries the learners' awards", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    db.install();
  });

  it("holds the awards of the exported learners and none of any other learner", async () => {
    award(1, STU_A, LEVEL_1);
    award(2, STU_A, LEVEL_2, { earnedat_approximate: true, earnedat: new Date("2026-10-01T00:00:00Z") });
    award(3, STU_B, LEVEL_1);
    award(4, STU_OTHER, LEVEL_1);
    const out = await new StudentProgress().getstudentprogress([asLogin(STU_A), asLogin(STU_B)]);
    expect(out.studentawards.map((a) => a.studentawardid).sort()).toEqual([uuid(101), uuid(102), uuid(103)]);
    expect(out.studentawards.every((a) => a.studentid !== STU_OTHER)).toBe(true);
  });

  it("every award row carries a valid earnedat and a boolean earnedat_approximate, and survives the JSON of the zip", async () => {
    award(1, STU_A, LEVEL_1);
    award(2, STU_A, LEVEL_2, { earnedat_approximate: true });
    const out = await new StudentProgress().getstudentprogress([asLogin(STU_A)]);
    const sent = JSON.parse(JSON.stringify(out)).studentawards as Array<Record<string, unknown>>;
    expect(sent).toHaveLength(2);
    for (const a of sent) {
      expect(typeof a.earnedat).toBe("string");
      expect(Number.isNaN(new Date(a.earnedat as string).getTime())).toBe(false);
      expect(typeof a.earnedat_approximate).toBe("boolean");
      for (const f of ["studentawardid", "studentid", "levelid", "gradeid", "curid"]) expect(typeof a[f]).toBe("string");
    }
  });

  it("is an empty list for learners with no awards, and the other progress lists are still there", async () => {
    const out = await new StudentProgress().getstudentprogress([asLogin(STU_A)]);
    expect(out).toEqual({
      studentprogress: [], studentlearningprogress: [], studentgradesprogress: [], studentlevelsprogress: [], studentlessonsprogress: [], studentawards: [],
    });
  });
});
