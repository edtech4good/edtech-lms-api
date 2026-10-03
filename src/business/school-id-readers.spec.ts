import { inspect } from "util";
import { Op } from "sequelize";
import { countries } from "src/models/data-models/countries";
import { curriculums } from "src/models/data-models/curriculums";
import { feedbacks } from "src/models/data-models/feedback";
import { grades } from "src/models/data-models/grades";
import { schools } from "src/models/data-models/school";
import { schoolusers } from "src/models/data-models/schoolusers";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { CurriculumBusiness } from "src/business/curriculum.business";
import { FeedbackBusiness } from "src/business/feedback.business";
import { GradeBusiness } from "src/business/grade.business";
import { ReportBusiness } from "src/business/report.business";
import { SchoolBusiness } from "src/business/school.business";
import { SchoolcontributeBusiness } from "src/business/schoolcontribute.business";
import { StandardBusiness } from "src/business/standard.business";
import { StudentBusiness } from "src/business/student.business";
import { TeacherBusiness } from "src/business/teacher.business";
import { StudentController } from "src/modules/students/student.controller";
import { CurriculumController } from "src/modules/curriculum/curriculum.controller";
import { GradeController } from "src/modules/grade/grade.controller";
import { StandardController } from "src/modules/standard/standard.controller";
import { ReportController } from "src/modules/report/report.controller";

/**
 * Learners and school logins belong to their school by ID. Each reader below is
 * handed a school id (or resolves a name to one at its route's boundary) and
 * filters on `schoolid`: none puts the name back into a `where`. The models are
 * replaced; what is asserted is the `where` each one builds, and what each
 * route does with a school named by id, by name, unknown, or by a name that
 * differs only by a Khmer mark.
 *
 * `schools` is an in-memory table: `findAll` answers the by-name narrowing
 * (TRIM equality under a collation that ignores case, trailing spaces and the
 * nikahit mark) and the list search (LIKE), `findOne` answers a lookup by id.
 */
const SAMPLE = { schoolid: "id-sample", schoolname: "Sample School", curriculums: [] };
const KHMER = { schoolid: "id-khmer", schoolname: "សាលាគំរូ", curriculums: [] }; // has nikahit U+17C6
const OTHER = { schoolid: "id-other", schoolname: "Another School", curriculums: [] };

const collate = (s: string) => s.replace(/ំ/g, "").replace(/ +$/, "").toLowerCase();
let table = [SAMPLE, KHMER, OTHER];

beforeEach(() => {
  table = [SAMPLE, KHMER, OTHER];
  jest.spyOn(schools, "findAll").mockImplementation((async (opts: { where: Record<symbol | string, unknown> & { logic?: string } }) => {
    if (opts.where && "logic" in opts.where) {
      return table.filter((s) => collate(s.schoolname.trim()) === collate(String(opts.where.logic)));
    }
    // list search: every term must be contained in the name
    const terms = ((opts.where[Op.and] as Array<{ schoolname: Record<symbol, string> }>) ?? []).map((t) =>
      String(t.schoolname[Op.like]).replace(/%/g, "").toLowerCase(),
    );
    return table.filter((s) => terms.every((t) => s.schoolname.toLowerCase().includes(t)));
  }) as never);
  jest.spyOn(schools, "findOne").mockImplementation((async (opts: { where: { schoolid: string } }) =>
    table.find((s) => s.schoolid === opts.where.schoolid) ?? null) as never);
});
afterEach(() => jest.restoreAllMocks());

const whereOf = (spy: jest.SpyInstance, call = 0) => (spy.mock.calls[call][0] as { where: Record<string | symbol, unknown> }).where;
const noName = (where: Record<string | symbol, unknown>) => {
  expect(JSON.stringify(where)).not.toMatch(/schoolname/);
};

