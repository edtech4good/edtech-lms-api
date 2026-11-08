import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { LOGIN_HANDLE_MESSAGE } from "src/validators/login-handle";
import { ImportController } from "./import.controller";

/**
 * `PUT import/:schoolname/teachers` applies the teacher form's username rule to every row of the file
 * (2 to 16 English letters or numbers), and writes nothing when any row breaks it.
 */
const addteacheruserbyschoolid = jest.fn();
const getteacherusersbyschoolid = jest.fn();
jest.mock("src/business/teacher.business", () => ({
  TeacherBusiness: jest.fn().mockImplementation(() => ({ addteacheruserbyschoolid, getteacherusersbyschoolid })),
}));
jest.mock("src/business/school-scope", () => ({
  ...jest.requireActual("src/business/school-scope"),
  resolveOwnedSchoolSegment: jest.fn().mockResolvedValue({ schoolid: "school-1" }),
}));

const csv = (rows: Array<[string, string]>) =>
  ({ buffer: Buffer.from(["teacherusername,teacheruserpassword", ...rows.map((r) => r.join(","))].join("\n"), "utf8") }) as any;

const org = { organisationid: "org-1", isplatform: false } as any;

describe("PUT import/:schoolname/teachers: usernames", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getteacherusersbyschoolid.mockResolvedValue([]);
    addteacheruserbyschoolid.mockResolvedValue(undefined);
  });

  it("refuses a file with a Khmer username, names the row, and writes nothing", async () => {
    const run = new ImportController().putteachers("Test School", csv([["dara", "pass1"], ["សុខា", "pass2"]]), org);
    const err: ApiError = await run.then(() => { throw new Error("expected a refusal"); }, (e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect({ code: err.code, status: err.getStatus(), message: err.message, fields: err.fields }).toEqual({
      code: ErrorCode.INVALID_INPUT,
      status: 400,
      message: LOGIN_HANDLE_MESSAGE,
      fields: [{ field: "rows[1].teacherusername", message: LOGIN_HANDLE_MESSAGE }],
    });
    expect(addteacheruserbyschoolid).not.toHaveBeenCalled();
  });

  it("imports a file whose usernames are all English letters and numbers", async () => {
    await new ImportController().putteachers("Test School", csv([["dara", "pass1"], ["vanna02", "pass2"]]), org);
    expect(addteacheruserbyschoolid).toHaveBeenCalledTimes(1);
    expect(addteacheruserbyschoolid.mock.calls[0][0].map((t: any) => t.teacherusername)).toEqual(["dara", "vanna02"]);
  });
});
