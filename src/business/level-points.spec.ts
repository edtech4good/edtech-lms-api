import { ContentFake } from "src/test-support/content-fake";
import { LessonBusiness } from "./lesson.business";
import { LevelBusiness } from "./level.business";
import { LevelQuizQuestionBusiness } from "./levelquizquestion.business";

/**
 * A grade's `points` are the sum of the `points` of its levels that are switched on and not deleted (a level's are the
 * `total_points` of its lessons that a learner can reach, not deleted and switched on, plus its `quiz_points` ONLY WHEN the level has
 * an active level-quiz question: a learner earns them only through that quiz): what a learner's progress is out of on the student
 * API. So every path that switches a level on or off, deletes it, adds it or moves it to another grade, every path that adds,
 * switches, moves or deletes one of its lessons, and every path that adds, switches or removes a level-quiz question recomputes
 * the level's points and its grade's.
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
  // G1 holds two live levels of 120 points each (a lesson of 100 and a level quiz of 20, which each has: one active question), so its points are 240; G2 holds one of 50 (no level quiz)
  db.add("grades", { gradeid: G1, curriculumid: id(3), gradename: "One", gradeorder: 1, gradestatus: true, points: 240 });
  db.add("grades", { gradeid: G2, curriculumid: id(3), gradename: "Two", gradeorder: 2, gradestatus: true, points: 50 });
  db.add("levels", { levelid: V1, gradeid: G1, levelname: "A", levelorder: 1, levelstatus: true, quiz_points: 20, points: 120 });
  db.add("levels", { levelid: V2, gradeid: G1, levelname: "B", levelorder: 2, levelstatus: true, quiz_points: 20, points: 120 });
  db.add("levels", { levelid: V3, gradeid: G2, levelname: "C", levelorder: 1, levelstatus: true, quiz_points: 0, points: 50 });
  db.add("lessons", { lessonid: id(21), levelid: V1, lessonname: "a", lessonstatus: true, total_points: 100 });
  db.add("lessons", { lessonid: id(22), levelid: V2, lessonname: "b", lessonstatus: true, total_points: 100 });
  db.add("lessons", { lessonid: id(23), levelid: V3, lessonname: "c", lessonstatus: true, total_points: 50 });
  db.add("levelquizquestions", { levelquizquestionid: id(41), levelid: V1, questionid: id(51), levelquizquestionstatus: true, levelquizquestionorder: 1 });
  db.add("levelquizquestions", { levelquizquestionid: id(42), levelid: V2, questionid: id(52), levelquizquestionstatus: true, levelquizquestionorder: 1 });
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
    db.add("lessons", { lessonid: id(24), levelid: V1, lessonname: "gone", lessonstatus: true, total_points: 100, isdeleted: true });
    const v1 = (await new LevelBusiness().getLevelid(V1))!;
    await new LevelBusiness().updateLevelPoints(v1);
    expect(points("levels", "levelid", V1)).toBe(120);
    expect(points("grades", "gradeid", G1)).toBe(240);
  });

  it("a level added to the grade is counted, and one moved to another grade leaves the first grade's total and joins the second's", async () => {
    const made = await new LevelBusiness().createLevel({ gradeid: G1, levelname: "D", levelorder: 3, quiz_points: 20 } as never, user);
    // a new level has no lessons and no level quiz: it is worth nothing yet
    expect(points("levels", "levelid", made.levelid)).toBe(0);
    expect(points("grades", "gradeid", G1)).toBe(240);
    await new LevelBusiness().updateLevel({ levelid: V2, gradeid: G2, levelname: "B", levelorder: 2, quiz_points: 20 } as never, user);
    expect(points("grades", "gradeid", G1)).toBe(120);
    expect(points("grades", "gradeid", G2)).toBe(50 + 120);
  });

  it("a level that does not exist changes nothing", async () => {
    const before = db.snapshot();
    expect(await new LevelBusiness().deavtivateLevel(id(77))).toBe(false);
    expect(await new LevelBusiness().activateLevel(id(77))).toBe(false);
    expect(db.snapshot()).toEqual(before);
  });
});

const quizRow = (n: number, levelid: string, over: Record<string, unknown> = {}) =>
  db.add("levelquizquestions", { levelquizquestionid: id(n), levelid, questionid: id(n + 100), levelquizquestionstatus: true, levelquizquestionorder: 1, ...over });
const quizRows = (levelid: string) => db.tables.levelquizquestions.filter((r) => r.levelid === levelid);

describe("a level's quiz_points count only when it has a level quiz", () => {
  it("a level without a level-quiz row is worth its lessons alone, whatever its quiz_points say; quiz_points itself is left as it is", async () => {
    db.tables.levels.find((r) => r.levelid === V3)!.quiz_points = 30;
    await new LevelBusiness().updateLevelPoints((await new LevelBusiness().getLevelid(V3))!);
    expect(points("levels", "levelid", V3)).toBe(50);
    expect(db.tables.levels.find((r) => r.levelid === V3)?.quiz_points).toBe(30);
    expect(points("grades", "gradeid", G2)).toBe(50);
    // the two levels that do have one keep their 120
    await new LevelBusiness().updateLevelPoints((await new LevelBusiness().getLevelid(V1))!);
    expect(points("levels", "levelid", V1)).toBe(120);
  });

  it("adding an active level-quiz question adds quiz_points on the next recompute, and removing it takes them away", async () => {
    const lq = new LevelQuizQuestionBusiness();
    await lq.createLevelQuizQuestion({ levelid: V3, questionid: id(61), levelquizquestionorder: 1 } as never);
    // V3 has quiz_points 0 here, so raise them: the rule is about the rows, not the number
    db.tables.levels.find((r) => r.levelid === V3)!.quiz_points = 30;
    await new LevelBusiness().updateLevelPoints((await new LevelBusiness().getLevelid(V3))!);
    expect(points("levels", "levelid", V3)).toBe(80);
    expect(points("grades", "gradeid", G2)).toBe(80);
    const added = quizRows(V3)[0].levelquizquestionid as string;
    expect(await lq.deleteLevelQuizQuestion(added)).toBe(true);
    expect(quizRows(V3)).toHaveLength(0);
    expect(points("levels", "levelid", V3)).toBe(50);
    expect(points("grades", "gradeid", G2)).toBe(50);
  });

  it("creating the first question of a level recomputes it by itself (the path that adds one)", async () => {
    db.tables.levels.find((r) => r.levelid === V3)!.quiz_points = 30;
    await new LevelQuizQuestionBusiness().createLevelQuizQuestion({ levelid: V3, questionid: id(61), levelquizquestionorder: 1 } as never);
    expect(points("levels", "levelid", V3)).toBe(80);
    expect(points("grades", "gradeid", G2)).toBe(80);
  });

  it("switching the only question off takes the quiz_points away, switching it on brings them back; a second active question changes nothing", async () => {
    const lq = new LevelQuizQuestionBusiness();
    expect(await lq.deactivateLevelQuizQuestion(id(41))).toBe(true);
    expect(points("levels", "levelid", V1)).toBe(100);
    expect(points("grades", "gradeid", G1)).toBe(220);
    expect(await lq.activateLevelQuizQuestion(id(41))).toBe(true);
    expect(points("levels", "levelid", V1)).toBe(120);
    expect(points("grades", "gradeid", G1)).toBe(240);
    quizRow(43, V1);
    await lq.deactivateLevelQuizQuestion(id(43));
    expect(points("levels", "levelid", V1)).toBe(120);
    await lq.activateLevelQuizQuestion(id(43));
    expect(points("levels", "levelid", V1)).toBe(120);
  });

  it("a question that is switched off does not make a quiz, and a question that does not exist changes nothing", async () => {
    quizRow(44, V3, { levelquizquestionstatus: false });
    db.tables.levels.find((r) => r.levelid === V3)!.quiz_points = 30;
    await new LevelBusiness().updateLevelPoints((await new LevelBusiness().getLevelid(V3))!);
    expect(points("levels", "levelid", V3)).toBe(50);
    const before = db.snapshot();
    const lq = new LevelQuizQuestionBusiness();
    expect(await lq.deleteLevelQuizQuestion(id(77))).toBe(false);
    expect(await lq.activateLevelQuizQuestion(id(77))).toBe(false);
    expect(await lq.deactivateLevelQuizQuestion(id(77))).toBe(false);
    expect(db.snapshot()).toEqual(before);
  });
});

describe("a level's points follow every change to its lessons", () => {
  it("deleting a lesson lowers its level's points and its grade's", async () => {
    expect(await new LessonBusiness().deleteLesson(id(21), user)).toBe(true);
    expect(points("levels", "levelid", V1)).toBe(20);
    expect(points("grades", "gradeid", G1)).toBe(140);
    expect(points("levels", "levelid", V2)).toBe(120);
  });

  it("switching a lesson off takes it out, switching it on puts it back", async () => {
    expect(await new LessonBusiness().deavtivateLesson(id(21))).toBe(true);
    expect(points("levels", "levelid", V1)).toBe(20);
    expect(points("grades", "gradeid", G1)).toBe(140);
    expect(await new LessonBusiness().activateLesson(id(21))).toBe(true);
    expect(points("levels", "levelid", V1)).toBe(120);
    expect(points("grades", "gradeid", G1)).toBe(240);
  });

  it("a lesson added to a level is counted", async () => {
    const made = await new LessonBusiness().createLesson({ levelid: V1, lessonname: "new", total_points: 30 } as never, user);
    expect(made.lessonstatus).toBe(true);
    expect(points("levels", "levelid", V1)).toBe(150);
    expect(points("grades", "gradeid", G1)).toBe(270);
  });

  it("a lesson moved to another level leaves the first level's points and joins the second's, and both grades follow", async () => {
    expect(
      await new LessonBusiness().updateLesson({ lessonid: id(21), levelid: V3, lessonname: "a", lessonorder: 2, total_points: 100 } as never, user),
    ).toBeTruthy();
    expect(db.tables.lessons.find((r) => r.lessonid === id(21))?.levelid).toBe(V3);
    // V1 keeps only its level quiz's 20; V3 gains the lesson's 100 (and has no level quiz, so no quiz_points)
    expect(points("levels", "levelid", V1)).toBe(20);
    expect(points("levels", "levelid", V3)).toBe(150);
    expect(points("grades", "gradeid", G1)).toBe(140);
    expect(points("grades", "gradeid", G2)).toBe(150);
  });

  it("a lesson whose total_points change moves its level's points; a lesson that does not exist changes nothing", async () => {
    await new LessonBusiness().updateLesson({ lessonid: id(21), levelid: V1, lessonname: "a", lessonorder: 1, total_points: 40 } as never, user);
    expect(points("levels", "levelid", V1)).toBe(60);
    const before = db.snapshot();
    expect(await new LessonBusiness().deleteLesson(id(77), user)).toBe(false);
    expect(await new LessonBusiness().activateLesson(id(77))).toBe(false);
    expect(await new LessonBusiness().deavtivateLesson(id(77))).toBe(false);
    expect(db.snapshot()).toEqual(before);
  });
});
