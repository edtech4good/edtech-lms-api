import { Model, ModelStatic, Sequelize } from "sequelize";
import { schoolusers } from "./schoolusers";
import { students } from "./students";

/**
 * `schoolid` is declared on both models (so writers can store it) but must not
 * appear in anything a read returns until the step that moves readers to it.
 * The real SQL Sequelize generates is captured here; no database is involved.
 */
describe("students.schoolid and schoolusers.schoolid (C4)", () => {
  const sequelize = new Sequelize({ dialect: "mysql" });
  students.initModel(sequelize);
  schoolusers.initModel(sequelize);

  const captured = (): jest.SpyInstance =>
    jest.spyOn(sequelize, "query").mockResolvedValue([] as never);

  const both = [students, schoolusers] as unknown as Array<ModelStatic<Model>>;

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await sequelize.close();
  });

  it("declares the column on both models: a nullable string, so the writers can set it", () => {
    for (const model of both) {
      const attr = model.getAttributes().schoolid;
      expect(attr).toBeDefined();
      expect(attr!.allowNull).toBe(true);
      expect(String(attr!.type)).toBe("VARCHAR(36)");
    }
  });

  it("keeps it out of every plain read, so no response changes shape", async () => {
    for (const model of both) {
      const q = captured();
      await model.findAll({ where: { schoolname: "Sample School" } });
      const sql = String(q.mock.calls[0][0]);
      expect(sql).toMatch(/schoolname/);
      expect(sql).not.toMatch(/schoolid/);
      q.mockRestore();
    }
  });

  it("keeps it out of a read that already excludes other columns", async () => {
    const q = captured();
    await schoolusers.findAll({ attributes: { exclude: ["schooluserpasswordhash", "schoolname"] } });
    const sql = String(q.mock.calls[0][0]);
    expect(sql).not.toMatch(/schoolid|schooluserpasswordhash|`schoolname`/);
    expect(sql).toMatch(/schooluserid/);
  });

  it("still writes it: an insert and an update carry the column", async () => {
    const q = captured();
    await students.update({ schoolid: "id-1" }, { where: { studentid: "s1" } });
    expect(JSON.stringify(q.mock.calls[0][0])).toMatch(/UPDATE `students` SET `schoolid`/);
    q.mockClear();
    await schoolusers.update({ schoolid: "id-1", schoolname: "Sample School" }, { where: { schooluserid: "u1" } });
    expect(JSON.stringify(q.mock.calls[0][0])).toMatch(/UPDATE `schoolusers` SET .*`schoolid`/);
  });
});
