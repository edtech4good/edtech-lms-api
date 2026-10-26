import { orderBy } from "lodash";
import { OrgContext } from "src/decorators/org.decorator";
import { grades } from "src/models/data-models/grades";
import { lessonlearnings } from "src/models/data-models/lessonlearnings";
import { lessons } from "src/models/data-models/lessons";
import { levels } from "src/models/data-models/levels";
import { students } from "src/models/data-models/students";
import { ContentFake } from "src/test-support/content-fake";
import { CurriculumBusiness } from "./curriculum.business";
import { buildCurriculumTree } from "./curriculum-tree";
import { GradeBusiness } from "./grade.business";
import { LessonBusiness } from "./lesson.business";
import { LessonPracticeBusiness } from "./lessonpractice.business";
import { LessonQuizBusiness } from "./lessonquiz.business";
import { LevelBusiness } from "./level.business";

/**
 * The counts on the curriculum tree (`GET /curriculum/tree`, `GET /curriculum/tree/:curriculumid`): `childcount` on every
 * node, `enrolmentcount` on every curriculum. They are ADDED: everything else in the tree is what it was, in the same
 * order, which is proved against the tree's previous builder kept below as the reference.
 * (The routes, the scope and the other organisations are proved over HTTP in modules/content-scope.leak.spec.ts.)
 */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orgX: OrgContext = { organisationid: X, isplatform: false, permissions: [] };
const platform: OrgContext = { organisationid: null, isplatform: true, permissions: [] };

// X: curriculum C1 (grades G1, G2 and a deleted G3), curriculum C2 (no grades). Y: curriculum C3 with one grade.
const C1 = id(1), C2 = id(2), C3 = id(3);
const G1 = id(11), G2 = id(12), G3 = id(13), G9 = id(19);
const V1 = id(21), V2 = id(22), V3 = id(23), V9 = id(29);
const L1 = id(31), L2 = id(32), L3 = id(33), L9 = id(39);
const SX = id(41), SY = id(42);

const seed = () => {
  db.add("curriculums", { curriculumid: C1, curriculumname: "Reading", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: C2, curriculumname: "Maths", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: C3, curriculumname: "Other", organisationid: Y, curriculumstatus: true });
  db.add("grades", { gradeid: G1, curriculumid: C1, gradename: "Grade one", gradeorder: 1, gradestatus: true });
  db.add("grades", { gradeid: G2, curriculumid: C1, gradename: "Grade two", gradeorder: 2, gradestatus: true });
  db.add("grades", { gradeid: G3, curriculumid: C1, gradename: "Grade gone", gradeorder: 3, gradestatus: true, isdeleted: true });
  db.add("grades", { gradeid: G9, curriculumid: C3, gradename: "Their grade", gradeorder: 1, gradestatus: true });
  // G1 holds levels V2 (listed first by order), V1 and a deleted V3; G2 none
  db.add("levels", { levelid: V1, gradeid: G1, levelname: "Level B", levelorder: 2, levelstatus: true });
  db.add("levels", { levelid: V2, gradeid: G1, levelname: "Level A", levelorder: 1, levelstatus: true });
  db.add("levels", { levelid: V3, gradeid: G1, levelname: "Level gone", levelorder: 3, levelstatus: true, isdeleted: true });
  db.add("levels", { levelid: V9, gradeid: G9, levelname: "Their level", levelorder: 1, levelstatus: true });
  // V1 holds lessons L1, L2 and a deleted L3
  db.add("lessons", { lessonid: L1, levelid: V1, lessonname: "Lesson 1", lessonorder: 2, lessonstatus: true });
  db.add("lessons", { lessonid: L2, levelid: V1, lessonname: "Lesson 2", lessonorder: 1, lessonstatus: true });
  db.add("lessons", { lessonid: L3, levelid: V1, lessonname: "Lesson gone", lessonorder: 3, lessonstatus: true, isdeleted: true });
  db.add("lessons", { lessonid: L9, levelid: V9, lessonname: "Their lesson", lessonorder: 1, lessonstatus: true });
  // L1 holds two learning items, three quizzes, one practice; L2 nothing; L9 (Y's) one of each
  for (const n of [1, 2]) db.add("lessonlearnings", { lessonlearningid: id(50 + n), lessonid: L1, lessonlearningname: `Learning ${n}`, lessonlearningorder: n, lessonlearningstatus: true });
  for (const n of [1, 2, 3]) db.add("lessonquizzes", { lessonquizid: id(60 + n), lessonid: L1, lessonquizname: `Quiz ${n}`, lessonquizorder: 4 - n, lessonquizstatus: true });
  db.add("lessonpractices", { lessonpracticeid: id(70), lessonid: L1, lessonpracticename: "Practice", lessonpracticeorder: 1, lessonpracticestatus: true });
  db.add("lessonlearnings", { lessonlearningid: id(58), lessonid: L9, lessonlearningname: "Their learning", lessonlearningorder: 1, lessonlearningstatus: true });
  db.add("lessonquizzes", { lessonquizid: id(68), lessonid: L9, lessonquizname: "Their quiz", lessonquizorder: 1, lessonquizstatus: true });
  db.add("lessonpractices", { lessonpracticeid: id(78), lessonid: L9, lessonpracticename: "Their practice", lessonpracticeorder: 1, lessonpracticestatus: true });
  // schools and learners: X's school has two live learners and a deleted one on C1, one on C2; Y's school has one on C1
  db.add("schools", { schoolid: SX, schoolname: "School X", organisationid: X });
  db.add("schools", { schoolid: SY, schoolname: "School Y", organisationid: Y });
  db.add("students", { studentid: id(81), schoolid: SX, curriculumid: C1 });
  db.add("students", { studentid: id(82), schoolid: SX, curriculumid: C1 });
  db.add("students", { studentid: id(83), schoolid: SX, curriculumid: C1, isdeleted: true });
  db.add("students", { studentid: id(84), schoolid: SX, curriculumid: C2 });
  db.add("students", { studentid: id(85), schoolid: SY, curriculumid: C1 });
};

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  seed();
});

