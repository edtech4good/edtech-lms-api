import { curriculums } from "src/models/data-models/curriculums";
import { schools } from "src/models/data-models/school";
import { schoolcontributedata } from "src/models/data-models/schoolcontributedata";
import { schoolusers } from "src/models/data-models/schoolusers";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { ApiError } from "src/models/ApiError";
import { SchoolBusiness } from "src/business/school.business";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { StudentBusiness } from "src/business/student.business";
import { TeacherBusiness } from "src/business/teacher.business";
import { StandardBusiness } from "src/business/standard.business";
import { SchoolcontributeBusiness } from "src/business/schoolcontribute.business";
import { CreateSchool, EditSchool } from "src/modules/school/school.business.validator";
import { createschool as createSchoolRequest, updateschool as updateSchoolRequest } from "src/modules/school/school.request.validator";
import { StudentController } from "src/modules/students/student.controller";
import { TeacherController } from "src/modules/teachers/teacher.controller";
import { dbinstance } from "src/services/dbservice";

/**
 * C4: every writer of `students` and `schoolusers` stores the school's id next
 * to its name. The models and the transaction are replaced; what is under test
 * is WHAT each writer hands to its insert or update, and that a name that
 * matches no school stops the write before anything is stored. The writers are
 * also run for real against MySQL (see the PR description).
 */

const SAMPLE = { schoolid: "school-sample-id", schoolname: "Sample School" };
const KHMER = { schoolid: "school-khmer-id", schoolname: "សាលាគំរូ" };

// Case folded, trailing spaces ignored, nikahit (U+17C6) weighs nothing: what MySQL's `=` does here.
const collate = (s: string) => s.replace(/ំ/g, "").replace(/ +$/, "").toLowerCase();

let tnx: { commit: jest.Mock; rollback: jest.Mock; LOCK: { SHARE: string; UPDATE: string } };
let known = [SAMPLE, KHMER];

beforeEach(() => {
  known = [SAMPLE, KHMER];
  tnx = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(tnx as never);
  // the by-name lookup is `WHERE TRIM(schoolname) = ?`: a Sequelize where(fn, value), `logic` is the value
  jest.spyOn(schools, "findAll").mockImplementation((async (opts: { where: { logic: string } }) =>
    known.filter((s) => collate(s.schoolname.replace(/^ +| +$/g, "")) === collate(opts.where.logic))) as never);
  jest.spyOn(schools, "findOne").mockImplementation((async (opts: { where: { schoolid: string } }) =>
    known.find((s) => s.schoolid === opts.where.schoolid) ?? null) as never);
});

afterEach(() => jest.restoreAllMocks());

const rowsOf = (spy: jest.SpyInstance) => spy.mock.calls[0][0] as Array<Record<string, unknown>>;

describe("SchoolUserBusiness.createSchoolUser", () => {
  const row = (over: object) => ({
    schooluserid: "u1",
    schoolusername: "sample.user",
    schooluserpasswordhash: "pw",
    schooluserrole: 3,
    schooluserstatus: 1,
    isdisabled: false,
    ...over,
  });

  it("resolves the id from a name-only row (teacher create), inside the caller's transaction", async () => {
    const bulk = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    await new SchoolUserBusiness().createSchoolUser([row({ schoolname: KHMER.schoolname })] as never, tnx as never);

    const [rows, opts] = bulk.mock.calls[0] as unknown as [Array<Record<string, unknown>>, { transaction: unknown }];
    expect(rows[0]).toMatchObject(KHMER);
    expect(rows[0].schooluserpasswordhash).not.toBe("pw"); // still hashed
    expect(opts.transaction).toBe(tnx);
    expect(schools.findAll).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx }));
  });

  it("stores the school's OWN stored name for a trailing space or different capitals", async () => {
    const bulk = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    await new SchoolUserBusiness().createSchoolUser(
      [row({ schoolname: "Sample School " }), row({ schoolname: "SAMPLE SCHOOL", schoolusername: "b" })] as never,
      tnx as never,
    );
    for (const r of rowsOf(bulk)) expect(r).toMatchObject(SAMPLE);
  });

  it("stores both when the caller already has the school (learner create), re-reading the school in the transaction", async () => {
    const bulk = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    await new SchoolUserBusiness().createSchoolUser(
      [row({ schoolname: "an older name", schoolid: SAMPLE.schoolid })] as never,
      tnx as never,
    );
    expect(rowsOf(bulk)[0]).toMatchObject(SAMPLE);
    expect(schools.findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx }));
  });

  it("stores nothing when the name matches no school, or matches one only under the collation (a Khmer mark)", async () => {
    const bulk = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    for (const name of ["No Such School", "សាលាគរូ"]) {
      await expect(
        new SchoolUserBusiness().createSchoolUser([row({ schoolname: name })] as never, tnx as never),
      ).rejects.toBeInstanceOf(ApiError);
    }
    expect(bulk).not.toHaveBeenCalled();
  });
});

