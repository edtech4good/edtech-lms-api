import { orderBy } from "lodash";
import { Op } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { lessonlearnings } from "src/models/data-models/lessonlearnings";
import { students } from "src/models/data-models/students";
import { CurriculumBusiness } from "./curriculum.business";
import { andScope } from "./content-scope";
import { GradeBusiness } from "./grade.business";
import { LessonBusiness } from "./lesson.business";
import { LessonPracticeBusiness } from "./lessonpractice.business";
import { LessonQuizBusiness } from "./lessonquiz.business";
import { LevelBusiness } from "./level.business";
import { andInOwnedSchools } from "./school-scope";

/** What a lesson holds directly, by kind. */
export interface LessonChildCount {
  learnings: number;
  practices: number;
  quizzes: number;
}

type GroupedCount = Array<Record<string, unknown> & { count: number }>;

/** `rows` that are not deleted, counted by the value of `key` (a row of a table with no `isdeleted` is always live). */
const liveCountsBy = <T extends { isdeleted?: boolean }>(rows: T[], key: keyof T): Map<unknown, number> => {
  const counts = new Map<unknown, number>();
  for (const row of rows) {
    if (row.isdeleted === true) continue;
    counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  }
  return counts;
};

/** A grouped `count()` as a map from the grouped value to its count. */
const toMap = (grouped: unknown, key: string): Map<unknown, number> =>
  new Map((grouped as GroupedCount).map((g) => [g[key], Number(g.count)]));

/**
 * The curriculum tree the admin reads (`GET /curriculum/tree` and `GET /curriculum/tree/:curriculumid`): the caller's
 * curriculums, each with its grades, their levels, their lessons, and a lesson's quizzes and practices, every tier
 * in the order it has always had.
 *
 * Every node also carries counts, so a client can show them without reading the children:
 *  - `childcount` on a curriculum, a grade and a level: the number of its direct children that are not deleted
 *    (grades, levels, lessons); on a lesson, `{ learnings, practices, quizzes }`.
 *  - `enrolmentcount` on a curriculum: the number of non-deleted students of the caller's schools whose
 *    `curriculumid` is it.
 * The counts come from the lists already read, plus one grouped count for learning items (the tree does not list them)
 * and one for students: no query per node. The fields that were here before are unchanged; the counts are added after them.
 *
 * `only` limits the tree to one curriculum (the caller has already checked that it is in scope).
 */
export const buildCurriculumTree = async (org: OrgContext, only?: string) => {
  const curriculums = await new CurriculumBusiness(org).getCurriculums();
  const grades = await new GradeBusiness(org).getGrades();
  const levels = await new LevelBusiness(org).getLevels();
  const lessons = await new LessonBusiness(org).getLessons();
  const lessonquizzes = await new LessonQuizBusiness(org).getLessonQuizzes();
  const lessonpractices = await new LessonPracticeBusiness(org).getLessonPractices();

  const shown = only === undefined ? curriculums : curriculums.filter((x) => x.curriculumid === only);

  const gradesIn = liveCountsBy(grades, "curriculumid");
  const levelsIn = liveCountsBy(levels, "gradeid");
  const lessonsIn = liveCountsBy(lessons, "levelid");
  const quizzesIn = liveCountsBy(lessonquizzes as Array<{ lessonid: string; isdeleted?: boolean }>, "lessonid");
  const practicesIn = liveCountsBy(lessonpractices as Array<{ lessonid: string; isdeleted?: boolean }>, "lessonid");

  // The lessons under the curriculum asked for (all of them for the whole tree), so the learning count reads no more than it needs.
  const gradeIds = new Set(grades.filter((g) => only === undefined || g.curriculumid === only).map((g) => g.gradeid));
  const levelIds = new Set(levels.filter((l) => gradeIds.has(l.gradeid)).map((l) => l.levelid));
  const lessonIds = lessons.filter((l) => levelIds.has(l.levelid)).map((l) => l.lessonid);

  // Learning items and learners are not part of the tree, so each is counted once for the whole tree, grouped.
  const learningsIn =
    lessonIds.length === 0
      ? new Map<unknown, number>()
      : toMap(
          await lessonlearnings.count({
            where: await andScope(org, "learning", only === undefined ? {} : { lessonid: { [Op.in]: lessonIds } }),
            group: ["lessonid"],
          }),
          "lessonid",
        );
  const enrolledIn =
    shown.length === 0
      ? new Map<unknown, number>()
      : toMap(
          await students.count({
            where: await andInOwnedSchools(
              only === undefined ? { isdeleted: false } : { isdeleted: false, curriculumid: only },
              org,
            ),
            group: ["curriculumid"],
          }),
          "curriculumid",
        );

  return shown.map((curriculum) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tempc: any = { ...curriculum.toJSON() };
    tempc.grades = grades
      .filter((x) => x.curriculumid === curriculum.curriculumid)
      .map((grade) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tempg: any = { ...grade.toJSON() };
        tempg.levels = orderBy(
          levels
            .filter((x) => x.gradeid === grade.gradeid)
            .map((level) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const templev: any = { ...level.toJSON() };
              templev.lessons = orderBy(
                lessons
                  .filter((x) => x.levelid === level.levelid)
                  .map((lesson) => ({
                    ...lesson.toJSON(),
                    quizzes: orderBy(
                      lessonquizzes.filter((x) => x.lessonid === lesson.lessonid).map((x) => x.toJSON()),
                      "lessonquizorder",
                    ),
                    practices: orderBy(
                      lessonpractices.filter((x) => x.lessonid === lesson.lessonid).map((x) => x.toJSON()),
                      "lessonpracticeorder",
                    ),
                    childcount: {
                      learnings: learningsIn.get(lesson.lessonid) ?? 0,
                      practices: practicesIn.get(lesson.lessonid) ?? 0,
                      quizzes: quizzesIn.get(lesson.lessonid) ?? 0,
                    } as LessonChildCount,
                  })),
                "lessonorder",
              );
              templev.childcount = lessonsIn.get(level.levelid) ?? 0;
              return templev;
            }),
          "levelorder",
        );
        tempg.childcount = levelsIn.get(grade.gradeid) ?? 0;
        return tempg;
      });
    tempc.childcount = gradesIn.get(curriculum.curriculumid) ?? 0;
    tempc.enrolmentcount = enrolledIn.get(curriculum.curriculumid) ?? 0;
    return tempc;
  });
};
