/**
 * C-LI2: the link table `lessonlearningdocuments`. Like 20261001120000-create-organisations.spec.ts it drives up()/down()
 * against a mocked QueryInterface: it proves what the migration ASKS MySQL for (columns, nullability, defaults, foreign
 * keys and their delete behaviour, indexes, collation), not what MySQL then does. The real-database proof is in the
 * change description.
 */
export {};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261009120100-create-lessonlearningdocuments");

const TX = { id: "the-transaction" };

const make = (opts: { tables?: string[]; indexes?: string[]; rows?: number; collation?: string; documentCollation?: string } = {}) => {
  const tables = opts.tables ?? ["lessonlearnings", "documents"];
  return {
    showAllTables: jest.fn().mockResolvedValue(tables),
    showIndex: jest.fn().mockResolvedValue((opts.indexes ?? ["PRIMARY"]).map((name) => ({ name }))),
    createTable: jest.fn().mockResolvedValue(undefined),
    addIndex: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined),
    sequelize: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: jest.fn((sql: string, o?: any) =>
        /INFORMATION_SCHEMA/.test(sql)
          ? // each referenced column answers with its own collation: the items' ids and the documents' ids may differ
            Promise.resolve([[{ cs: "utf8mb4", coll: (o?.replacements?.[0] === "documents" ? opts.documentCollation : opts.collation) ?? "utf8mb4_unicode_ci" }]])
          : /^SELECT COUNT/.test(sql)
            ? Promise.resolve([{ n: opts.rows ?? 0 }])
            : Promise.resolve([[], undefined]),
      ),
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)),
    },
  };
};

