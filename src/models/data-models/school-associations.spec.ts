import { Sequelize } from "sequelize";
import { initModels, schools, schoolusers, students } from "./init-models";

/**
 * A learner and a school login belong to their school by ID. The associations
 * (which every `include: [{ model: schools }]` joins through) must key on
 * `schoolid`: a join on the name would tie a learner to every school of the
 * same name. The real SQL Sequelize generates is captured; no database is used.
 */
describe("learners and school logins join schools on schoolid", () => {
  const sequelize = new Sequelize({ dialect: "mysql" });
  initModels(sequelize);

  afterAll(async () => {
    await sequelize.close();
  });

  const join = async (model: typeof students | typeof schoolusers) => {
    const q = jest.spyOn(sequelize, "query").mockResolvedValue([] as never);
    await (model as typeof students).findAll({ include: [{ model: schools, required: true }] });
    const sql = String(q.mock.calls[0][0]);
    q.mockRestore();
    return sql;
  };

  it("students belong to a school through schoolid (association keys)", () => {
    const toSchool = students.associations.school as unknown as { foreignKey: string; targetKey: string };
    expect(toSchool.foreignKey).toBe("schoolid");
    expect(toSchool.targetKey).toBe("schoolid");
    const fromSchool = schools.associations.students as unknown as { foreignKey: string };
    expect(fromSchool.foreignKey).toBe("schoolid");
  });

  it("school logins belong to a school through schoolid (association keys)", () => {
    const toSchool = schoolusers.associations.school as unknown as { foreignKey: string; targetKey: string };
    expect(toSchool.foreignKey).toBe("schoolid");
    expect(toSchool.targetKey).toBe("schoolid");
    const fromSchool = schools.associations.schoolusers as unknown as { foreignKey: string };
    expect(fromSchool.foreignKey).toBe("schoolid");
  });

  it("the JOIN a learner include generates compares ids, never names", async () => {
    const sql = await join(students);
    expect(sql).toMatch(/ON `students`\.`schoolid` = `school`\.`schoolid`/);
    expect(sql).not.toMatch(/ON `students`\.`schoolname`/);
  });

  it("the JOIN a school login include generates compares ids, never names", async () => {
    const sql = await join(schoolusers);
    expect(sql).toMatch(/ON `schoolusers`\.`schoolid` = `school`\.`schoolid`/);
    expect(sql).not.toMatch(/ON `schoolusers`\.`schoolname`/);
  });

  it("nothing hides the id any more: both models have no default scope", () => {
    expect(students.options.defaultScope).toEqual({});
    expect(schoolusers.options.defaultScope).toEqual({});
  });
});