describe("StudentBusiness.createStudents", () => {
  it("resolves the id for a name-only row and keeps a row that already has it", async () => {
    const bulk = jest.spyOn(students, "bulkCreate").mockResolvedValue([] as never);
    await new StudentBusiness().createStudents(
      [
        { studentid: "s1", schoolname: SAMPLE.schoolname },
        { studentid: "s2", schoolname: KHMER.schoolname, schoolid: KHMER.schoolid },
      ] as never,
      tnx as never,
    );
    const [rows, opts] = bulk.mock.calls[0] as unknown as [Array<Record<string, unknown>>, { transaction: unknown }];
    expect(rows[0]).toMatchObject(SAMPLE);
    expect(rows[1]).toMatchObject(KHMER);
    expect(opts.transaction).toBe(tnx);
  });

  it("stores the school's own name, not the given text, for a trailing space or capitals", async () => {
    const bulk = jest.spyOn(students, "bulkCreate").mockResolvedValue([] as never);
    await new StudentBusiness().createStudents([{ studentid: "s1", schoolname: " sample SCHOOL " }] as never, tnx as never);
    expect(rowsOf(bulk)[0]).toMatchObject(SAMPLE);
  });

  it("stores nothing when a name matches no school", async () => {
    const bulk = jest.spyOn(students, "bulkCreate").mockResolvedValue([] as never);
    await expect(
      new StudentBusiness().createStudents([{ studentid: "s1", schoolname: "Nowhere" }] as never, tnx as never),
    ).rejects.toBeInstanceOf(ApiError);
    expect(bulk).not.toHaveBeenCalled();
  });
});

