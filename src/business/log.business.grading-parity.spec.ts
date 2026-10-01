/**
 * Central's slice of the server-grading protocol (workspace#79, following
 * the student API's #93/#94): `studentprogress.verified`,
 * `studentprogressquestions.clientiscorrect`/`servergrade`, and NOT
 * `answer` (central does not store raw learner answers).
 *
 * Unit-tested directly against `LogBusiness.importprogresslog` /
 * `.importprogressquestionlog`, the same way log.business.spec.ts tests
 * `recordSyncActivity` - only the two Sequelize models under test are
 * mocked, no transaction/HTTP/guard involved, since the column-stripping
 * logic under test lives entirely in these two methods and not in the
 * `PUT log/import` guard chain (which log.guard.spec.ts and
 * log.teacher-role.spec.ts already cover).
 */
const studentprogressBulkCreate = jest.fn().mockResolvedValue([]);
jest.mock("src/models/data-models/studentprogress", () => ({
  studentprogress: { bulkCreate: (...args: any[]) => studentprogressBulkCreate(...args) },
}));

const studentprogressquestionsBulkCreate = jest.fn().mockResolvedValue([]);
jest.mock("src/models/data-models/studentprogressquestions", () => ({
  studentprogressquestions: { bulkCreate: (...args: any[]) => studentprogressquestionsBulkCreate(...args) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LogBusiness } = require("./log.business");

describe("LogBusiness.importprogresslog central never trusts an imported `verified`", () => {
  const transaction = {} as any;

  beforeEach(() => {
    studentprogressBulkCreate.mockClear();
  });

  it("stores verified:false even when the payload claims verified:true", async () => {
    await new LogBusiness(transaction).importprogresslog([
      {
        studentprogressid: "sp-1",
        studentid: "student-1",
        ispass: 1,
        studentprogressreferenceid: "ref-1",
        starttime: new Date("2026-09-29T00:00:00Z"),
        progresstype: 1,
        resultpercentage: 100,
        marks: 5,
        points: 5,
        fullpoints: 5,
        scores: 5,
        verified: true,
      } as any,
    ]);

    expect(studentprogressBulkCreate).toHaveBeenCalledTimes(1);
    const [rows, options] = studentprogressBulkCreate.mock.calls[0];
    expect(rows[0]).toMatchObject({ studentprogressid: "sp-1", verified: false });
    expect(options.updateOnDuplicate).toEqual(
      expect.arrayContaining(["verified"])
    );
  });

  it("stores verified:false when the payload omits verified entirely (old client)", async () => {
    await new LogBusiness(transaction).importprogresslog([
      {
        studentprogressid: "sp-2",
        studentid: "student-1",
        ispass: 0,
        studentprogressreferenceid: "ref-2",
        starttime: new Date("2026-09-29T00:00:00Z"),
        progresstype: 1,
        resultpercentage: 40,
        marks: 2,
        points: 2,
        fullpoints: 5,
        scores: 2,
      } as any,
    ]);

    const [rows] = studentprogressBulkCreate.mock.calls[0];
    expect(rows[0]).toMatchObject({ verified: false });
  });

  it("an old-format payload (no `verified` field) imports its other fields exactly as before", async () => {
    const oldPayload = {
      studentprogressid: "sp-3",
      studentid: "student-9",
      ispass: 1,
      studentprogressreferenceid: "ref-3",
      starttime: new Date("2026-09-29T00:00:00Z"),
      endtime: new Date("2026-09-29T00:05:00Z"),
      progresstype: 2,
      resultpercentage: 80,
      marks: 4,
      points: 4,
      fullpoints: 5,
      scores: 4,
    };

    await new LogBusiness(transaction).importprogresslog([oldPayload as any]);

    const [rows, options] = studentprogressBulkCreate.mock.calls[0];
    // Every old field is passed through unchanged; verified is the only
    // thing added/overridden.
    expect(rows[0]).toEqual({ ...oldPayload, verified: false });
    expect(options.updateOnDuplicate).toEqual([
      "studentid",
      "ispass",
      "studentprogressreferenceid",
      "starttime",
      "endtime",
      "progresstype",
      "marks",
      "points",
      "resultpercentage",
      "fullpoints",
      "scores",
      "verified",
    ]);
  });
});

describe("LogBusiness.importprogressquestionlog stores clientiscorrect/servergrade, drops answer", () => {
  const transaction = {} as any;

  beforeEach(() => {
    studentprogressquestionsBulkCreate.mockClear();
  });

  it("stores clientiscorrect and servergrade when present", async () => {
    await new LogBusiness(transaction).importprogressquestionlog([
      {
        studentprogressid: "sp-1",
        studentprogressquestionid: "spq-1",
        tries: 1,
        iscorrect: 1,
        referencequestionid: "q-1",
        clientiscorrect: true,
        servergrade: "correct",
      } as any,
    ]);

    const [rows, options] = studentprogressquestionsBulkCreate.mock.calls[0];
    expect(rows[0]).toMatchObject({
      studentprogressid: "sp-1",
      studentprogressquestionid: "spq-1",
      tries: 1,
      iscorrect: 1,
      referencequestionid: "q-1",
      clientiscorrect: true,
      servergrade: "correct",
    });
    expect(options.updateOnDuplicate).toEqual(
      expect.arrayContaining(["clientiscorrect", "servergrade"])
    );
  });

  it("never stores `answer`, even when the payload carries one", async () => {
    await new LogBusiness(transaction).importprogressquestionlog([
      {
        studentprogressid: "sp-1",
        studentprogressquestionid: "spq-2",
        tries: 1,
        iscorrect: 0,
        referencequestionid: "q-2",
        answer: { v: 1, type: "mcq", value: "A" },
        clientiscorrect: false,
        servergrade: "incorrect",
      } as any,
    ]);

    const [rows] = studentprogressquestionsBulkCreate.mock.calls[0];
    expect(rows[0]).not.toHaveProperty("answer");
  });

  it("an old-format item (no clientiscorrect/servergrade/answer) imports the same old columns/values as before", async () => {
    const oldItem = {
      studentprogressid: "sp-1",
      studentprogressquestionid: "spq-3",
      tries: 2,
      iscorrect: 1,
      referencequestionid: "q-3",
    };

    await new LogBusiness(transaction).importprogressquestionlog([oldItem as any]);

    const [rows, options] = studentprogressquestionsBulkCreate.mock.calls[0];
    expect(rows[0]).toMatchObject(oldItem);
    expect(rows[0].clientiscorrect).toBeNull();
    expect(rows[0].servergrade).toBeNull();
    expect(options.updateOnDuplicate).toEqual([
      "studentprogressid",
      "tries",
      "iscorrect",
      "referencequestionid",
      "clientiscorrect",
      "servergrade",
    ]);
  });
});

// Makes this file a module, so its top-level names are not shared with other
// spec files when ts-jest type-checks them in the same worker.
export {};