/** The tree builder as it was before the counts (the two tree routes' code), kept as the reference for "nothing else changed". */
const previousTree = async (org: OrgContext, only?: string) => {
  const curriculums = await new CurriculumBusiness(org).getCurriculums();
  const gs = await new GradeBusiness(org).getGrades();
  const vs = await new LevelBusiness(org).getLevels();
  const ls = await new LessonBusiness(org).getLessons();
  const lessonquizzes = await new LessonQuizBusiness(org).getLessonQuizzes();
  const lessonpractices = await new LessonPracticeBusiness(org).getLessonPractices();
  return curriculums
    .filter((x) => only === undefined || x.curriculumid === only)
    .map((curriculum) => {
      const tempc: any = { ...curriculum.toJSON() };
      tempc.grades = gs
        .filter((x) => x.curriculumid === curriculum.curriculumid)
        .map((grade) => {
          const tempg: any = { ...grade.toJSON() };
          tempg.levels = orderBy(
            vs
              .filter((x) => x.gradeid === grade.gradeid)
              .map((level) => {
                const templev: any = { ...level.toJSON() };
                templev.lessons = orderBy(
                  ls
                    .filter((x) => x.levelid === level.levelid)
                    .map((lesson) => ({
                      ...lesson.toJSON(),
                      quizzes: orderBy(lessonquizzes.filter((x) => x.lessonid === lesson.lessonid).map((x) => x.toJSON()), "lessonquizorder"),
                      practices: orderBy(lessonpractices.filter((x) => x.lessonid === lesson.lessonid).map((x) => x.toJSON()), "lessonpracticeorder"),
                    })),
                  "lessonorder",
                );
                return templev;
              }),
            "levelorder",
          );
          return tempg;
        });
      return tempc;
    });
};

/** A tree without the keys this change adds. */
const withoutCounts = (nodes: any[]): any[] =>
  nodes.map((c) => {
    const { childcount, enrolmentcount, ...curriculum } = c;
    return {
      ...curriculum,
      grades: c.grades.map((g: any) => {
        const { childcount: gc, ...grade } = g;
        return {
          ...grade,
          levels: g.levels.map((v: any) => {
            const { childcount: vc, ...level } = v;
            return {
              ...level,
              lessons: v.lessons.map((l: any) => {
                const { childcount: lc, ...lesson } = l;
                return lesson;
              }),
            };
          }),
        };
      }),
    };
  });

/** [name, childcount, enrolmentcount] down the tree, to read the counts without the rest. */
const countsOf = (nodes: any[]) =>
  nodes.map((c) => ({
    curriculum: c.curriculumname,
    childcount: c.childcount,
    enrolmentcount: c.enrolmentcount,
    grades: c.grades.map((g: any) => ({
      grade: g.gradename,
      childcount: g.childcount,
      levels: g.levels.map((v: any) => ({
        level: v.levelname,
        childcount: v.childcount,
        lessons: v.lessons.map((l: any) => ({ lesson: l.lessonname, childcount: l.childcount })),
      })),
    })),
  }));