describe("StudentController.createall (POST /student/create)", () => {
  const body = {
    schoolid: KHMER.schoolid,
    curriculumid: ["c1"],
    standard: "std1",
    students: [
      {
        schoolusername: "khm.learner",
        schooluserpasswordhash: "pw",
        studentfirstname: "សុខា",
        studentlastname: "ចាន់",
        genderid: "1",
        city: "c",
        country: "c",
        state: "c",
        dateofbirth: "01-01-2015",
        dateofjoin: "01-01-2024",
      },
    ],
  };
  const echoUsers = () =>
    jest
      .spyOn(schoolusers, "bulkCreate")
      .mockImplementation((async (rows: Array<{ schoolusername: string; schooluserid: string }>) => rows) as never);

  it("writes the school's id AND name on both the login and the learner, from the one school row", async () => {
    const users = echoUsers();
    const learners = jest.spyOn(students, "bulkCreate").mockResolvedValue([] as never);

    await new StudentController().createall(body as never, false, "true");

    expect(rowsOf(users)[0]).toMatchObject(KHMER);
    expect(rowsOf(learners)[0]).toMatchObject({ ...KHMER, studentfirstname: "សុខា" });
    expect(tnx.commit).toHaveBeenCalled();
    // The school was already known by id, so nothing is looked up by name; it is re-read by id in the transaction.
    expect(schools.findAll).not.toHaveBeenCalled();
    expect(schools.findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx }));
  });

  it("stores the school's CURRENT name when a rename committed between reading the school and inserting the learner", async () => {
    // The controller's own existence check (outside the transaction) sees the old name;
    // the read inside the transaction sees what the rename committed.
    (schools.findOne as jest.Mock).mockReset();
    (schools.findOne as jest.Mock)
      .mockResolvedValueOnce({ schoolid: KHMER.schoolid, schoolname: "សាលាចាស់" })
      .mockResolvedValue({ schoolid: KHMER.schoolid, schoolname: KHMER.schoolname });
    const users = echoUsers();
    const learners = jest.spyOn(students, "bulkCreate").mockResolvedValue([] as never);

    await new StudentController().createall(body as never, false, "true");

    expect(rowsOf(users)[0]).toMatchObject(KHMER);
    expect(rowsOf(learners)[0]).toMatchObject(KHMER);
  });

  it("stores nothing, and rolls back, when the school no longer exists", async () => {
    (schools.findOne as jest.Mock).mockReset();
    (schools.findOne as jest.Mock).mockResolvedValue(null);
    const users = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    const learners = jest.spyOn(students, "bulkCreate").mockResolvedValue([] as never);

    await expect(new StudentController().createall(body as never, false, "true")).rejects.toBeInstanceOf(ApiError);

    expect(users).not.toHaveBeenCalled();
    expect(learners).not.toHaveBeenCalled();
    expect(tnx.rollback).toHaveBeenCalled();
    expect(tnx.commit).not.toHaveBeenCalled();
  });

  it("stores nothing, and rolls back, when the school is renamed away or deleted between the check and the insert", async () => {
    (schools.findOne as jest.Mock).mockReset();
    (schools.findOne as jest.Mock)
      .mockResolvedValueOnce({ schoolid: KHMER.schoolid, schoolname: KHMER.schoolname })
      .mockResolvedValue(null);
    const users = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);

    await expect(new StudentController().createall(body as never, false, "true")).rejects.toBeInstanceOf(ApiError);
    expect(users).not.toHaveBeenCalled();
    expect(tnx.rollback).toHaveBeenCalled();
  });
});

describe("TeacherController.createall (POST /teacher/create)", () => {
  it("writes the id resolved from the school name onto the school login", async () => {
    const users = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([{ schooluserid: "t1" }] as never);
    await new TeacherController().createall(
      { schoolname: KHMER.schoolname, teachers: [{ schoolusername: "khm.teacher", schooluserpasswordhash: "pw" }] } as never,
      false,
    );
    expect(rowsOf(users)[0]).toMatchObject(KHMER);
  });

  it("stores the school's own name for capitals and a trailing space", async () => {
    const users = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([{ schooluserid: "t1" }] as never);
    await new TeacherController().createall(
      { schoolname: "SAMPLE school  ", teachers: [{ schoolusername: "t", schooluserpasswordhash: "pw" }] } as never,
      false,
    );
    expect(rowsOf(users)[0]).toMatchObject(SAMPLE);
  });

  it("creates nothing for a school name that matches no school, or only under the collation", async () => {
    const users = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    for (const schoolname of ["Nowhere", "សាលាគរូ"]) {
      await expect(
        new TeacherController().createall(
          { schoolname, teachers: [{ schoolusername: "x", schooluserpasswordhash: "pw" }] } as never,
          false,
        ),
      ).rejects.toBeInstanceOf(ApiError);
    }
    expect(users).not.toHaveBeenCalled();
    expect(tnx.rollback).toHaveBeenCalledTimes(2);
  });

  it("names the field in the error: a teacher request names one school for the whole request, so the field is schoolname", async () => {
    jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    const err = await new TeacherController()
      .createall({ schoolname: "Nowhere", teachers: [{ schoolusername: "x", schooluserpasswordhash: "pw" }] } as never, false)
      .catch((e) => e);
    expect(err.fields).toEqual([{ field: "schoolname", message: "That school doesn't exist." }]);
  });
});

