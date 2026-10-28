/**
 * A4 step 1: the table `curriculumpublications`. Like 20261009120100-create-lessonlearningdocuments.spec.ts it drives
 * up()/down() against a mocked QueryInterface: it proves what the migration ASKS MySQL for (columns, nullability,
 * defaults, keys and their names and delete behaviour, indexes, collation), not what MySQL then does. The real-database
 * proof (migrate, undo, migrate again, SHOW CREATE TABLE) is in the change description.
 */
export {};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261027120000-curriculum-publications");

const TX = { id: "the-transaction" };
const TABLE = "curriculumpublications";

const make = (
  opts: { tables?: string[]; indexes?: string[]; keys?: Array<{ name: string; col: string; ptable: string; pcol: string }>; rows?: number; collations?: Record<string, string> } = {},
) => {
  const tables = opts.tables ?? ["curriculums", "organisations", "lmsusers"];
  return {
    showAllTables: jest.fn().mockResolvedValue(tables),
    showIndex: jest.fn().mockResolvedValue((opts.indexes ?? ["PRIMARY"]).map((name) => ({ name }))),
    createTable: jest.fn().mockResolvedValue(undefined),
    addIndex: jest.fn().mockResolvedValue(undefined),
    addConstraint: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined),
    sequelize: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: jest.fn((sql: string, o?: any) =>
        /KEY_COLUMN_USAGE/.test(sql)
          ? Promise.resolve(opts.keys ?? [])
          : /INFORMATION_SCHEMA/.test(sql)
            ? Promise.resolve([[{ cs: "utf8mb4", coll: opts.collations?.[o?.replacements?.[0]] ?? "utf8mb4_unicode_ci" }]])
            : /^SELECT COUNT/.test(sql)
              ? Promise.resolve([{ n: opts.rows ?? 0 }])
              : Promise.resolve([[], undefined]),
      ),
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)),
    },
  };
};

