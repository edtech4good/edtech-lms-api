/**
 * Central got `studentprogress.verified` for future reporting (workspace#79),
 * but the offline CSV/XLSX downloads built here must stay byte-for-byte the
 * same: they're generated straight from these formatters' output keys, an
 * earlier draft of this change appended a `verified` column (always false,
 * since central forces imports false and the online formatters read the
 * student API before it added the column either) to every download. These
 * lock each formatter family's output keys so a `verified` field creeping
 * back in - to the interface or to any one formatter - fails loudly.
 */
import { ReportDownload } from "./report.download";

const reportDownload = new ReportDownload();

const QUIZ_SCORE_KEYS = [
  "curriculum",
  "school",
  "userid",
  "class",
  "course",
  "level",
  "lesson",
  "marks",
  "totalquestions",
  "percentage",
  "quizscore",
  "result",
];

const LEVEL_QUIZ_SCORE_KEYS = [
  "curriculum",
  "school",
  "userid",
  "class",
  "course",
  "level",
  "marks",
  "totalquestions",
  "percentage",
  "quizscore",
  "result",
];

const CURRENT_LEVEL_KEYS = [
  "curriculum",
  "country",
  "school",
  "userid",
  "class",
  "course",
  "level",
  "lesson",
  "score",
  "result",
];

const fakeProgress = () => ({
  marks: 4,
  resultpercentage: 80,
  scores: 4,
  getDataValue: (key: string) => (key === "totalquestions" ? 5 : undefined),
});

describe("ReportDownload formatters keep their exact download columns (no `verified`)", () => {
  it("formatQuizzes", () => {
    const fakeLesson = {
      level: { grade: { curriculum: { curriculumname: "C" }, gradename: "G" }, levelname: "L" },
      lessonname: "Lesson 1",
      get: () => ({
        student: {
          schoolname: "School",
          schooluser: { schoolusername: "u1" },
          class: { standardname: "Class A" },
        },
        laststudentprogress: fakeProgress(),
      }),
    };

    const [row] = reportDownload.formatQuizzes([fakeLesson as any]);

    expect(Object.keys(row).sort()).toEqual([...QUIZ_SCORE_KEYS].sort());
    expect(row).not.toHaveProperty("verified");
  });

  it("formatLevelQuizzes", () => {
    const fakeLevel = {
      grade: { curriculum: { curriculumname: "C" }, gradename: "G" },
      levelname: "L",
      get: () => ({
        student: {
          schoolname: "School",
          schooluser: { schoolusername: "u1" },
          class: { standardname: "Class A" },
        },
        laststudentprogress: fakeProgress(),
      }),
    };

    const [row] = reportDownload.formatLevelQuizzes([fakeLevel as any]);

    expect(Object.keys(row).sort()).toEqual([...LEVEL_QUIZ_SCORE_KEYS].sort());
    expect(row).not.toHaveProperty("verified");
  });

  it("formatCurrentLevel", () => {
    const fakeStudent = {
      get: () => ({
        curriculum: { curriculumname: "C" },
        school: { countries: { countryname: "Country" }, schoolname: "School" },
        schooluser: { schoolusername: "u1" },
        class: { standardname: "Class A" },
        laststudentprogress: {
          ...fakeProgress(),
          lessonquiz: { lesson: { lessonname: "Lesson 1", level: { levelname: "L", grade: { gradename: "G" } } } },
        },
      }),
    };

    const [row] = reportDownload.formatCurrentLevel([fakeStudent as any]);

    expect(Object.keys(row).sort()).toEqual([...CURRENT_LEVEL_KEYS].sort());
    expect(row).not.toHaveProperty("verified");
  });
});