describe("TeacherBusiness.addteacheruserbyschoolname (PUT /import/:schoolname/teachers)", () => {
  const teachers = [{ teacherusername: "t9", teacheruserpassword: "pw" }];

  it("writes the id and the school's own name, resolved in the same transaction", async () => {
    const users = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    await new TeacherBusiness().addteacheruserbyschoolname(teachers, "sample school");
    expect(rowsOf(users)[0]).toMatchObject(SAMPLE);
    expect(schools.findAll).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx }));
  });

  it("imports nothing for a name that matches no school or only matches under the collation", async () => {
    const users = jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([] as never);
    for (const name of ["Nowhere", "សាលាគរូ"]) {
      await expect(new TeacherBusiness().addteacheruserbyschoolname(teachers, name)).rejects.toBeInstanceOf(ApiError);
    }
    expect(users).not.toHaveBeenCalled();
    expect(tnx.rollback).toHaveBeenCalledTimes(2);
  });
});

describe("StudentBusiness.updateStudents (PUT /student/update: a learner move between schools)", () => {
  const edit = (schoolname: string) => ({
    studentid: "s1",
    schooluserid: "u1",
    schoolusername: "khm.learner",
    schoolname,
    curriculums: "Sample Curriculum",
    standard: "Class 1",
    studentfirstname: "សុខា",
    studentlastname: "ចាន់",
    genderid: "1",
    city: "c",
    country: "c",
    state: "c",
    dateofbirth: "01-01-2015",
    dateofjoin: "01-01-2024",
    is_teacher_acc: "0",
  });

  let user: { schoolname?: string; schoolid?: string; schoolusername: string; save: jest.Mock };
  let update: jest.SpyInstance;
  let standard: jest.SpyInstance;

  beforeEach(() => {
    user = { schoolusername: "khm.learner", save: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(students, "findOne").mockResolvedValue({
      studentid: "s1",
      schooluser: { schooluserid: "u1", schoolusername: "khm.learner" },
    } as never);
    standard = jest.spyOn(standards, "findOne").mockResolvedValue({ standardid: "std-1" } as never);
    jest.spyOn(curriculums, "findAll").mockResolvedValue([{ curriculumid: "c1" }] as never);
    jest.spyOn(schoolusers, "findOne").mockResolvedValue(user as never);
    update = jest.spyOn(students, "update").mockResolvedValue([1] as never);
  });

  const run = (schoolname: string) =>
    new StudentBusiness().updateStudents([edit(schoolname)] as never, { lmsuserid: "staff" } as never, tnx as never);

  it("writes the new school's id with its name on the learner AND on the login", async () => {
    await run(KHMER.schoolname);

    expect(update.mock.calls[0][0]).toMatchObject(KHMER);
    expect(update.mock.calls[0][1]).toMatchObject({ transaction: tnx });
    expect(user.schoolname).toBe(KHMER.schoolname);
    expect(user.schoolid).toBe(KHMER.schoolid);
    expect(user.save).toHaveBeenCalledWith({ fields: ["schoolname", "schoolid"], transaction: tnx });
    // The school was resolved inside the same transaction as the writes.
    expect(schools.findAll).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx }));
  });

  it("writes the school's own stored name, not the file's text, for a trailing space or capitals; the class is looked up in that school", async () => {
    await run(" SAMPLE school ");

    expect(update.mock.calls[0][0]).toMatchObject(SAMPLE);
    expect(user.schoolname).toBe(SAMPLE.schoolname);
    expect(user.schoolid).toBe(SAMPLE.schoolid);
    expect(JSON.stringify((standard.mock.calls[0][0] as { include: unknown }).include)).toContain(SAMPLE.schoolname);
  });

  it("names the failing ROW in the error, students.<i>.schoolname, so a batch that fails says which learner", async () => {
    const err = await new StudentBusiness()
      .updateStudents([edit(KHMER.schoolname), edit("Nowhere"), edit("Sample School")] as never, { lmsuserid: "staff" } as never, tnx as never)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.fields).toEqual([{ field: "students.1.schoolname", message: "That school doesn't exist." }]);
  });

  it("writes nothing for a name that matches no school, or only under the collation (a Khmer mark)", async () => {
    for (const name of ["Nowhere", "សាលាគរូ"]) {
      await expect(run(name)).rejects.toBeInstanceOf(ApiError);
    }
    expect(update).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });
});