describe("C-LI2 up()", () => {
  it("creates lessonlearningdocuments with exactly the columns, types, nullability and defaults of the design", async () => {
    const qi = make();
    await migration.up(qi);
    expect(qi.createTable).toHaveBeenCalledTimes(1);
    const [name, cols] = qi.createTable.mock.calls[0];
    expect(name).toBe("lessonlearningdocuments");
    expect(Object.keys(cols)).toEqual([
      "lessonlearningdocumentid",
      "lessonlearningid",
      "documentid",
      "lessonlearningdocumentrole",
      "lessonlearningdocumentorder",
    ]);
    expect(String(cols.lessonlearningdocumentid.type)).toBe("VARCHAR(36)");
    expect(String(cols.lessonlearningid.type)).toBe("VARCHAR(36)");
    expect(String(cols.documentid.type)).toMatch(/^VARCHAR\(36\) CHARACTER SET utf8mb4 COLLATE \w+$/);
    expect(cols.lessonlearningdocumentid.primaryKey).toBe(true);
    expect(String(cols.lessonlearningdocumentrole.type)).toBe("VARCHAR(16)");
    expect(cols.lessonlearningdocumentrole.allowNull).toBe(false);
    expect(String(cols.lessonlearningdocumentorder.type)).toBe("INTEGER");
    expect(cols.lessonlearningdocumentorder.allowNull).toBe(false);
    expect(cols.lessonlearningdocumentorder.defaultValue).toBe(0);
  });

  it("deletes a link row with its item (CASCADE) and refuses to delete a document a link row uses (RESTRICT)", async () => {
    const qi = make();
    await migration.up(qi);
    const cols = qi.createTable.mock.calls[0][1];
    expect(cols.lessonlearningid).toMatchObject({ allowNull: false, references: { model: "lessonlearnings", key: "lessonlearningid" }, onDelete: "CASCADE" });
    expect(cols.documentid).toMatchObject({ allowNull: false, references: { model: "documents", key: "documentid" }, onDelete: "RESTRICT" });
  });

  it("reads two different columns: the item id's collation from lessonlearnings, the document id's from documents", async () => {
    const qi = make();
    await migration.up(qi);
    const reads = qi.sequelize.query.mock.calls.filter((c) => /INFORMATION_SCHEMA/.test(c[0])).map((c) => c[1].replacements);
    expect(reads).toEqual([["lessonlearnings", "lessonlearningid"], ["documents", "documentid"]]);
  });

  it("names the table's charset and collation from lessonlearnings, and gives documentid the collation documents.documentid has", async () => {
    const qi = make({ collation: "utf8mb4_unicode_ci", documentCollation: "utf8mb4_0900_ai_ci" });
    await migration.up(qi);
    expect(qi.createTable.mock.calls[0][2]).toEqual({ transaction: TX, charset: "utf8mb4", collate: "utf8mb4_unicode_ci" });
    const cols = qi.createTable.mock.calls[0][1];
    expect(cols.documentid.type).toBe("VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
    // the item id has no collation of its own: it is the table's, which is the collation of lessonlearnings.lessonlearningid
    expect(String(cols.lessonlearningid.type)).toBe("VARCHAR(36)");
  });

  it("when both referenced columns agree, so do the table and the document id", async () => {
    const qi = make({ collation: "utf8mb4_0900_ai_ci", documentCollation: "utf8mb4_0900_ai_ci" });
    await migration.up(qi);
    expect(qi.createTable.mock.calls[0][2].collate).toBe("utf8mb4_0900_ai_ci");
    expect(qi.createTable.mock.calls[0][1].documentid.type).toBe("VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
  });

  it("refuses a charset or collation name that is not a plain identifier", async () => {
    const qi = make({ documentCollation: "x; DROP TABLE documents" });
    await expect(migration.up(qi)).rejects.toThrow("Unexpected charset or collation");
    expect(qi.createTable).not.toHaveBeenCalled();
  });

  it("adds the unique index on (lessonlearningid, documentid) and the index on documentid, by the names the model declares", async () => {
    const qi = make();
    await migration.up(qi);
    expect(qi.addIndex.mock.calls.map((c) => [c[0], c[1], c[2].name, Boolean(c[2].unique)])).toEqual([
      ["lessonlearningdocuments", ["lessonlearningid", "documentid"], "lessonlearningdocuments_item_document_unique", true],
      ["lessonlearningdocuments", ["documentid"], "lessonlearningdocuments_documentid", false],
    ]);
  });

  it("is idempotent: with the table and both indexes there, nothing is sent", async () => {
    const qi = make({
      tables: ["lessonlearnings", "documents", "lessonlearningdocuments"],
      indexes: ["PRIMARY", "lessonlearningdocuments_item_document_unique", "lessonlearningdocuments_documentid"],
    });
    await migration.up(qi);
    expect(qi.createTable).not.toHaveBeenCalled();
    expect(qi.addIndex).not.toHaveBeenCalled();
  });

  it("finishes a run that stopped after the table: only the missing index is added", async () => {
    const qi = make({ tables: ["lessonlearningdocuments"], indexes: ["PRIMARY", "lessonlearningdocuments_item_document_unique"] });
    await migration.up(qi);
    expect(qi.createTable).not.toHaveBeenCalled();
    expect(qi.addIndex.mock.calls.map((c) => c[2].name)).toEqual(["lessonlearningdocuments_documentid"]);
  });
});

describe("C-LI2 down()", () => {
  it("drops the table when it is empty", async () => {
    const qi = make({ tables: ["lessonlearningdocuments"] });
    await migration.down(qi);
    expect(qi.dropTable).toHaveBeenCalledWith("lessonlearningdocuments", { transaction: TX });
  });

  it("refuses when the table holds rows, saying how many, and drops nothing", async () => {
    const qi = make({ tables: ["lessonlearningdocuments"], rows: 2 });
    const err = await migration.down(qi).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("down() refused");
    expect(err.message).toContain("holds 2 row(s)");
    expect(qi.dropTable).not.toHaveBeenCalled();
  });

  it("is a no-op when the table is not there", async () => {
    const qi = make({ tables: ["lessonlearnings"] });
    await migration.down(qi);
    expect(qi.dropTable).not.toHaveBeenCalled();
  });
});
