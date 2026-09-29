import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { SchoolRole } from "src/models/enums/school.role.enum";

const schoolUserFindOne = jest.fn();
jest.mock("src/models/data-models/schoolusers", () => ({
  schoolusers: { findOne: (...args: any[]) => schoolUserFindOne(...args) },
}));

const syncsCreate = jest.fn().mockResolvedValue({});
jest.mock("src/models/data-models/syncrecord", () => ({
  syncs: { create: (...args: any[]) => syncsCreate(...args) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LogBusiness } = require("./log.business");

/**
 * `LogBusiness.recordSyncActivity`'s own role check - the defence-in-depth
 * layer alongside auth/school/login and JwtAccessStrategy (#90). Unit-tested
 * directly against the business method
 * (transaction and the `schoolusers`/`syncs` models stubbed, no HTTP, no
 * strategy), so this stays red on its own if the check regresses even were
 * the strategy-level guard ever to regress too.
 */
describe("LogBusiness.recordSyncActivity role check", () => {
  const transaction = {} as any;

  beforeEach(() => {
    schoolUserFindOne.mockReset();
    syncsCreate.mockClear();
  });

  const call = (schooluserid = "user-1") =>
    new LogBusiness(transaction).recordSyncActivity(
      { schooluserid } as any,
      "logupload-test.zip",
      false
    );

  it("rejects a student school user", async () => {
    schoolUserFindOne.mockResolvedValue({
      schooluserid: "student-1",
      schooluserrole: SchoolRole.STUDENT,
      isdisabled: false,
      isdeleted: false,
    });

    await expect(call("student-1")).rejects.toMatchObject(
      new ApiError(ErrorCode.NOT_ALLOWED, "Only a teacher account can upload logs.")
    );
    expect(syncsCreate).not.toHaveBeenCalled();
  });

  it("rejects an unmapped/unknown school role value (allow-list, not a STUDENT deny-list)", async () => {
    schoolUserFindOne.mockResolvedValue({
      schooluserid: "weird-1",
      schooluserrole: 0,
      isdisabled: false,
      isdeleted: false,
    });

    await expect(call("weird-1")).rejects.toMatchObject(
      new ApiError(ErrorCode.NOT_ALLOWED, "Only a teacher account can upload logs.")
    );
    expect(syncsCreate).not.toHaveBeenCalled();
  });

  it("rejects a disabled teacher account", async () => {
    schoolUserFindOne.mockResolvedValue({
      schooluserid: "teacher-1",
      schooluserrole: SchoolRole.TEACHER,
      isdisabled: true,
      isdeleted: false,
    });

    await expect(call("teacher-1")).rejects.toMatchObject(
      new ApiError(ErrorCode.NOT_ALLOWED, "Only a teacher account can upload logs.")
    );
    expect(syncsCreate).not.toHaveBeenCalled();
  });

  it("rejects a deleted teacher account", async () => {
    schoolUserFindOne.mockResolvedValue({
      schooluserid: "teacher-1",
      schooluserrole: SchoolRole.TEACHER,
      isdisabled: false,
      isdeleted: true,
    });

    await expect(call("teacher-1")).rejects.toMatchObject(
      new ApiError(ErrorCode.NOT_ALLOWED, "Only a teacher account can upload logs.")
    );
    expect(syncsCreate).not.toHaveBeenCalled();
  });

  it.each([SchoolRole.SUPERADMIN, SchoolRole.ADMIN, SchoolRole.TEACHER])(
    "records the sync for an active school user with SchoolRole %s",
    async (role) => {
      schoolUserFindOne.mockResolvedValue({
        schooluserid: "staff-1",
        schooluserrole: role,
        isdisabled: false,
        isdeleted: false,
      });

      await expect(call("staff-1")).resolves.toBeUndefined();
      expect(syncsCreate).toHaveBeenCalledTimes(1);
    }
  );
});
