import { Sequelize } from "sequelize";
import { CurriculumBusiness } from "src/business/curriculum.business";
import { GradeBusiness } from "src/business/grade.business";
import { DocumentBusiness } from "src/business/document.business";
import { QuestionBusiness } from "src/business/question.business";
import { SubjectBusiness } from "src/business/subject.business";
import { SyncBusiness } from "src/business/sync.business";
import { buildOrganisationContent } from "src/business/organisation-content-export";
import { initModels } from "src/models/data-models/init-models";

/**
 * The content sync (`sync`, `sync/content`, `sync/cloud`) and the report data
 * (`sync/report-data`) are payloads for the student API, which has no
 * `organisationid` on the content tables (C7). Each of them is built by a
 * getter on a business class; the real SQL Sequelize generates is captured here
 * (no database) and the SELECT list of every statement against the four content
 * tables the sync reads is checked, so a getter that starts selecting the column
 * again fails here before it reaches a Pi. A select list must name the table's own
 * key (so `SELECT *` fails), and no statement a getter sends, other than a read of the
 * schools, may mention the column anywhere (so a JOIN that pulls it in fails).
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
  const KEY = { curriculums: "curriculumid", questions: "questionid", documents: "documentid", subjects: "subjectid" } as const;
  /** A school legitimately carries its organisation; nothing else the getters read does. */
  const outsideSchools = (sqls: string[]) => sqls.filter((s) => !/FROM `schools`/.test(s));
  const namesNoOrganisation = (sqls: string[]) => {
    expect(sqls.length).toBeGreaterThan(0);
    for (const sql of outsideSchools(sqls)) expect(sql).not.toMatch(/organisationid/);
  };

  describe.each([
    ["getquestions", "questions", "questionid", () => new QuestionBusiness().getquestions()],
    ["getdocuments", "documents", "documentid", () => new DocumentBusiness().getdocuments()],
    ["getSubjects", "subjects", "subjectid", () => new SubjectBusiness().getSubjects()],
    ["getCurriculumsForStudentApi", "curriculums", "curriculumid", () => new CurriculumBusiness().getCurriculumsForStudentApi()],
  ] as const)("%s", (_name, table, key, run) => {
    it(`selects the table's columns, but not organisationid`, async () => {
      const all = await capture(run);
      const sqls = reading(all, table);
      expect(sqls).toHaveLength(1);
      expect(selectList(sqls[0])).toMatch(new RegExp(`\`${key}\``));
      expect(selectList(sqls[0])).not.toMatch(/organisationid/);
      namesNoOrganisation(all);
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
    it.each(CONTENT.filter((t) => t !== "subjects"))("reads %s by named columns, without organisationid", async (table) => {
      const sqls = reading(await capture(run), table);
      expect(sqls.length).toBeGreaterThan(0);
      for (const sql of sqls) {
        expect(selectList(sql)).toMatch(new RegExp(`\`${KEY[table]}\``));
        expect(selectList(sql)).not.toMatch(/organisationid/);
      }
    });

    it("sends no statement that names organisationid, other than a read of the schools", async () => {
      namesNoOrganisation(await capture(run));
    });
  });

  it("syncontentVersion2 reads the subjects without organisationid; the old payload has no subjects", async () => {
    for (const run of [() => new SyncBusiness().syncontentVersion2()]) {
      const sqls = reading(await capture(run), "subjects");
      expect(sqls.length).toBeGreaterThan(0);
      for (const sql of sqls) {
        expect(selectList(sql)).toMatch(new RegExp(`\`${KEY.subjects}\``));
        expect(selectList(sql)).not.toMatch(/organisationid/);
      }
    }
    expect(reading(await capture(() => new SyncBusiness().synconline()), "subjects")).toEqual([]);
  });

  /**
   * The readers the admin routes use are the ones the payloads use, and content is limited to the caller's
   * organisation by building the business class with the caller's context (content-scope.ts). A class built without
   * one is what it was: every reader the payloads call sends the one statement it always did, with no limit on the
   * rows (no `IN (...)` list of the caller's ids, no read of the ids first). With a context the same reader adds the
   * limit, so the difference is the context and nothing else.
   */
  describe("the payloads' readers are not limited to an organisation", () => {
    const CONTENT_TABLES = [
      "curriculums", "grades", "levels", "lessons", "lessonlearnings", "lessonpractices", "lessonpracticequestions",
      "lessonquizzes", "lessonquizquestions", "levelquizquestions", "lessonplans", "baselinequestion", "questions",
      "documents", "subjects", "feedbacks",
    ];
    const contentReads = (sqls: string[]) => sqls.filter((s) => CONTENT_TABLES.some((t) => new RegExp(`FROM \`${t}\``).test(s)));

    it.each([
      ["syncontentVersion2 (sync/content, sync/cloud)", () => new SyncBusiness().syncontentVersion2()],
      ["synconline (sync, old apk)", () => new SyncBusiness().synconline()],
      ["getreportdata (sync/report-data)", () => new SyncBusiness().getreportdata()],
    ] as const)("%s reads every content table once, with no limit on the rows", async (_name, run) => {
      const reads = contentReads(await capture(run));
      expect(reads.length).toBeGreaterThan(0);
      for (const table of new Set(reads.map((s) => CONTENT_TABLES.find((t) => new RegExp(`FROM \`${t}\``).test(s))))) {
        expect(reads.filter((s) => new RegExp(`FROM \`${table}\``).test(s))).toHaveLength(1);
      }
      for (const sql of reads) expect(sql).not.toMatch(/ IN \(/);
    });

    it("the same reader built with a caller's context does add the limit (so the check above can fail)", async () => {
      const org = { organisationid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", isplatform: false };
      const unscoped = reading(await capture(() => new GradeBusiness().getGrades()), "grades");
      expect(unscoped).toHaveLength(1);
      expect(unscoped[0]).not.toMatch(/ IN \(/);
      const all = await capture(() => new GradeBusiness(org).getGrades());
      expect(reading(all, "curriculums").length).toBeGreaterThan(0); // the curriculums the organisation owns, read first
      expect(reading(all, "grades").some((s) => / IN \(/.test(s))).toBe(true);
    });
  });
  /**
   * One organisation's payload (format 3) is read through business classes built with the organisation's context, so every
   * statement against a content table carries the limit: the owner for the tables that have one, the ids of the parents in
   * scope for the rest. Pinned on the SQL, so a reader that loses its limit fails here (the HTTP spec, sync-scope.leak.spec.ts,
   * shows the rows).
   */
  describe("the organisation payload (format 3) reads every table with the organisation's limit", () => {
    const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const organisation = { organisationid: X, organisationname: "X", organisationcode: "xorg", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, isdeleted: false };
    const OWNED = ["schools", "curriculums", "questions", "documents", "subjects"];
    const INHERITED = [
      "standards", "curriculumbaseline", "baselinequestion", "grades", "levels", "lessons", "lessonlearnings", "lessonplans",
      "lessonpractices", "lessonquizzes", "lessonpracticequestions", "lessonquizquestions", "levelquizquestions",
    ];

    it.each(OWNED)("%s is read by `organisationid`, and the rows come out with it", async (table) => {
      const sqls = reading(await capture(() => buildOrganisationContent(organisation as never)), table);
      expect(sqls.length).toBeGreaterThan(0);
      // every statement is limited to the organisation (the one that reads the ids of the owned rows as well as the one that reads the rows)
      for (const sql of sqls) expect(sql.split(" FROM ")[1]).toMatch(new RegExp(`WHERE.*\`organisationid\` = '${X}'`));
      // and the rows are read whole, the owner included
      expect(sqls.some((sql) => /organisationid/.test(selectList(sql)))).toBe(true);
    });

    it.each(INHERITED)("%s is read only among the rows under the parents in scope", async (table) => {
      const sqls = reading(await capture(() => buildOrganisationContent(organisation as never)), table);
      expect(sqls.length).toBeGreaterThan(0);
      for (const sql of sqls) expect(sql.split(" FROM ")[1]).toMatch(/WHERE.* IN \(/);
    });

    it("the organisation's country links are read by organisationid", async () => {
      const sqls = reading(await capture(() => buildOrganisationContent(organisation as never)), "organisationcountry");
      expect(sqls).toHaveLength(1);
      expect(sqls[0]).toMatch(new RegExp(`WHERE.*\`organisationid\` = '${X}'`));
    });
  });
});
