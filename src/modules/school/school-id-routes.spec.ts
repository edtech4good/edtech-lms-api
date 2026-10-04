import { schools } from "src/models/data-models/school";
import { AuthController } from "src/modules/auth/auth.controller";
import { ExportController } from "src/modules/export/export.controller";
import { ImportController } from "src/modules/import/import.controller";
import { SchoolController } from "src/modules/school/school.controller";
import { SyncController } from "src/modules/sync/sync.controller";

/**
 * The routes that were handed a school NAME (and so tied a learner to a school
 * by name) now resolve it, once, to the school's id, and also accept the id.
 * Called directly (guards are other specs' business); replaced are the school
 * table and the business classes behind each route, so what is asserted is what
 * each route hands down: the id, never the name.
 */
// A platform user not acting as an organisation: the caller whose reads are not limited to one organisation.
const PLATFORM = { organisationid: null, isplatform: true, permissions: [] };
const SAMPLE = { schoolid: "11111111-1111-4111-8111-111111111111", schoolname: "Sample School", uitheme: "corporate", brandingconfig: { logo: "x" }, curriculums: [] };
const KHMER = { schoolid: "22222222-2222-4222-8222-222222222222", schoolname: "សាលាគំរូ", uitheme: "kids", brandingconfig: null, curriculums: [] }; // has nikahit U+17C6
const collate = (s: string) => s.replace(/ំ/g, "").replace(/ +$/, "").toLowerCase();
const table = [SAMPLE, KHMER];

const getschooluserbyschoolid = jest.fn();
jest.mock("src/business/schooluser.business", () => ({
  ...jest.requireActual("src/business/schooluser.business"),
  SchoolUserBusiness: jest.fn().mockImplementation(() => ({ getschooluserbyschoolid })),
}));
const teacherlogin = jest.fn();
const generateTeacherAuthToken = jest.fn().mockResolvedValue({ accessToken: "t", refreshToken: "" });
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  AuthBusiness: jest.fn().mockImplementation(() => ({ teacherlogin })),
  TokenBusiness: jest.fn().mockImplementation(() => ({ generateTeacherAuthToken })),
}));
const getteacheruserbyschoolid = jest.fn();
const getteacherusersbyschoolid = jest.fn();
const addteacheruserbyschoolid = jest.fn();
jest.mock("src/business/teacher.business", () => ({
  ...jest.requireActual("src/business/teacher.business"),
  TeacherBusiness: jest.fn().mockImplementation(() => ({ getteacheruserbyschoolid, getteacherusersbyschoolid, addteacheruserbyschoolid })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  getschooluserbyschoolid.mockResolvedValue([]);
  getteacheruserbyschoolid.mockResolvedValue([]);
  getteacherusersbyschoolid.mockResolvedValue([]);
  addteacheruserbyschoolid.mockResolvedValue([]);
  generateTeacherAuthToken.mockResolvedValue({ accessToken: "t", refreshToken: "" });
  jest.spyOn(schools, "findAll").mockImplementation((async (opts: { where: { logic: string } }) =>
    table.filter((s) => collate(s.schoolname.trim()) === collate(String(opts.where.logic)))) as never);
  jest.spyOn(schools, "findOne").mockImplementation((async (opts: { where: { schoolid: string; isdeleted?: boolean } }) =>
    table.find((s) => s.schoolid === opts.where.schoolid) ?? null) as never);
});
afterEach(() => jest.restoreAllMocks());

describe("GET /school/branding (public: fails open to the default)", () => {
  const branding = (schoolname: unknown, schoolid: unknown) => new SchoolController().getBranding(schoolname, schoolid);
  const DEFAULT = { error: false, data: { uitheme: "kids", brandingconfig: null } };

  it("by id (new)", async () => {
    expect(await branding(undefined, SAMPLE.schoolid)).toEqual({ error: false, data: { uitheme: "corporate", brandingconfig: { logo: "x" } } });
  });

  it("by name, as the learner app sends the stored name today: resolved to the id, then read by id", async () => {
    expect(await branding("Sample School", undefined)).toEqual({ error: false, data: { uitheme: "corporate", brandingconfig: { logo: "x" } } });
    expect(await branding("sample school ", undefined)).toEqual({ error: false, data: { uitheme: "corporate", brandingconfig: { logo: "x" } } });
    // the school row itself is read by id
    expect(schools.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolid: SAMPLE.schoolid, isdeleted: false } }));
  });

  it("an unknown name or id, or a name that differs only by a Khmer mark, gets the default (never an error)", async () => {
    expect(await branding("Nowhere", undefined)).toEqual(DEFAULT);
    expect(await branding(undefined, "99999999-9999-4999-8999-999999999999")).toEqual(DEFAULT);
    expect(await branding("សាលាគរូ", undefined)).toEqual(DEFAULT);
    expect(await branding("សាលាគំរូ", undefined)).toEqual({ error: false, data: { uitheme: "kids", brandingconfig: null } });
  });

  it("anything that is not a non-empty string skips the lookup and gets the default", async () => {
    expect(await branding({ x: "1" }, undefined)).toEqual(DEFAULT);
    expect(await branding(undefined, undefined)).toEqual(DEFAULT);
    expect(await branding("", "")).toEqual(DEFAULT);
    expect(schools.findAll).not.toHaveBeenCalled();
  });
});