describe("A4 step 1 up()", () => {
  it("creates curriculumpublications with exactly the columns, types, nullability and defaults of the design", async () => {
    const qi = make();
    await migration.up(qi);
    expect(qi.createTable).toHaveBeenCalledTimes(1);
    const [name, cols] = qi.createTable.mock.calls[0];
    expect(name).toBe(TABLE);
    expect(Object.keys(cols)).toEqual([
      "publicationid", "curriculumid", "organisationid", "publishedat", "publishedby", "status", "payload", "summary", "payloadhash", "createdAt", "updatedAt",
    ]);
    expect(String(cols.publicationid.type)).toBe("VARCHAR(36)");
    expect(cols.publicationid.primaryKey).toBe(true);
    for (const c of ["curriculumid", "organisationid", "publishedby"]) {
      expect(String(cols[c].type)).toMatch(/^VARCHAR\(36\) CHARACTER SET utf8mb4 COLLATE \w+$/);
      expect(cols[c].allowNull).toBe(false);
    }
    // milliseconds: DATE(3) is DATETIME(3) in MySQL
    expect(String(cols.publishedat.type)).toBe("DATETIME");
    expect(cols.publishedat.type.options).toEqual({ length: 3 });
    expect(cols.publishedat.allowNull).toBe(false);
    expect(String(cols.status.type)).toBe("ENUM");
    expect(cols.status.type.values).toEqual(["published", "withdrawn"]);
    expect(cols.status).toMatchObject({ allowNull: false, defaultValue: "published" });
    expect(String(cols.payload.type)).toBe("JSONTYPE");
    expect(cols.payload.allowNull).toBe(true);
    expect(String(cols.summary.type)).toBe("JSONTYPE");
    expect(cols.summary.allowNull).toBe(false);
    expect(String(cols.payloadhash.type)).toBe("CHAR(64)");
    expect(cols.payloadhash.allowNull).toBe(false);
    for (const c of ["createdAt", "updatedAt"]) {
      // DATE is DATETIME in MySQL
      expect(String(cols[c].type)).toBe("DATE");
      expect(cols[c].allowNull).toBe(false);
    }
  });

  it("adds the three foreign keys by name, ON DELETE RESTRICT ON UPDATE CASCADE, to the right parents", async () => {
    const qi = make();
    await migration.up(qi);
    expect(qi.addConstraint.mock.calls.map((c) => [c[0], c[1].name, c[1].fields, c[1].references, c[1].onDelete, c[1].onUpdate, c[1].type])).toEqual([
      [TABLE, "curriculumpublications_curriculumid_fk", ["curriculumid"], { table: "curriculums", field: "curriculumid" }, "RESTRICT", "CASCADE", "foreign key"],
      [TABLE, "curriculumpublications_organisationid_fk", ["organisationid"], { table: "organisations", field: "organisationid" }, "RESTRICT", "CASCADE", "foreign key"],
      [TABLE, "curriculumpublications_publishedby_fk", ["publishedby"], { table: "lmsusers", field: "lmsuserid" }, "RESTRICT", "CASCADE", "foreign key"],
    ]);
    for (const c of qi.addConstraint.mock.calls) expect(c[1].transaction).toBe(TX);
  });

  it("adds the indexes by the names the model declares: (curriculumid, publishedat), organisationid, publishedby", async () => {
    const qi = make();
    await migration.up(qi);
    expect(qi.addIndex.mock.calls.map((c) => [c[0], c[1], c[2].name, Boolean(c[2].unique)])).toEqual([
      [TABLE, ["curriculumid", "publishedat"], "curriculumpublications_curriculum_publishedat", false],
      [TABLE, ["organisationid"], "curriculumpublications_organisationid", false],
      [TABLE, ["publishedby"], "curriculumpublications_publishedby", false],
    ]);
  });

  it("reads each referenced column's collation from its own table, and names the table's from curriculums.curriculumid", async () => {
    const qi = make({ collations: { curriculums: "utf8mb4_unicode_ci", organisations: "utf8mb4_0900_ai_ci", lmsusers: "utf8mb4_bin" } });
    await migration.up(qi);
    const reads = qi.sequelize.query.mock.calls.filter((c) => /INFORMATION_SCHEMA/.test(c[0]) && !/KEY_COLUMN_USAGE/.test(c[0])).map((c) => c[1].replacements);
    expect(reads).toEqual([["curriculums", "curriculumid"], ["organisations", "organisationid"], ["lmsusers", "lmsuserid"]]);
    const [, cols, options] = qi.createTable.mock.calls[0];
    expect(options).toEqual({ transaction: TX, charset: "utf8mb4", collate: "utf8mb4_unicode_ci" });
    expect(cols.curriculumid.type).toBe("VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    expect(cols.organisationid.type).toBe("VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
    expect(cols.publishedby.type).toBe("VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
  });

  it("refuses a charset or collation name that is not a plain identifier", async () => {
    const qi = make({ collations: { lmsusers: "x; DROP TABLE lmsusers" } });
    await expect(migration.up(qi)).rejects.toThrow("Unexpected charset or collation");
    expect(qi.createTable).not.toHaveBeenCalled();
  });

  it("is idempotent: with the table, the indexes and the keys there, nothing is sent", async () => {
    const qi = make({
      tables: [TABLE],
      indexes: ["PRIMARY", "curriculumpublications_curriculum_publishedat", "curriculumpublications_organisationid", "curriculumpublications_publishedby"],
      keys: [
        { name: "curriculumpublications_curriculumid_fk", col: "curriculumid", ptable: "curriculums", pcol: "curriculumid" },
        { name: "curriculumpublications_organisationid_fk", col: "organisationid", ptable: "organisations", pcol: "organisationid" },
        { name: "curriculumpublications_publishedby_fk", col: "publishedby", ptable: "lmsusers", pcol: "lmsuserid" },
      ],
    });
    await migration.up(qi);
    expect(qi.createTable).not.toHaveBeenCalled();
    expect(qi.addIndex).not.toHaveBeenCalled();
    expect(qi.addConstraint).not.toHaveBeenCalled();
  });

  it("finishes a run that stopped after the table: only what is missing is added, and a key that exists under another name is not doubled", async () => {
    const qi = make({
      tables: [TABLE],
      indexes: ["PRIMARY", "curriculumpublications_curriculum_publishedat"],
      keys: [{ name: "some_other_name", col: "curriculumid", ptable: "curriculums", pcol: "curriculumid" }],
    });
    await migration.up(qi);
    expect(qi.createTable).not.toHaveBeenCalled();
    expect(qi.addIndex.mock.calls.map((c) => c[2].name)).toEqual(["curriculumpublications_organisationid", "curriculumpublications_publishedby"]);
    expect(qi.addConstraint.mock.calls.map((c) => c[1].name)).toEqual(["curriculumpublications_organisationid_fk", "curriculumpublications_publishedby_fk"]);
  });
});

describe("A4 step 1 down()", () => {
  it("drops the table when it is empty", async () => {
    const qi = make({ tables: [TABLE] });
    await migration.down(qi);
    expect(qi.dropTable).toHaveBeenCalledWith(TABLE, { transaction: TX });
  });

  it("refuses when the table holds publications, saying how many, and drops nothing", async () => {
    const qi = make({ tables: [TABLE], rows: 3 });
    const err = await migration.down(qi).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("down() refused");
    expect(err.message).toContain("holds 3 publication(s)");
    expect(qi.dropTable).not.toHaveBeenCalled();
  });

  it("is a no-op when the table is not there", async () => {
    const qi = make({ tables: ["curriculums"] });
    await migration.down(qi);
    expect(qi.dropTable).not.toHaveBeenCalled();
  });
});