describe("SchoolBusiness.updateschoolName (PUT /school/update/:schoolid: a rename)", () => {
  const staff = { lmsuserid: "staff" } as never;
  let school: { schoolid: string; schoolname: string; save: jest.Mock; [k: string]: unknown };
  let learners: jest.SpyInstance;
  let logins: jest.SpyInstance;
  let classes: jest.SpyInstance;
  let fees: jest.SpyInstance;

  beforeEach(() => {
    school = { schoolid: SAMPLE.schoolid, schoolname: SAMPLE.schoolname, save: jest.fn().mockResolvedValue(undefined) };
    (schools.findOne as jest.Mock).mockReset();
    (schools.findOne as jest.Mock).mockResolvedValue(school);
    learners = jest.spyOn(students, "update").mockResolvedValue([3] as never);
    logins = jest.spyOn(schoolusers, "update").mockResolvedValue([3] as never);
    classes = jest.spyOn(standards, "update").mockResolvedValue([2] as never);
    fees = jest.spyOn(schoolcontributedata, "update").mockResolvedValue([1] as never);
  });

  const rename = (schoolname: string) =>
    new SchoolBusiness().updateschoolName({ schoolid: SAMPLE.schoolid, schoolname, countryid: "c", curriculums: [] } as never, staff);

  it("renames the learners' and logins' copies of the name too, keyed on the school id, in one transaction", async () => {
    await rename("សាលាថ្មី");

    expect(school.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx }));
    for (const spy of [learners, logins, classes, fees]) {
      expect(spy).toHaveBeenCalledWith({ schoolname: "សាលាថ្មី" }, { where: { schoolid: SAMPLE.schoolid }, transaction: tnx });
    }
    expect(tnx.commit).toHaveBeenCalledTimes(1);
    expect(tnx.rollback).not.toHaveBeenCalled();
  });

  it("carries the new name to the class list's copy (standards) and the Fees Collection list's copy (schoolcontributedata), each keyed on its own schoolid", async () => {
    await rename("Renamed School");
    expect(classes).toHaveBeenCalledTimes(1);
    expect(fees).toHaveBeenCalledTimes(1);
    expect(classes.mock.calls[0][1]).toEqual({ where: { schoolid: SAMPLE.schoolid }, transaction: tnx });
    expect(fees.mock.calls[0][1]).toEqual({ where: { schoolid: SAMPLE.schoolid }, transaction: tnx });
  });

  it("rolls back everything when the Fees Collection copy fails to update", async () => {
    fees.mockRejectedValue(new Error("boom"));
    await expect(rename("Renamed School")).rejects.toThrow("boom");
    expect(tnx.rollback).toHaveBeenCalledTimes(1);
    expect(tnx.commit).not.toHaveBeenCalled();
  });

  it("also cascades a rename that only changes a Khmer mark or a trailing space (equal under the collation, not the same name)", async () => {
    school.schoolname = "សាលាគំរូ";
    await rename("សាលាគរូ");
    expect(learners).toHaveBeenCalledTimes(1);
    expect(logins).toHaveBeenCalledTimes(1);
  });

  it("also cascades a rename that only changes case", async () => {
    await rename("sample school");
    expect(learners).toHaveBeenCalledTimes(1);
    expect(learners).toHaveBeenCalledWith({ schoolname: "sample school" }, expect.anything());
  });

  it("trims the name it stores: a trailing or leading space is not a rename, and is never saved", async () => {
    await rename("  Sample School  ");
    expect(school.schoolname).toBe("Sample School");
    expect(learners).not.toHaveBeenCalled();
    await rename("  Renamed School ");
    expect(school.schoolname).toBe("Renamed School");
    expect(learners).toHaveBeenCalledWith({ schoolname: "Renamed School" }, expect.anything());
  });

  it("reads the school INSIDE the transaction under an update lock, and takes the previous name from that read", async () => {
    await rename("Renamed School");
    const read = (schools.findOne as jest.Mock).mock.calls[0][0];
    expect(read).toEqual(expect.objectContaining({ transaction: tnx, lock: "UPDATE" }));
    expect(read.where).toEqual({ schoolid: SAMPLE.schoolid, isdeleted: false });
  });

  it("an edit that carries the name it last saw cannot undo a rename that committed first: it reads the committed name, so its own change cascades", async () => {
    // A stateful school: the edit reads it after the rename committed (it waited on the update lock).
    const store = { schoolname: SAMPLE.schoolname };
    (schools.findOne as jest.Mock).mockReset();
    (schools.findOne as jest.Mock).mockImplementation(async () => ({
      schoolid: SAMPLE.schoolid,
      get schoolname() { return store.schoolname; },
      set schoolname(v: string) { (this as unknown as { pending: string }).pending = v; },
      save: async function (this: { pending: string }) { store.schoolname = this.pending; },
    }));
    const onLearners: string[] = [];
    learners.mockImplementation((async (values: { schoolname: string }) => { onLearners.push(values.schoolname); return [1]; }) as never);

    await rename("Renamed School"); // the rename commits first
    await rename(SAMPLE.schoolname); // the edit sends the old name back

    expect(store.schoolname).toBe(SAMPLE.schoolname);
    // each change reached the learners: the second one is not mistaken for "unchanged"
    expect(onLearners).toEqual(["Renamed School", SAMPLE.schoolname]);
  });

  it("does not touch learners or logins when the name is unchanged", async () => {
    await rename(SAMPLE.schoolname);
    expect(learners).not.toHaveBeenCalled();
    expect(logins).not.toHaveBeenCalled();
    expect(classes).not.toHaveBeenCalled();
    expect(fees).not.toHaveBeenCalled();
    expect(tnx.commit).toHaveBeenCalledTimes(1);
  });

  it("rolls back the school's own change when a cascade fails, and reports the failure", async () => {
    logins.mockRejectedValue(new Error("lock wait timeout"));
    await expect(rename("សាលាថ្មី")).rejects.toThrow("lock wait timeout");
    expect(tnx.rollback).toHaveBeenCalledTimes(1);
    expect(tnx.commit).not.toHaveBeenCalled();
  });

  it("returns null for a school that does not exist, writing nothing", async () => {
    (schools.findOne as jest.Mock).mockResolvedValue(null);
    await expect(rename("x")).resolves.toBeNull();
    expect(learners).not.toHaveBeenCalled();
    expect(tnx.rollback).toHaveBeenCalledTimes(1); // the lock taken for the read is released
  });
});

