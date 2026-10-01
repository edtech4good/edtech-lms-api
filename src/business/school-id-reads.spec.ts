import { curriculums } from "src/models/data-models/curriculums";
import { schoolusers } from "src/models/data-models/schoolusers";
import { students } from "src/models/data-models/students";
import { StudentBusiness } from "src/business/student.business";
import { dbinstance } from "src/services/dbservice";

/**
 * C4 adds `schoolid` to `students` and `schoolusers` but changes no response.
 * The models' default scope keeps the column out of plain reads; these are the
 * three places that bypass it and so keep it out by hand:
 *
 * - the learner list and the learner detail each INCLUDE `schoolusers` with its
 *   own `attributes`, which replaces the model's default scope;
 * - the learner stats query is raw SQL (`ss.*`), so every column of `students`
 *   comes back.
 *
 * Models and the database are replaced; what is asserted is what is asked for
 * and what is handed back. A live comparison of the same routes before and
 * after is in the PR description.
 */
beforeEach(() => {
  // The models are not initialised under jest; the reads declare their associations on the fly.
  jest.spyOn(curriculums, "hasOne").mockReturnValue(undefined as never);
  jest.spyOn(schoolusers, "hasOne").mockReturnValue(undefined as never);
  jest.spyOn(students, "belongsTo").mockReturnValue(undefined as never);
});

afterEach(() => jest.restoreAllMocks());

const business = () => {
  const b = new StudentBusiness();
  b.getstudentaccess = jest.fn().mockResolvedValue([]);
  return b;
};

describe("learner reads keep schoolid out of the included school login", () => {
  it("the learner detail excludes it from the included schooluser", async () => {
    const findOne = jest.spyOn(students, "findOne").mockResolvedValue(null as never);
    await business().getStudent("student-1");

    const schooluser = (findOne.mock.calls[0][0] as { include: Array<{ attributes: { exclude: string[] } }> }).include[0];
    expect(schooluser.attributes.exclude).toEqual(
      expect.arrayContaining(["schooluserpasswordhash", "schoolname", "schooluserid", "schoolid"]),
    );
  });

  it("the learner list excludes it from the included schooluser", async () => {
    const find = jest.spyOn(students, "findAndCountAll").mockResolvedValue({ count: 0, rows: [] } as never);
    await business().getAllStudents({ pageindex: 1, pagesize: 20, filter: [] } as never);

    const schooluser = (find.mock.calls[0][0] as { include: Array<{ attributes: { exclude: string[] } }> }).include[0];
    expect(schooluser.attributes.exclude).toEqual(
      expect.arrayContaining(["schooluserpasswordhash", "schoolname", "schooluserid", "schoolid"]),
    );
  });
});

describe("getstudentstats", () => {
  it("returns the raw row without schoolid, and keeps every other column", async () => {
    jest
      .spyOn(dbinstance.getdbinstance(), "query")
      .mockResolvedValue([{ studentid: "s1", schoolname: "Sample School", schoolid: "school-1", currentlevelname: "L1" }] as never);

    const rows = await new StudentBusiness().getstudentstats("s1");

    expect(rows).toEqual([{ studentid: "s1", schoolname: "Sample School", currentlevelname: "L1" }]);
    expect(rows[0]).not.toHaveProperty("schoolid");
  });

  it("returns an empty list for a learner with no progress row", async () => {
    jest.spyOn(dbinstance.getdbinstance(), "query").mockResolvedValue([] as never);
    await expect(new StudentBusiness().getstudentstats("s1")).resolves.toEqual([]);
  });
});
