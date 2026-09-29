/**
 * `studentprogressquestions` has a Sequelize model and `log/import` writes
 * to it, but no migration ever created it (schema drift, same story as
 * 20260720120000-create-drifted-tables.ts's four tables) - so a
 * migration-only database (UAT, prod, any fresh `db:migrate`) is missing it
 * entirely. `up()` used to call `addColumnIfMissing` unconditionally, which
 * throws via `describeTable` on a table that doesn't exist at all - a
 * deploy blocker caught in review. These specs drive `up()`/`down()`
 * against a mocked QueryInterface for both cases (table missing vs. table
 * already there), without a real database.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20260929120000-add-grading-protocol-columns-central");

type MockQI = {
  showAllTables: jest.Mock;
  describeTable: jest.Mock;
  createTable: jest.Mock;
  addColumn: jest.Mock;
  addIndex: jest.Mock;
  removeColumn: jest.Mock;
  dropTable: jest.Mock;
  sequelize: { query: jest.Mock; transaction: jest.Mock };
};

const makeQueryInterface = (): MockQI => {
  const qi: MockQI = {
    showAllTables: jest.fn(),
    describeTable: jest.fn(),
    createTable: jest.fn().mockResolvedValue(undefined),
    addColumn: jest.fn().mockResolvedValue(undefined),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined),
    sequelize: {
      query: jest.fn(),
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb({})),
    },
  };
  return qi;
};

describe("20260929120000-add-grading-protocol-columns-central up()", () => {
  it("creates studentprogressquestions (with clientiscorrect/servergrade already on it) when the table doesn't exist", async () => {
    const qi = makeQueryInterface();
    qi.showAllTables.mockResolvedValue(["studentprogress", "students"]);
    qi.sequelize.query.mockResolvedValue([[{ cs: "utf8mb4", coll: "utf8mb4_unicode_ci" }]]);
    qi.describeTable.mockImplementation((table: string) => {
      if (table === "studentprogress") return Promise.resolve({}); // no `verified` yet
      throw new Error(`describeTable(${table}) should not be called when the table is missing`);
    });

    await migration.up(qi);

    expect(qi.createTable).toHaveBeenCalledTimes(1);
    const [tableName, columns] = qi.createTable.mock.calls[0];
    expect(tableName).toBe("studentprogressquestions");
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "studentprogressid",
        "studentprogressquestionid",
        "tries",
        "iscorrect",
        "referencequestionid",
        "clientiscorrect",
        "servergrade",
      ])
    );
    expect(qi.addIndex).toHaveBeenCalledWith(
      "studentprogressquestions",
      ["studentprogressid"],
      expect.objectContaining({ name: "studentprogressid" })
    );
    // Falls back to describeTable/addColumn only for studentprogress.verified,
    // never for the table it just created.
    expect(qi.addColumn).toHaveBeenCalledWith(
      "studentprogress",
      "verified",
      expect.anything(),
      expect.anything()
    );
  });

  it("adds clientiscorrect/servergrade (and never re-creates the table) when it already exists", async () => {
    const qi = makeQueryInterface();
    qi.showAllTables.mockResolvedValue(["studentprogress", "studentprogressquestions"]);
    qi.describeTable.mockImplementation((table: string) => {
      if (table === "studentprogressquestions") {
        return Promise.resolve({
          studentprogressid: {},
          studentprogressquestionid: {},
          tries: {},
          iscorrect: {},
          referencequestionid: {},
        }); // no clientiscorrect/servergrade yet
      }
      if (table === "studentprogress") return Promise.resolve({}); // no verified yet
      throw new Error(`unexpected describeTable(${table})`);
    });

    await migration.up(qi);

    expect(qi.createTable).not.toHaveBeenCalled();
    const addedColumns = qi.addColumn.mock.calls.map((c: unknown[]) => c[1]);
    expect(addedColumns).toEqual(
      expect.arrayContaining(["clientiscorrect", "servergrade", "verified"])
    );
  });

  it("adds nothing already present (idempotent re-run)", async () => {
    const qi = makeQueryInterface();
    qi.showAllTables.mockResolvedValue(["studentprogress", "studentprogressquestions"]);
    qi.describeTable.mockImplementation((table: string) => {
      if (table === "studentprogressquestions") {
        return Promise.resolve({
          studentprogressid: {},
          studentprogressquestionid: {},
          tries: {},
          iscorrect: {},
          referencequestionid: {},
          clientiscorrect: {},
          servergrade: {},
        });
      }
      if (table === "studentprogress") return Promise.resolve({ verified: {} });
      throw new Error(`unexpected describeTable(${table})`);
    });

    await migration.up(qi);

    expect(qi.createTable).not.toHaveBeenCalled();
    expect(qi.addColumn).not.toHaveBeenCalled();
  });
});

describe("20260929120000-add-grading-protocol-columns-central down()", () => {
  it("removes only the added columns when the table exists and is empty (never drops it)", async () => {
    const qi = makeQueryInterface();
    qi.describeTable.mockImplementation((table: string) => {
      if (table === "studentprogressquestions") {
        return Promise.resolve({
          studentprogressid: {},
          studentprogressquestionid: {},
          tries: {},
          iscorrect: {},
          referencequestionid: {},
          clientiscorrect: {},
          servergrade: {},
        });
      }
      return Promise.resolve({ verified: {} });
    });

    await migration.down(qi);

    expect(qi.dropTable).not.toHaveBeenCalled();
    const removedColumns = qi.removeColumn.mock.calls.map((c: unknown[]) => c[1]);
    expect(removedColumns).toEqual(
      expect.arrayContaining(["servergrade", "clientiscorrect", "verified"])
    );
  });

  it("removes only the added columns when the table has rows (never drops it)", async () => {
    // down() never queries row counts any more - a pre-existing table (the
    // schema-drift case) isn't up()'s to remove regardless of whether it's
    // empty, so there's nothing for a row count to decide here.
    const qi = makeQueryInterface();
    qi.describeTable.mockImplementation((table: string) => {
      if (table === "studentprogressquestions") {
        return Promise.resolve({
          studentprogressid: {},
          studentprogressquestionid: {},
          tries: {},
          iscorrect: {},
          referencequestionid: {},
          clientiscorrect: {},
          servergrade: {},
        });
      }
      return Promise.resolve({ verified: {} });
    });

    await migration.down(qi);

    expect(qi.dropTable).not.toHaveBeenCalled();
    expect(qi.sequelize.query).not.toHaveBeenCalled();
    const removedColumns = qi.removeColumn.mock.calls.map((c: unknown[]) => c[1]);
    expect(removedColumns).toEqual(
      expect.arrayContaining(["servergrade", "clientiscorrect", "verified"])
    );
  });

  it("doesn't crash when the table is already missing, and never drops it", async () => {
    const qi = makeQueryInterface();
    qi.describeTable.mockImplementation((table: string) => {
      if (table === "studentprogressquestions") {
        // describeTable on a genuinely missing table throws in real
        // Sequelize - removeColumnIfPresent must handle this the same way
        // addColumnIfMissing does, by treating a thrown describeTable as
        // "nothing to do" rather than letting it propagate.
        return Promise.reject(new Error("No description found for \"studentprogressquestions\" table."));
      }
      return Promise.resolve({ verified: {} });
    });

    await expect(migration.down(qi)).resolves.toBeUndefined();

    expect(qi.dropTable).not.toHaveBeenCalled();
    expect(qi.removeColumn).toHaveBeenCalledWith(
      "studentprogress",
      "verified",
      expect.anything()
    );
    expect(qi.removeColumn).not.toHaveBeenCalledWith(
      "studentprogressquestions",
      expect.anything(),
      expect.anything()
    );
  });
});
