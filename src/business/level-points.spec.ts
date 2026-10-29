import { ContentFake } from "src/test-support/content-fake";
import { LevelBusiness } from "./level.business";

/**
 * A grade's `points` are the sum of the `points` of its levels that are switched on and not deleted (a level's are the
 * `total_points` of its lessons that are not deleted plus its `quiz_points`): what a learner's progress is out of on the student
 * API. So every path that switches a level on or off, deletes it, adds it or moves it to another grade recomputes the grade's.
 * (The readiness import writes the same numbers by the same rule: scripts/lib/dcrs-content-plan.js.)
 */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const G1 = id(1), G2 = id(2);
const V1 = id(11), V2 = id(12), V3 = id(13);
const user = { lmsuserid: id(99) } as never;

const points = (table: "grades" | "levels", key: "gradeid" | "levelid", rowid: string): unknown => db.tables[table].find((r) => r[key] === rowid)?.points;

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  // G1 holds two live levels of 120 points each (a lesson of 100 and a level quiz of 20), so its points are 240; G2 holds one of 50
  db.add("grades", { gradeid: G1, curriculumid: id(3), gradename: "One", gradeorder: 1, gradestatus: true, points: 240 });
  db.add("grades", { gradeid: G2, curriculumid: id(3), gradename: "Two", gradeorder: 2, gradestatus: true, points: 50 });
  db.add("levels", { levelid: V1, gradeid: G1, levelname: "A", levelorder: 1, levelstatus: true, quiz_points: 20, points: 120 });
  db.add("levels", { levelid: V2, gradeid: G1, levelname: "B", levelorder: 2, levelstatus: true, quiz_points: 20, points: 120 });
  db.add("levels", { levelid: V3, gradeid: G2, levelname: "C", levelorder: 1, levelstatus: true, quiz_points: 0, points: 50 });
  db.add("lessons", { lessonid: id(21), levelid: V1, lessonname: "a", total_points: 100 });
  db.add("lessons", { lessonid: id(22), levelid: V2, lessonname: "b", total_points: 100 });
  db.add("lessons", { lessonid: id(23), levelid: V3, lessonname: "c", total_points: 50 });
});

describe("the grade's points follow the levels that are switched on", () => {
  it("switching a level off lowers the grade's points by the level's, and leaves the level's own points and every other grade alone", async () => {
    expect(await new LevelBusiness().deavtivateLevel(V2)).toBe(true);
    expect(db.tables.levels.find((r) => r.levelid === V2)?.levelstatus).toBe(false);
    expect(points("grades", "gradeid", G1)).toBe(120);
    expect(points("levels", "levelid", V2)).toBe(120);
    expect(points("grades", "gradeid", G2)).toBe(50);
  });

  it("switching it on raises them again", async () => {
    await new LevelBusiness().deavtivateLevel(V2);
    await new LevelBusiness().deavtivateLevel(V1);
    expect(points("grades", "gradeid", G1)).toBe(0);
    expect(await new LevelBusiness().activateLevel(V2)).toBe(true);
    expect(points("grades", "gradeid", G1)).toBe(120);
    await new LevelBusiness().activateLevel(V1);
    expect(points("grades", "gradeid", G1)).toBe(240);
  });

  it("deleting a level lowers them, and a deleted level is not counted again by a later recompute", async () => {
    expect(await new LevelBusiness().deleteLevel(V2, user)).toBe(true);
    expect(points("grades", "gradeid", G1)).toBe(120);
    await new LevelBusiness().updateLevelPoints((await new LevelBusiness().getLevelid(V1))!);
    expect(points("grades", "gradeid", G1)).toBe(120);
  });

  it("a level that is switched off stays out of the grade whatever else is recomputed", async () => {
    await new LevelBusiness().deavtivateLevel(V2);
    const v1 = (await new LevelBusiness().getLevelid(V1))!;
    await new LevelBusiness().updateLevelPoints(v1);
    expect(points("grades", "gradeid", G1)).toBe(120);
  });

  it("a lesson that is deleted is not in the level's points", async () => {
    db.add("lessons", { lessonid: id(24), levelid: V1, lessonname: "gone", total_points: 100, isdeleted: true });
    const v1 = (await new LevelBusiness().getLevelid(V1))!;
    await new LevelBusiness().updateLevelPoints(v1);
    expect(points("levels", "levelid", V1)).toBe(120);
    expect(points("grades", "gradeid", G1)).toBe(240);
  });

  it("a level added to the grade is counted, and one moved to another grade leaves the first grade's total and joins the second's", async () => {
    const made = await new LevelBusiness().createLevel({ gradeid: G1, levelname: "D", levelorder: 3, quiz_points: 20 } as never, user);
    expect(points("levels", "levelid", made.levelid)).toBe(20);
    expect(points("grades", "gradeid", G1)).toBe(260);
    await new LevelBusiness().updateLevel({ levelid: V2, gradeid: G2, levelname: "B", levelorder: 2, quiz_points: 20 } as never, user);
    expect(points("grades", "gradeid", G1)).toBe(140);
    expect(points("grades", "gradeid", G2)).toBe(50 + 120);
  });

  it("a level that does not exist changes nothing", async () => {
    const before = db.snapshot();
    expect(await new LevelBusiness().deavtivateLevel(id(77))).toBe(false);
    expect(await new LevelBusiness().activateLevel(id(77))).toBe(false);
    expect(db.snapshot()).toEqual(before);
  });
});