describe("a rename racing a learner create in that school", () => {
  /**
   * A tiny in-memory school/learner store with the one property that matters:
   * a transaction that has READ the school (shared lock) holds off a rename's
   * UPDATE of it, and a committed rename is visible to later reads. Whichever
   * of the two commits second must leave the learner's name equal to the
   * school's: either the create reads the new name, or the rename's cascade
   * renames the new learner. (The same two orders run against real MySQL
   * locks in the PR description.)
   */
  it("create first, rename second: the rename's cascade, keyed on the id, renames the new learner too", async () => {
    const school = { schoolid: KHMER.schoolid, schoolname: KHMER.schoolname };
    const learnersTable: Array<{ schoolid: string; schoolname: string }> = [];
    (schools.findOne as jest.Mock).mockReset();
    (schools.findOne as jest.Mock).mockImplementation(async () => ({ ...school, save: async () => undefined }));
    jest.spyOn(schoolusers, "bulkCreate").mockImplementation((async (rows: never[]) => rows) as never);
    jest.spyOn(students, "bulkCreate").mockImplementation((async (rows: Array<{ schoolid: string; schoolname: string }>) => {
      learnersTable.push(...rows);
      return rows;
    }) as never);
    jest.spyOn(students, "update").mockImplementation((async (values: { schoolname: string }, opts: { where: { schoolid: string } }) => {
      learnersTable.filter((l) => l.schoolid === opts.where.schoolid).forEach((l) => (l.schoolname = values.schoolname));
      return [1];
    }) as never);
    jest.spyOn(schoolusers, "update").mockResolvedValue([0] as never);
    jest.spyOn(standards, "update").mockResolvedValue([0] as never);
    jest.spyOn(schoolcontributedata, "update").mockResolvedValue([0] as never);

    await new StudentBusiness().createStudents([{ studentid: "s1", schoolid: school.schoolid, schoolname: school.schoolname }] as never, tnx as never);
    // the rename commits afterwards
    (schools.findOne as jest.Mock).mockResolvedValue({
      schoolid: school.schoolid,
      schoolname: school.schoolname,
      save: async function (this: { schoolname: string }) {
        school.schoolname = this.schoolname;
      },
    });
    await new SchoolBusiness().updateschoolName({ schoolid: school.schoolid, schoolname: "សាលាថ្មី", countryid: "c", curriculums: [] } as never, { lmsuserid: "u" } as never);

    expect(learnersTable.map((l) => l.schoolname)).toEqual([school.schoolname]);
    expect(school.schoolname).toBe("សាលាថ្មី");
  });

  it("rename first, create second (the create had read the school before the rename): the learner is stored under the school's committed name", async () => {
    // The create's caller read the school as "សាលាគំរូ"; the rename committed "សាលាថ្មី" before the insert.
    (schools.findOne as jest.Mock).mockReset();
    (schools.findOne as jest.Mock).mockResolvedValue({ schoolid: KHMER.schoolid, schoolname: "សាលាថ្មី" });
    const learnersSpy = jest.spyOn(students, "bulkCreate").mockResolvedValue([] as never);

    await new StudentBusiness().createStudents(
      [{ studentid: "s1", schoolid: KHMER.schoolid, schoolname: KHMER.schoolname }] as never,
      tnx as never,
    );

    expect(rowsOf(learnersSpy)[0]).toMatchObject({ schoolid: KHMER.schoolid, schoolname: "សាលាថ្មី" });
  });
});