describe("the curriculum tree", () => {
  it("is what it was beside the counts: the same rows, keys and order, nothing else added or changed", async () => {
    for (const org of [orgX, platform]) {
      const tree = await buildCurriculumTree(org);
      const previous = await previousTree(org);
      expect(withoutCounts(tree)).toEqual(previous);
      // byte for byte, key order included
      expect(JSON.stringify(withoutCounts(tree))).toBe(JSON.stringify(previous));
    }
  });

  it("is, for one curriculum, that curriculum's entry of the whole tree, and is what it was beside the counts", async () => {
    const whole = await buildCurriculumTree(orgX);
    const one = await buildCurriculumTree(orgX, C1);
    expect(one).toEqual(whole.filter((c) => c.curriculumid === C1));
    expect(JSON.stringify(withoutCounts(one))).toBe(JSON.stringify(await previousTree(orgX, C1)));
  });

  it("counts each node's direct children that are not deleted, and the lesson's learnings, practices and quizzes", async () => {
    expect(countsOf(await buildCurriculumTree(orgX))).toEqual([
      {
        curriculum: "Reading",
        childcount: 2,
        enrolmentcount: 2,
        grades: [
          {
            grade: "Grade one",
            childcount: 2,
            levels: [
              { level: "Level A", childcount: 0, lessons: [] },
              {
                level: "Level B",
                childcount: 2,
                lessons: [
                  { lesson: "Lesson 2", childcount: { learnings: 0, practices: 0, quizzes: 0 } },
                  { lesson: "Lesson 1", childcount: { learnings: 2, practices: 1, quizzes: 3 } },
                  // a deleted lesson is still listed, as it always was; it holds nothing
                  { lesson: "Lesson gone", childcount: { learnings: 0, practices: 0, quizzes: 0 } },
                ],
              },
              // the deleted level stays in the list, as it always did, and holds nothing
              { level: "Level gone", childcount: 0, lessons: [] },
            ],
          },
          { grade: "Grade two", childcount: 0, levels: [] },
          { grade: "Grade gone", childcount: 0, levels: [] },
        ],
      },
      { curriculum: "Maths", childcount: 0, enrolmentcount: 1, grades: [] },
    ]);
  });

  it("counts a learner once for the curriculum they are on, and only the caller's schools' learners", async () => {
    const asX = await buildCurriculumTree(orgX);
    const byName = (list: any[]) => list.map((c) => [c.curriculumname, c.enrolmentcount]).sort((a, b) => a[0].localeCompare(b[0]));
    expect(byName(asX)).toEqual([["Maths", 1], ["Reading", 2]]);
    // a platform user not acting sees every school's learners and Y's curriculum as well
    const all = await buildCurriculumTree(platform);
    expect(byName(all)).toEqual([["Maths", 1], ["Other", 0], ["Reading", 3]]);
    const theirs = all.find((c) => c.curriculumid === C3);
    expect(countsOf([theirs])[0].grades[0]).toEqual({
      grade: "Their grade",
      childcount: 1,
      levels: [{ level: "Their level", childcount: 1, lessons: [{ lesson: "Their lesson", childcount: { learnings: 1, practices: 1, quizzes: 1 } }] }],
    });
  });

  it("never lets another organisation's rows into a count", async () => {
    const asX = JSON.stringify(await buildCurriculumTree(orgX));
    for (const theirs of [C3, G9, V9, L9]) expect(asX).not.toContain(theirs);
  });

  it("counts in a fixed number of queries however many nodes there are", async () => {
    const calls = () => ({
      learnings: (lessonlearnings.count as unknown as jest.Mock).mock.calls.length,
      learners: (students.count as unknown as jest.Mock).mock.calls.length,
      grades: (grades.findAll as unknown as jest.Mock).mock.calls.length,
      levels: (levels.findAll as unknown as jest.Mock).mock.calls.length,
      lessons: (lessons.findAll as unknown as jest.Mock).mock.calls.length,
    });
    await buildCurriculumTree(orgX);
    const small = calls();
    // many more nodes of every tier
    for (let n = 0; n < 20; n += 1) {
      const c = id(1000 + n);
      db.add("curriculums", { curriculumid: c, curriculumname: `More ${n}`, organisationid: X, curriculumstatus: true });
      db.add("grades", { gradeid: id(2000 + n), curriculumid: c, gradename: `G ${n}`, gradeorder: 1, gradestatus: true });
      db.add("levels", { levelid: id(3000 + n), gradeid: id(2000 + n), levelname: `V ${n}`, levelorder: 1, levelstatus: true });
      db.add("lessons", { lessonid: id(4000 + n), levelid: id(3000 + n), lessonname: `L ${n}`, lessonorder: 1, lessonstatus: true });
    }
    jest.clearAllMocks();
    const tree = await buildCurriculumTree(orgX);
    expect(tree).toHaveLength(22);
    expect(calls()).toEqual(small);
    expect(calls().learnings).toBe(1);
    expect(calls().learners).toBe(1);
  });
});
