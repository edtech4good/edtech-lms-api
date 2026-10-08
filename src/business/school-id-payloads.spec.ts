import { Sequelize } from "sequelize";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { TeacherBusiness } from "src/business/teacher.business";
import { schoolusers } from "src/models/data-models/schoolusers";
import { students } from "src/models/data-models/students";

/**
 * The rosters pushed to the student API (cloud push of learners and teachers,
 * the exports a classroom Pi imports) are built from getters on
 * `SchoolUserBusiness`, each a `schoolusers` query that INCLUDES `students`
 * with no attribute list of its own. They depend on the models' default scope
 * to keep the C4 `schoolid` out of the included learner and the login. If a
 * scope were emptied, `student.schoolid` would reach the student API and every
 * export. The real SQL Sequelize generates is captured here (no database).
 */
describe("roster payload getters keep schoolid out of the login and the included learner", () => {
  const sequelize = new Sequelize({ dialect: "mysql" });
  students.initModel(sequelize);
  schoolusers.initModel(sequelize);

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await sequelize.close();
  });

  const capture = async (run: (b: SchoolUserBusiness) => Promise<unknown>) => {
    const q = jest.spyOn(sequelize, "query").mockResolvedValue([] as never);
    await run(new SchoolUserBusiness());
    return String(q.mock.calls[0][0]);
  };

  const guards = (sql: string) => {
    // the query really does join the learner and select its columns...
    expect(sql).toMatch(/`student`\.`studentid`/);
    expect(sql).toMatch(/`student`\.`schoolname`/);
    expect(sql).toMatch(/`schoolusers`\.`schoolname`/);
    // ...and neither side SELECTS the new column. (The school filter of a query may
    // legitimately name it in its JOIN condition; only what is selected is the payload.)
    const selected = sql.split(" FROM ")[0];
    expect(selected).not.toMatch(/schoolid/);
  };

  it("getschooluserbyschoolid (export of a school's learners; cloud sync, sync/cloud/:schoolname/students)", async () => {
    const sql = await capture((b) => b.getschooluserbyschoolid("school-1"));
    guards(sql);
    // the order the export always had (by learner id), now pinned rather than left to the query plan
    expect(sql).toMatch(/ORDER BY `student`\.`studentid` ASC/);
  });

  it("getschooluserbyid (cloud push of learners just created)", async () => {
    guards(await capture((b) => b.getschooluserbyid(["u1"])));
  });

  // The join type decides WHICH logins reach the payload: an inner join silently drops
  // a login that has no learner row. Pinned for every getter that includes the learner.
  describe("the learner join keeps (or drops) logins exactly as the payload always has", () => {
    it("getschooluserbyid: LEFT OUTER JOIN, so a login with no learner row is still pushed", async () => {
      const sql = await capture((b) => b.getschooluserbyid(["u1"]));
      expect(sql).toMatch(/LEFT OUTER JOIN `students` AS `student`/);
      expect(sql).not.toMatch(/INNER JOIN/);
    });

    it("getschooluserbyschoolid: INNER JOIN, because the export is the school's learners (the school filter is on the learner)", async () => {
      const sql = await capture((b) => b.getschooluserbyschoolid("school-1"));
      expect(sql).toMatch(/INNER JOIN `students` AS `student`/);
      expect(sql).not.toMatch(/LEFT OUTER JOIN/);
    });

    it("getschoolteachersbyid and the teacher export have no join at all", async () => {
      for (const sql of [
        await capture((b) => b.getschoolteachersbyid(["t1"])),
        await capture(async () => new TeacherBusiness().getteacheruserbyschoolid("school-1")),
      ]) {
        expect(sql).not.toMatch(/JOIN/);
      }
    });
  });

  it("getschoolteachersbyid (cloud push of teachers just created)", async () => {
    const sql = await capture((b) => b.getschoolteachersbyid(["t1"]));
    expect(sql).toMatch(/`schoolname`/);
    expect(sql.split(" FROM ")[0]).not.toMatch(/schoolid/);
  });

  it("getteacheruserbyschoolid (export of a school's teachers) selects the login's columns without schoolid, though it filters on it", async () => {
    const sql = await capture(async () => new TeacherBusiness().getteacheruserbyschoolid("school-1"));
    expect(sql).toMatch(/`schoolname`/);
    expect(sql.split(" FROM ")[0]).not.toMatch(/schoolid/);
    expect(sql).toMatch(/`schoolid` = 'school-1'/);
  });

  /**
   * The one place a roster row carries its school: a push that names the school it is for (`{ schoolid, studentusers }`,
   * `{ schoolid, teachers }`), which the student API checks row by row. The getters take `{ withSchoolId: true }` for it
   * (and only then); every other payload above keeps the column out. What is selected must hold `schoolid` on the login and,
   * where the learner is included, on the learner too, and still no `organisationid`.
   */
  describe("a push that names its school keeps schoolid on every row it sends", () => {
    const selectedOf = (sql: string) => sql.split(" FROM ")[0];

    it("getschooluserbyschoolid (sync/cloud/:schoolname/students) selects schoolid on the login and on the learner", async () => {
      const selected = selectedOf(await capture((b) => b.getschooluserbyschoolid("school-1", true, { withSchoolId: true })));
      expect(selected).toMatch(/`schoolusers`\.`schoolid`/);
      expect(selected).toMatch(/`student`\.`schoolid`/);
      expect(selected).not.toMatch(/organisationid/);
      // and the rest of the row is what it was
      expect(selected).toMatch(/`student`\.`studentid`/);
      expect(selected).toMatch(/`schoolusers`\.`schoolname`/);
    });

    it("getschooluserbyid (the learners just created) selects schoolid on the login and on the learner", async () => {
      const selected = selectedOf(await capture((b) => b.getschooluserbyid(["u1"], { withSchoolId: true })));
      expect(selected).toMatch(/`schoolusers`\.`schoolid`/);
      expect(selected).toMatch(/`student`\.`schoolid`/);
      expect(selected).not.toMatch(/organisationid/);
    });

    it("getschoolteachersbyid (the teachers just created) selects schoolid", async () => {
      const selected = selectedOf(await capture((b) => b.getschoolteachersbyid(["t1"], { withSchoolId: true })));
      expect(selected).toMatch(/`schoolid`/);
      expect(selected).toMatch(/`schoolname`/);
      expect(selected).not.toMatch(/organisationid/);
    });

    it("without it the same getters still keep schoolid out (so the checks above can fail)", async () => {
      for (const sql of [
        await capture((b) => b.getschooluserbyschoolid("school-1", true, {})),
        await capture((b) => b.getschooluserbyid(["u1"], {})),
        await capture((b) => b.getschoolteachersbyid(["t1"], {})),
        await capture((b) => b.getschooluserbyschoolid("school-1", true, { withSchoolId: false })),
      ]) {
        expect(selectedOf(sql)).not.toMatch(/schoolid/);
      }
    });
  });

  it("the admin API's own reads DO carry schoolid (only the student-API payloads hide it)", async () => {
    const sql = await capture(async () => schoolusers.findAll({ where: { schoolname: "x" } }));
    expect(sql.split(" FROM ")[0]).toMatch(/`schoolid`/);
  });
});
