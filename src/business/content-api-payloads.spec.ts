import { Sequelize } from "sequelize";
import { CurriculumBusiness } from "src/business/curriculum.business";
import { DocumentBusiness } from "src/business/document.business";
import { QuestionBusiness } from "src/business/question.business";
import { SubjectBusiness } from "src/business/subject.business";
import { SyncBusiness } from "src/business/sync.business";
import { initModels } from "src/models/data-models/init-models";

/**
 * The content sync (`sync`, `sync/content`, `sync/cloud`) and the report data
 * (`sync/report-data`) are payloads for the student API, which has no
 * `organisationid` on the content tables (C7). Each of them is built by a
 * getter on a business class; the real SQL Sequelize generates is captured here
 * (no database) and the SELECT list of every statement against the four content
 * tables the sync reads is checked, so a getter that starts selecting the column
 * again fails here before it reaches a Pi.
 */
describe("content payloads for the student API do not select organisationid", () => {
  const sequelize = new Sequelize({ dialect: "mysql" });
  initModels(sequelize);

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await sequelize.close();
  });

  /** Every SQL statement a run sends, with the table it reads. */
  const capture = async (run: () => Promise<unknown>) => {
    jest.restoreAllMocks(); // a fresh record for each run (a second spy would add to the first one's calls)
    const q = jest.spyOn(sequelize, "query").mockResolvedValue([] as never);
    await run();
    return q.mock.calls.map((c) => String(c[0]));
  };
  const selectList = (sql: string) => sql.split(" FROM ")[0];
  const reading = (sqls: string[], table: string) => sqls.filter((s) => new RegExp(`FROM \`${table}\``).test(s));

  const CONTENT = ["curriculums", "questions", "documents", "subjects"] as const;

  describe.each([
    ["getquestions", "questions", "questionid", () => new QuestionBusiness().getquestions()],
    ["getdocuments", "documents", "documentid", () => new DocumentBusiness().getdocuments()],
    ["getSubjects", "subjects", "subjectid", () => new SubjectBusiness().getSubjects()],
    ["getCurriculumsForStudentApi", "curriculums", "curriculumid", () => new CurriculumBusiness().getCurriculumsForStudentApi()],
  ] as const)("%s", (_name, table, key, run) => {
    it(`selects the table's columns, but not organisationid`, async () => {
      const sqls = reading(await capture(run), table);
      expect(sqls).toHaveLength(1);
      expect(selectList(sqls[0])).toMatch(new RegExp(`\`${key}\``));
      expect(selectList(sqls[0])).not.toMatch(/organisationid/);
    });
  });

  it("the admin API's own read of the curriculums DOES carry organisationid (only the payload hides it)", async () => {
    const sqls = reading(await capture(() => new CurriculumBusiness().getCurriculums()), "curriculums");
    expect(sqls).toHaveLength(1);
    expect(selectList(sqls[0])).toMatch(/organisationid/);
  });

  describe.each([
    ["syncontentVersion2 (sync/content, sync/cloud)", () => new SyncBusiness().syncontentVersion2()],
    ["synconline (sync, old apk)", () => new SyncBusiness().synconline()],
    ["getreportdata (sync/report-data)", () => new SyncBusiness().getreportdata()],
  ] as const)("%s", (_name, run) => {
    it.each(CONTENT.filter((t) => t !== "subjects"))("reads %s without organisationid", async (table) => {
      const sqls = reading(await capture(run), table);
      expect(sqls.length).toBeGreaterThan(0);
      for (const sql of sqls) expect(selectList(sql)).not.toMatch(/organisationid/);
    });
  });

  it("syncontentVersion2 reads the subjects without organisationid; the old payload has no subjects", async () => {
    for (const run of [() => new SyncBusiness().syncontentVersion2()]) {
      const sqls = reading(await capture(run), "subjects");
      expect(sqls.length).toBeGreaterThan(0);
      for (const sql of sqls) expect(selectList(sql)).not.toMatch(/organisationid/);
    }
    expect(reading(await capture(() => new SyncBusiness().synconline()), "subjects")).toEqual([]);
  });
});