describe("the exports and the cloud sync take the school's name or id in the path", () => {
  const res = { set: jest.fn() };

  it("GET /export/:schoolname/students: a name is resolved, the business layer gets the id", async () => {
    await expect(new ExportController().getstudents("Sample School", "false", res, PLATFORM)).rejects.toMatchObject({ code: "NOT_FOUND" }); // no learners in this fake
    expect(getschooluserbyschoolid).toHaveBeenCalledWith(SAMPLE.schoolid, false);
  });

  it("GET /export/:schoolname/students: an id works too (online export flag kept)", async () => {
    await expect(new ExportController().getstudents(SAMPLE.schoolid, "true", res, PLATFORM)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getschooluserbyschoolid).toHaveBeenCalledWith(SAMPLE.schoolid, true);
  });

  it("GET /export/:schoolname/students: an unknown school is a 404 and nothing is read", async () => {
    await expect(new ExportController().getstudents("Nowhere", "false", res, PLATFORM)).rejects.toMatchObject({ code: "NOT_FOUND", message: "That school doesn't exist." });
    await expect(new ExportController().getstudents("សាលាគរូ", "false", res, PLATFORM)).rejects.toMatchObject({ message: "That school doesn't exist." });
    expect(getschooluserbyschoolid).not.toHaveBeenCalled();
  });

  it("GET /export/:schoolname/teachers: name or id", async () => {
    await expect(new ExportController().getteachers("sample school", res, PLATFORM)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getteacheruserbyschoolid).toHaveBeenCalledWith(SAMPLE.schoolid);
    getteacheruserbyschoolid.mockClear();
    await expect(new ExportController().getteachers(KHMER.schoolid, res, PLATFORM)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getteacheruserbyschoolid).toHaveBeenCalledWith(KHMER.schoolid);
  });

  it("the file name uses the school's own stored name, whichever way it was named", async () => {
    getteacheruserbyschoolid.mockResolvedValue([{ get: () => ({ schooluserid: "t1" }) }]);
    await new ExportController().getteachers(SAMPLE.schoolid, res, PLATFORM);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ "Content-Disposition": expect.stringContaining("teachers-Sample School.zip") }));
  });

  it("POST /sync/cloud/:schoolname/students: name or id, learners of the school by id (online)", async () => {
    await expect(new SyncController().synconlineschool("Sample School")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getschooluserbyschoolid).toHaveBeenCalledWith(SAMPLE.schoolid, true);
    getschooluserbyschoolid.mockClear();
    await expect(new SyncController().synconlineschool("Nowhere")).rejects.toMatchObject({ message: "That school doesn't exist." });
    expect(getschooluserbyschoolid).not.toHaveBeenCalled();
  });
});

describe("PUT /import/:schoolname/teachers", () => {
  const csv = (rows: string) => ({ buffer: Buffer.from(`teacherusername,teacheruserpassword\n${rows}`, "utf8") }) as never;

  it("a name or an id: the duplicate check and the insert are by the school's id", async () => {
    await new ImportController().putteachers("Sample School", csv("t1,pw1"), PLATFORM);
    expect(getteacherusersbyschoolid).toHaveBeenCalledWith(SAMPLE.schoolid, ["t1"]);
    expect(addteacheruserbyschoolid).toHaveBeenCalledWith(expect.any(Array), SAMPLE.schoolid, PLATFORM);
    addteacheruserbyschoolid.mockClear();
    await new ImportController().putteachers(KHMER.schoolid, csv("t2,pw2"), PLATFORM);
    expect(addteacheruserbyschoolid).toHaveBeenCalledWith(expect.any(Array), KHMER.schoolid, PLATFORM);
  });

  it("an unknown school is a 404 and nothing is written", async () => {
    await expect(new ImportController().putteachers("Nowhere", csv("t1,pw1"), PLATFORM)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(addteacheruserbyschoolid).not.toHaveBeenCalled();
  });
});

describe("the school-user token: the school comes from the login's id, not from a name match", () => {
  it("looks the school up by the id on the login row; schoolname stays a stored copy only", async () => {
    teacherlogin.mockResolvedValue({ schoolname: "an old stored name", schooluser: { schoolid: SAMPLE.schoolid } });
    await new AuthController().teacherlogin({ lmsusername: "u", lmsuserpassword: "p" } as never);

    expect(schools.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolid: SAMPLE.schoolid, isdeleted: false } }));
    expect(schools.findAll).not.toHaveBeenCalled(); // no lookup by name anywhere
    expect(generateTeacherAuthToken.mock.calls[0][1]).toMatchObject({ schoolid: SAMPLE.schoolid });
  });

  it("falls back to the learner row's own id when the login row has none", async () => {
    teacherlogin.mockResolvedValue({ schoolname: "x", schoolid: KHMER.schoolid, schooluser: {} });
    await new AuthController().teacherlogin({ lmsusername: "u", lmsuserpassword: "p" } as never);
    expect(generateTeacherAuthToken.mock.calls[0][1]).toMatchObject({ schoolid: KHMER.schoolid });
  });

  it("a login with no school at all gets no school row (the token falls back to the default theme)", async () => {
    teacherlogin.mockResolvedValue({ schoolname: "a name with no id", schooluser: {} });
    await new AuthController().teacherlogin({ lmsusername: "u", lmsuserpassword: "p" } as never);
    expect(schools.findOne).not.toHaveBeenCalled();
    expect(schools.findAll).not.toHaveBeenCalled();
    expect(generateTeacherAuthToken.mock.calls[0][1]).toBeNull();
  });
});