describe("the learner list (GET /student/all)", () => {
  const find = () => jest.spyOn(students, "findAll").mockResolvedValue([] as never);

  it("filters on the school id the route resolved, never on the name; no limit when a school is chosen", async () => {
    const f = find();
    await new StudentBusiness().getStudentsWithFilter("", "id-sample", "", false);
    expect(whereOf(f).schoolid).toBe("id-sample");
    noName(whereOf(f));
    expect((f.mock.calls[0][0] as { limit?: number }).limit).toBeUndefined();
  });

  it("without a school it is limited to 50 and filters on no school", async () => {
    const f = find();
    await new StudentBusiness().getStudentsWithFilter("", undefined, "", false);
    expect(whereOf(f).schoolid).toBeUndefined();
    expect((f.mock.calls[0][0] as { limit?: number }).limit).toBe(50);
  });

  describe("the route", () => {
    const call = (schoolname: string, schoolid = "") => new StudentController().getAllStudents("", "", schoolname, schoolid, "");

    it("a name is resolved to the id once, with the text rule (case and spaces do not matter)", async () => {
      const f = find();
      await call(" sample SCHOOL ");
      expect(whereOf(f).schoolid).toBe("id-sample");
    });

    it("an id is used as given (and checked to exist)", async () => {
      const f = find();
      await call("", "id-other");
      expect(whereOf(f).schoolid).toBe("id-other");
    });

    it("the id wins when both are sent", async () => {
      const f = find();
      await call("Another School", "id-sample");
      expect(whereOf(f).schoolid).toBe("id-sample");
    });

    it("no school sent: no school filter", async () => {
      const f = find();
      await call("");
      expect(whereOf(f).schoolid).toBeUndefined();
    });

    it("an unknown name is a 404, not an empty list", async () => {
      const f = find();
      await expect(call("Nowhere School")).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(f).not.toHaveBeenCalled();
    });

    it("an unknown id is a 404", async () => {
      await expect(call("", "no-such-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("a name that differs from a school's only by a Khmer mark is not found (404)", async () => {
      const f = find();
      await expect(call("សាលាគរូ")).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(f).not.toHaveBeenCalled();
      await call("សាលាគំរូ");
      expect(whereOf(f).schoolid).toBe("id-khmer");
    });
  });
});

describe("the learner edit export (GET /student/download-students)", () => {
  it("filters on the school id; the school is no longer looked up by name", async () => {
    jest.spyOn(countries, "findOne").mockResolvedValue(null as never);
    const f = jest.spyOn(students, "findAll").mockResolvedValue([] as never);
    await new StudentBusiness().getAllStudentsForEdit("", "id-sample", "");
    expect(whereOf(f).schoolid).toBe("id-sample");
    noName(whereOf(f));
    expect(schools.findAll).not.toHaveBeenCalled();
  });
});

describe("the admin lists search by school name through the schools, then limit the rows by id", () => {
  it("learners: { key: schoolname } becomes schoolid IN (the matching schools' ids)", async () => {
    const f = jest.spyOn(students, "findAndCountAll").mockResolvedValue({ count: 0, rows: [] } as never);
    const b = new StudentBusiness();
    b.getstudentaccess = jest.fn().mockResolvedValue([]);
    jest.spyOn(schoolusers, "hasOne").mockReturnValue(undefined as never);
    jest.spyOn(curriculums, "hasOne").mockReturnValue(undefined as never);
    jest.spyOn(students, "belongsTo").mockReturnValue(undefined as never);
    await b.getAllStudents({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolname", value: "school" }, { key: "city", value: "x" }] } as never);
    const where = whereOf(f);
    expect(where.schoolid).toEqual({ [Op.in]: ["id-sample", "id-other"] });
    // the other filter is untouched and nothing filters on a name
    expect(inspect(where, { depth: 8 })).toMatch(/city/);
    expect(JSON.stringify(where)).not.toMatch(/schoolname/);
  });

  it("learners: a school filter that matches no school matches NO learner (an empty IN, never everyone)", async () => {
    const f = jest.spyOn(students, "findAndCountAll").mockResolvedValue({ count: 0, rows: [] } as never);
    const b = new StudentBusiness();
    b.getstudentaccess = jest.fn().mockResolvedValue([]);
    jest.spyOn(schoolusers, "hasOne").mockReturnValue(undefined as never);
    jest.spyOn(curriculums, "hasOne").mockReturnValue(undefined as never);
    jest.spyOn(students, "belongsTo").mockReturnValue(undefined as never);
    await b.getAllStudents({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolname", value: "zzz" }] } as never);
    expect(whereOf(f).schoolid).toEqual({ [Op.in]: [] });
  });

  it("learners: { key: schoolid } limits to that school; several comma-separated name terms must all match one school's name", async () => {
    const f = jest.spyOn(students, "findAndCountAll").mockResolvedValue({ count: 0, rows: [] } as never);
    const b = new StudentBusiness();
    b.getstudentaccess = jest.fn().mockResolvedValue([]);
    jest.spyOn(schoolusers, "hasOne").mockReturnValue(undefined as never);
    jest.spyOn(curriculums, "hasOne").mockReturnValue(undefined as never);
    jest.spyOn(students, "belongsTo").mockReturnValue(undefined as never);
    await b.getAllStudents({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: "id-other" }] } as never);
    expect(whereOf(f).schoolid).toEqual({ [Op.in]: ["id-other"] });
    await b.getAllStudents({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolname", value: "sample, school" }] } as never);
    expect(whereOf(f, 1).schoolid).toEqual({ [Op.in]: ["id-sample"] });
  });

  it("teachers: the same, on the logins", async () => {
    const f = jest.spyOn(schoolusers, "findAndCountAll").mockResolvedValue({ count: 0, rows: [] } as never);
    await new TeacherBusiness().getAllTeachers({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolname", value: "another" }] } as never);
    expect(whereOf(f).schoolid).toEqual({ [Op.in]: ["id-other"] });
    expect(JSON.stringify(whereOf(f))).not.toMatch(/schoolname/);
  });
});

describe("a school's teachers", () => {
  it("the duplicate-username check for a CSV import filters on the school id", async () => {
    const f = jest.spyOn(schoolusers, "findAll").mockResolvedValue([] as never);
    await new TeacherBusiness().getteacherusersbyschoolid("id-sample", ["t1"]);
    expect(whereOf(f).schoolid).toBe("id-sample");
    noName(whereOf(f));
  });
});

describe("classes, grades and curricula filtered by school", () => {
  it("classes: where.schoolid, not the joined school's name", async () => {
    const f = jest.spyOn(standards, "findAll").mockResolvedValue([] as never);
    await new StandardBusiness().getStandardsWithFilter("", "id-sample");
    expect(whereOf(f).schoolid).toBe("id-sample");
    expect(JSON.stringify(whereOf(f))).not.toMatch(/schoolname/);
    expect(Object.keys(whereOf(f))).not.toContain("$school.schoolname$");
  });

  it("the class route resolves a name once; an unknown name is a 404", async () => {
    const f = jest.spyOn(standards, "findAll").mockResolvedValue([] as never);
    await new StandardController().getAllSchoolsWithFilter("", "another school", "");
    expect(whereOf(f).schoolid).toBe("id-other");
    await expect(new StandardController().getAllSchoolsWithFilter("", "Nowhere", "")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("grades: the learner lookup filters on the school id", async () => {
    const one = jest.spyOn(students, "findOne").mockResolvedValue(null as never);
    jest.spyOn(grades, "findAll").mockResolvedValue([] as never);
    await new GradeBusiness().getGradesWithFilter("", "", "student-1", "", "id-sample");
    expect(whereOf(one).schoolid).toBe("id-sample");
    noName(whereOf(one));
  });

  it("grade and curriculum routes resolve a name once, by the same rule", async () => {
    const one = jest.spyOn(students, "findOne").mockResolvedValue(null as never);
    jest.spyOn(grades, "findAll").mockResolvedValue([] as never);
    await new GradeController().getAllGrades("", "", "student-1", "", "sample school", "");
    expect(whereOf(one).schoolid).toBe("id-sample");
    await expect(new GradeController().getAllGrades("", "", "s", "", "សាលាគរូ", "")).rejects.toMatchObject({ code: "NOT_FOUND" });

    jest.spyOn(curriculums, "findAll").mockResolvedValue([] as never);
    await new CurriculumController().getAllCurriculums("", "", "", "sample school", "");
    expect(schools.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolid: "id-sample" } }));
    await expect(new CurriculumController().getAllCurriculums("", "", "", "Nowhere", "")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("curricula: the school is looked up by id", async () => {
    jest.spyOn(curriculums, "findAll").mockResolvedValue([] as never);
    await new CurriculumBusiness().getCurriculumsWithFilter("", "", "", "id-sample");
    expect(schools.findOne).toHaveBeenCalledWith({ where: { schoolid: "id-sample" } });
  });
});

describe("fees collection by school", () => {
  it("the school list the dashboard reads filters on the school id", async () => {
    const f = jest.spyOn(schools, "findAll").mockResolvedValue([] as never);
    await new SchoolcontributeBusiness().getSchoolsWithFilter("id-sample", "");
    expect(whereOf(f).schoolid).toBe("id-sample");
    noName(whereOf(f));
  });
});

describe("reports", () => {
  const count = () => jest.spyOn(students, "count").mockResolvedValue(0 as never);

  it("reach charts filter the learners on the school id", async () => {
    const c = count();
    await new ReportBusiness().getAllStudentsGender("", "id-sample");
    expect(whereOf(c, 0).schoolid).toBe("id-sample");
    expect(whereOf(c, 1).schoolid).toBe("id-sample");
    c.mockClear();
    await new ReportBusiness().getAllStudentsDisability("", "id-sample");
    for (const i of [0, 1, 2]) expect(whereOf(c, i).schoolid).toBe("id-sample");
    c.mockClear();
    await new ReportBusiness().getStudentsOfflineOnline("id-sample", "", "online");
    expect(whereOf(c, 0).schoolid).toBe("id-sample");
    for (const call of c.mock.calls) noName((call[0] as { where: Record<string, unknown> }).where);
  });

  it("the school dashboard counts by school id", async () => {
    const c = count();
    const t = jest.spyOn(schoolusers, "count").mockResolvedValue(0 as never);
    await new ReportBusiness().getDashboardBySchool("id-sample");
    expect(whereOf(c).schoolid).toBe("id-sample");
    const include = (t.mock.calls[0][0] as { include: Array<{ where: unknown }> }).include[0];
    expect(include.where).toEqual({ schoolid: "id-sample" });
  });

  it("the reach routes resolve the school once (name or id); an unknown one is a 404", async () => {
    const c = count();
    await new ReportController().getStudentGender("", "sample school", "");
    expect(whereOf(c, 0).schoolid).toBe("id-sample");
    c.mockClear();
    await new ReportController().getStudentGender("", "", "id-other");
    expect(whereOf(c, 0).schoolid).toBe("id-other");
    await expect(new ReportController().getStudentGender("", "Nowhere", "")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(new ReportController().getStudentGender("", "សាលាគរូ", "")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the school dashboard route takes a name or an id in its path segment", async () => {
    const c = count();
    jest.spyOn(schoolusers, "count").mockResolvedValue(0 as never);
    await new ReportController().getSchoolData("Sample School");
    expect(whereOf(c).schoolid).toBe("id-sample");
    c.mockClear();
    table = [{ schoolid: "11111111-1111-4111-8111-111111111111", schoolname: "Uuid School", curriculums: [] }, ...table];
    await new ReportController().getSchoolData("11111111-1111-4111-8111-111111111111");
    expect(whereOf(c).schoolid).toBe("11111111-1111-4111-8111-111111111111");
    await expect(new ReportController().getSchoolData("Nowhere")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the learner status report: a school filter (name or id) becomes the learners' school id", async () => {
    const f = jest.spyOn(students, "findAndCountAll").mockResolvedValue({ count: 0, rows: [] } as never);
    await new ReportBusiness().getStudentStatus({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolname", value: "another school" }] } as never);
    expect(whereOf(f)["$school.schoolid$"]).toBe("id-other");
    expect(Object.keys(whereOf(f))).not.toContain("$school.schoolname$");
    await new ReportBusiness().getStudentStatus({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolid", value: "id-sample" }] } as never);
    expect(whereOf(f, 1)["$school.schoolid$"]).toBe("id-sample");
    await expect(
      new ReportBusiness().getStudentStatus({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolname", value: "Nowhere" }] } as never),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("feedback", () => {
  it("a school filter limits the feedback to that school's logins by id", async () => {
    const f = jest.spyOn(feedbacks, "findAndCountAll").mockResolvedValue({ count: 0, rows: [] } as never);
    jest.spyOn(schoolusers, "hasMany").mockReturnValue(undefined as never);
    jest.spyOn(feedbacks, "belongsTo").mockReturnValue(undefined as never);
    await new FeedbackBusiness().getAllFeedbacks({ pageindex: 1, pagesize: 20, filter: [{ key: "schoolname", value: "sample school" }] } as never);
    expect(whereOf(f)["$schooluser.schoolid$"]).toBe("id-sample");
    expect(Object.keys(whereOf(f))).not.toContain("$schooluser.schoolname$");
  });
});

describe("the school module", () => {
  it("a school that has learners is found by the school's id", async () => {
    const c = jest.spyOn(students, "count").mockResolvedValue(3 as never);
    await expect(new SchoolBusiness().schoolstudentexists("id-sample")).resolves.toBe(true);
    expect(whereOf(c).schoolid).toBe("id-sample");
    noName(whereOf(c));
  });

  it("the schools-with-learners list groups by school id (two schools may share a name)", async () => {
    const f = jest.spyOn(students, "findAll").mockResolvedValue([] as never);
    await new SchoolBusiness().getallschools();
    expect((f.mock.calls[0][0] as { group: string }).group).toBe("schoolid");
    expect(JSON.stringify((f.mock.calls[0][0] as { attributes: unknown }).attributes)).toMatch(/schoolid/);
  });
});
