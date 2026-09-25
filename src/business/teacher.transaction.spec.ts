import { TeacherBusiness } from "src/business/teacher.business";
import { schoolusers } from "src/models/data-models/schoolusers";
import { TeacherController } from "src/modules/teachers/teacher.controller";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";

/**
 * Both ways of creating teachers write inside a transaction and must not
 * answer until the write and the commit have finished. Before this was fixed
 * they called `tnx.commit()` / `tnx.rollback()` without awaiting them, and
 * `addteacheruserbyschoolname` swallowed its error, so:
 *
 * - a failing teacher insert via PUT /import/:schoolname/teachers still
 *   answered 200 with no teachers created;
 * - a failing commit answered success on both routes, and its rejection went
 *   unhandled — which server.ts treats as fatal (`process.exit`).
 *
 * The transaction and the model write are mocked: what is under test is the
 * control flow, not MySQL. The real-DB check is in the PR description.
 */

/**
 * Rejects on the next macrotask rather than immediately, so a caller that
 * isn't awaiting has already moved on (committed, answered) when it lands.
 */
const rejectLater = (message: string) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 5));

const finishedError = () =>
  new Error("Transaction cannot be rolled back because it has been finished with state: commit");

describe("teacher creation waits for its write and commit", () => {
  let tnx: {
    commit: jest.Mock;
    rollback: jest.Mock;
    committed: boolean;
    rolledBack: boolean;
  };

  beforeEach(() => {
    // commit and rollback finish a macrotask later and record that they
    // finished, so a caller that doesn't await them is caught answering early.
    tnx = {
      commit: jest.fn(
        () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              tnx.committed = true;
              resolve();
            }, 5)
          )
      ),
      rollback: jest.fn(
        () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              tnx.rolledBack = true;
              resolve();
            }, 5)
          )
      ),
      committed: false,
      rolledBack: false,
    };
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(tnx as never);
    jest.spyOn(schoolusers, "bulkCreate").mockResolvedValue([{ schooluserid: "t1" }] as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("TeacherBusiness.addteacheruserbyschoolname (PUT /import/:schoolname/teachers)", () => {
    const teachers = [{ teacherusername: "teacher9", teacheruserpassword: "pw-9" }];

    it("resolves only after the commit has finished", async () => {
      await new TeacherBusiness().addteacheruserbyschoolname(teachers, "School A");

      expect(tnx.committed).toBe(true);
      expect(tnx.rollback).not.toHaveBeenCalled();
    });

    it("rejects, after rolling back, when the insert fails", async () => {
      jest.spyOn(schoolusers, "bulkCreate").mockReturnValue(rejectLater("ER_DUP_ENTRY") as never);

      await expect(
        new TeacherBusiness().addteacheruserbyschoolname(teachers, "School A")
      ).rejects.toThrow("ER_DUP_ENTRY");
      expect(tnx.commit).not.toHaveBeenCalled();
      expect(tnx.rolledBack).toBe(true);
    });

    it("rejects with the commit's error, not the rollback's, when the commit fails", async () => {
      tnx.commit.mockReturnValue(rejectLater("commit failed"));
      tnx.rollback.mockRejectedValue(finishedError());

      await expect(
        new TeacherBusiness().addteacheruserbyschoolname(teachers, "School A")
      ).rejects.toThrow("commit failed");
    });
  });

  describe("TeacherController.createall (POST /teacher/create)", () => {
    const body = {
      schoolname: "School A",
      teachers: [{ schoolusername: "teacher9", schooluserpasswordhash: "pw-9" }],
    };

    it("resolves only after the commit has finished", async () => {
      await new TeacherController().createall(body as never, false);

      expect(tnx.committed).toBe(true);
    });

    it("rejects, after rolling back, when the insert fails", async () => {
      jest.spyOn(schoolusers, "bulkCreate").mockReturnValue(rejectLater("ER_DUP_ENTRY") as never);

      await expect(new TeacherController().createall(body as never, false)).rejects.toThrow(
        "ER_DUP_ENTRY"
      );
      expect(tnx.commit).not.toHaveBeenCalled();
      expect(tnx.rolledBack).toBe(true);
    });

    it("rejects with the commit's error, not the rollback's, when the commit fails", async () => {
      tnx.commit.mockReturnValue(rejectLater("commit failed"));
      tnx.rollback.mockRejectedValue(finishedError());

      await expect(new TeacherController().createall(body as never, false)).rejects.toThrow(
        "commit failed"
      );
    });
  });

  it("rollbackQuietly resolves even when the rollback throws", async () => {
    tnx.rollback.mockRejectedValue(finishedError());

    await expect(rollbackQuietly(tnx as never)).resolves.toBeUndefined();
    expect(tnx.rollback).toHaveBeenCalledTimes(1);
  });
});
