import { Sequelize } from "sequelize";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { schoolusers } from "src/models/data-models/schoolusers";
import { students } from "src/models/data-models/students";

/**
 * The rosters pushed to the student API (cloud push of learners and teachers,
 * the content export, `sync/report-data`) are built from three getters on
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
    // ...and neither side selects the new column
    expect(sql).not.toMatch(/schoolid/);
  };

  it("getschooluserbyschoolname (cloud push of a school's learners, sync/cloud/:schoolname/students)", async () => {
    guards(await capture((b) => b.getschooluserbyschoolname("Sample School")));
  });

  it("getschooluserbyid (cloud push of learners just created)", async () => {
    guards(await capture((b) => b.getschooluserbyid(["u1"])));
  });

  it("getschoolusers (content export and sync/report-data)", async () => {
    guards(await capture((b) => b.getschoolusers()));
  });

  it("getschoolteachersbyid (cloud push of teachers just created)", async () => {
    const sql = await capture((b) => b.getschoolteachersbyid(["t1"]));
    expect(sql).toMatch(/`schoolname`/);
    expect(sql).not.toMatch(/schoolid/);
  });
});