describe("classes and Fees Collection rows store the school's own name, read in a transaction under a shared lock", () => {
  const user = { lmsuserid: "staff" } as never;

  it("class create: the school is read inside the transaction (shared lock) and its current name is stored", async () => {
    const create = jest.spyOn(standards, "create").mockResolvedValue({ standardid: "c1" } as never);
    await new StandardBusiness().createstandard(
      { standardname: "Class 1", schoolid: KHMER.schoolid, schoolname: "a name the client sent" } as never,
      user,
    );
    expect(schools.findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx, lock: "SHARE" }));
    expect(create.mock.calls[0][0]).toMatchObject({ schoolid: KHMER.schoolid, schoolname: KHMER.schoolname });
    expect(create.mock.calls[0][1]).toEqual({ transaction: tnx });
    expect(tnx.commit).toHaveBeenCalledTimes(1);
  });

  it("class create: a school that does not exist is a 404, nothing is stored, and the transaction rolls back", async () => {
    known = [];
    const create = jest.spyOn(standards, "create").mockResolvedValue({} as never);
    await expect(
      new StandardBusiness().createstandard({ standardname: "Class 1", schoolid: "nope" } as never, user),
    ).rejects.toBeInstanceOf(ApiError);
    expect(create).not.toHaveBeenCalled();
    expect(tnx.rollback).toHaveBeenCalledTimes(1);
    expect(tnx.commit).not.toHaveBeenCalled();
  });

  it("class update: the school's current name is stored, in the same transaction as the save", async () => {
    const klass = { standardid: "c1", save: jest.fn().mockResolvedValue(undefined) } as Record<string, unknown> & { save: jest.Mock };
    jest.spyOn(standards, "findOne").mockResolvedValue(klass as never);
    await new StandardBusiness().updatestandardName(
      { standardid: "c1", standardname: "Class 2", schoolid: SAMPLE.schoolid } as never,
      user,
    );
    expect(klass.schoolname).toBe(SAMPLE.schoolname);
    expect(klass.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx }));
    expect(schools.findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx, lock: "SHARE" }));
  });

  describe("Fees Collection: PUT /school-contribute/updateschoolname/:schoolid", () => {
    const rows = () => [
      { schoolname: "old", save: jest.fn().mockResolvedValue(undefined) },
      { schoolname: "old", save: jest.fn().mockResolvedValue(undefined) },
    ] as Array<Record<string, unknown> & { save: jest.Mock }>;

    it("stores the SCHOOL's own name, not the name the client sent; only the country comes from the request", async () => {
      const found = rows();
      jest.spyOn(schoolcontributedata, "findAll").mockResolvedValue(found as never);
      await new SchoolcontributeBusiness().updatedSchoolContribute(
        { schoolid: SAMPLE.schoolid, schoolname: "client text", countryid: "country-1" } as never,
        user,
      );
      for (const r of found) {
        expect(r.schoolname).toBe(SAMPLE.schoolname);
        expect(r.countryid).toBe("country-1");
        expect(r.save).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx }));
      }
      expect(schools.findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction: tnx, lock: "SHARE" }));
      expect(tnx.commit).toHaveBeenCalledTimes(1);
    });

    it("awaits every save before it answers and rolls everything back if one fails", async () => {
      const found = rows();
      found[1].save.mockRejectedValue(new Error("save failed"));
      jest.spyOn(schoolcontributedata, "findAll").mockResolvedValue(found as never);
      await expect(
        new SchoolcontributeBusiness().updatedSchoolContribute({ schoolid: SAMPLE.schoolid, countryid: "c" } as never, user),
      ).rejects.toThrow("save failed");
      expect(tnx.rollback).toHaveBeenCalledTimes(1);
      expect(tnx.commit).not.toHaveBeenCalled();
    });

    it("a school that does not exist is a 404 and nothing is saved", async () => {
      known = [];
      const found = rows();
      jest.spyOn(schoolcontributedata, "findAll").mockResolvedValue(found as never);
      await expect(
        new SchoolcontributeBusiness().updatedSchoolContribute({ schoolid: "nope", countryid: "c" } as never, user),
      ).rejects.toBeInstanceOf(ApiError);
      expect(found[0].save).not.toHaveBeenCalled();
    });
  });
});

describe("school names are trimmed on create and update", () => {
  const input = { schoolname: "  Sample School  ", countryid: "c", curriculums: [] };

  it("createschool stores the trimmed name", async () => {
    const create = jest.spyOn(schools, "create").mockResolvedValue({} as never);
    await new SchoolBusiness().createschool({ ...input } as never, { lmsuserid: "u" } as never);
    expect(create.mock.calls[0][0]).toMatchObject({ schoolname: "Sample School" });
  });

  it("the duplicate-name check and the edit check look the school up by the trimmed name", async () => {
    const count = jest.spyOn(schools, "count").mockResolvedValue(0 as never);
    await CreateSchool({} as never, { ...input });
    expect((count.mock.calls[0][0] as { where: { schoolname: string } }).where.schoolname).toBe("Sample School");

    (schools.findOne as jest.Mock).mockReset();
    (schools.findOne as jest.Mock).mockResolvedValue({ schoolid: "s", countryid: "c", curriculums: [] });
    jest.spyOn(schools, "count").mockResolvedValue(1 as never);
    await EditSchool({} as never, { ...input, schoolid: "s" });
    const byName = (schools.findOne as jest.Mock).mock.calls.find((c) => c[0].where.schoolname !== undefined);
    expect(byName![0].where.schoolname).toBe("Sample School");
  });

  it("the request validators trim the name too (joi trim) and still reject a blank one", () => {
    for (const v of [createSchoolRequest, updateSchoolRequest]) {
      const ok = (v.body as import("joi").ObjectSchema).validate({ ...input, countryid: "11111111-1111-4111-8111-111111111111" });
      expect(ok.error).toBeUndefined();
      expect(ok.value.schoolname).toBe("Sample School");
      const blank = (v.body as import("joi").ObjectSchema).validate({ ...input, schoolname: "   ", countryid: "11111111-1111-4111-8111-111111111111" });
      expect(blank.error).toBeDefined();
    }
  });
});
