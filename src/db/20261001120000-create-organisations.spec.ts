/**
 * C1 of the multi-organisation model: `organisations` + `organisationcountry`.
 * Like 20260929120000-add-grading-protocol-columns-central.spec.ts, this drives
 * up()/down() against a mocked QueryInterface - it proves what the migration
 * ASKS MySQL for (columns, types, nullability, indexes, foreign keys,
 * collation), not what MySQL then does. The real-database proof (the tables
 * created, the indexes and FKs read back from information_schema, up/down/up)
 * is in the PR description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261001120000-create-organisations");

type MockQI = {
  showAllTables: jest.Mock;
  showIndex: jest.Mock;
  createTable: jest.Mock;
  addIndex: jest.Mock;
  dropTable: jest.Mock;
  sequelize: { query: jest.Mock; transaction: jest.Mock; Sequelize: { fn: jest.Mock } };
};

const TX = { id: "the-transaction" };

const makeQueryInterface = (collation = "utf8mb4_unicode_ci"): MockQI => ({
  showAllTables: jest.fn().mockResolvedValue(["countries", "schools"]),
  showIndex: jest.fn().mockResolvedValue([{ name: "PRIMARY" }]),
  createTable: jest.fn().mockResolvedValue(undefined),
  addIndex: jest.fn().mockResolvedValue(undefined),
  dropTable: jest.fn().mockResolvedValue(undefined),
  sequelize: {
    // The only SELECT is tableOptionsMatchingColumn's INFORMATION_SCHEMA read.
    query: jest.fn((sql: string) =>
      /INFORMATION_SCHEMA/.test(sql)
        ? Promise.resolve([[{ cs: "utf8mb4", coll: collation }]])
        : Promise.resolve([[], undefined]),
    ),
    transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)),
    Sequelize: { fn: jest.fn((name: string) => ({ fn: name })) },
  },
});

const tableCall = (qi: MockQI, name: string) =>
  qi.createTable.mock.calls.find((c) => c[0] === name);

describe("20261001120000-create-organisations up()", () => {
  it("creates `organisations` with the columns, types, nullability and defaults of the design note", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);

    const [, cols] = tableCall(qi, "organisations")!;
    expect(Object.keys(cols)).toEqual([
      "organisationid",
      "organisationname",
      "organisationcode",
      "organisationshortname",
      "organisationpreset",
      "organisationstatus",
      "uitheme",
      "brandingconfig",
      "settingsconfig",
      "isdeleted",
      "created_at",
      "created_by",
      "updated_at",
      "updated_by",
      "deleted_at",
      "deleted_by",
    ]);
    const type = (c: string) => String(cols[c].type);
    expect(cols.organisationid).toMatchObject({ allowNull: false, primaryKey: true });
    expect(type("organisationid")).toBe("VARCHAR(36)");
    expect(type("organisationname")).toBe("VARCHAR(250)");
    expect(type("organisationcode")).toBe("VARCHAR(16)");
    expect(type("organisationshortname")).toBe("VARCHAR(3)");
    expect(type("organisationpreset")).toBe("VARCHAR(16)");
    for (const c of ["organisationname", "organisationcode", "organisationshortname", "organisationpreset"]) {
      expect(cols[c].allowNull).toBe(false);
    }
    expect(cols.organisationstatus).toMatchObject({ allowNull: false, defaultValue: true });
    expect(type("organisationstatus")).toBe("BOOLEAN");
    expect(cols.uitheme).toMatchObject({ allowNull: false, defaultValue: "kids" });
    expect(type("uitheme")).toBe("VARCHAR(16)");
    expect(cols.brandingconfig).toMatchObject({ allowNull: true, defaultValue: null });
    expect(cols.settingsconfig).toMatchObject({ allowNull: true, defaultValue: null });
    expect(type("brandingconfig")).toBe("JSONTYPE");
    expect(type("settingsconfig")).toBe("JSONTYPE");
    expect(cols.isdeleted).toMatchObject({ allowNull: false, defaultValue: false });
    expect(cols.created_at.type).toBe("TIMESTAMP");
    expect(cols.deleted_at).toMatchObject({ type: "TIMESTAMP", allowNull: true });
    for (const c of ["created_by", "updated_by", "deleted_by"]) {
      expect(type(c)).toBe("VARCHAR(36)");
      expect(cols[c].allowNull).toBe(true);
    }
  });

  it("creates `organisationcountry` with real foreign keys on both id columns and no audit columns", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);

    const [, cols] = tableCall(qi, "organisationcountry")!;
    expect(Object.keys(cols)).toEqual(["organisationcountryid", "organisationid", "countryid"]);
    expect(cols.organisationcountryid).toMatchObject({ allowNull: false, primaryKey: true });
    expect(cols.organisationid).toMatchObject({
      allowNull: false,
      references: { model: "organisations", key: "organisationid" },
    });
    expect(cols.countryid).toMatchObject({
      allowNull: false,
      references: { model: "countries", key: "countryid" },
    });
  });

  it("creates organisations before the link table that references it", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.createTable.mock.calls.map((c) => c[0])).toEqual([
      "organisations",
      "organisationcountry",
    ]);
  });

  it("adds a unique index on organisationcode that covers ALL rows, deleted ones included", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.addIndex).toHaveBeenCalledWith(
      "organisations",
      ["organisationcode"],
      expect.objectContaining({ unique: true, transaction: TX }),
    );
  });

  it("makes organisationname unique among LIVE rows only (a deleted row's name is NULL in the index)", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const sql: string = qi.sequelize.query.mock.calls
      .map((c) => c[0] as string)
      .find((s) => /CREATE UNIQUE INDEX/.test(s))!;
    expect(sql).toMatch(/ON `organisations`/);
    expect(sql).toMatch(/CASE WHEN `isdeleted` = 0 THEN `organisationname` END/);
    // It must NOT also be a plain unique index on the column, which would stop
    // a deleted organisation's name being reused.
    expect(qi.addIndex).not.toHaveBeenCalledWith(
      "organisations",
      ["organisationname"],
      expect.anything(),
    );
  });

  it("adds the unique (organisationid, countryid) index on the link table, and one leading with countryid for its FK", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.addIndex).toHaveBeenCalledWith(
      "organisationcountry",
      ["organisationid", "countryid"],
      expect.objectContaining({ unique: true }),
    );
    expect(qi.addIndex).toHaveBeenCalledWith(
      "organisationcountry",
      ["countryid"],
      expect.objectContaining({ name: "organisationcountry_countryid" }),
    );
  });

  it("takes the charset/collation from the REAL countries.countryid column, not from a constant", async () => {
    // The countries MODEL says utf8mb4_0900_ai_ci; the TABLE is
    // utf8mb4_unicode_ci. Whatever the database reports must flow through.
    const qi = makeQueryInterface("utf8mb4_0900_ai_ci");
    await migration.up(qi);

    const reads = qi.sequelize.query.mock.calls.filter((c) => /INFORMATION_SCHEMA/.test(c[0]));
    expect(reads[0][1].replacements).toEqual(["countries", "countryid"]);
    for (const name of ["organisations", "organisationcountry"]) {
      expect(tableCall(qi, name)![2]).toMatchObject({
        charset: "utf8mb4",
        collate: "utf8mb4_0900_ai_ci",
        transaction: TX,
      });
    }
  });

  it("runs inside a transaction and hands it to every DDL call", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    for (const c of qi.createTable.mock.calls) expect(c[2].transaction).toBe(TX);
    for (const c of qi.addIndex.mock.calls) expect(c[2].transaction).toBe(TX);
  });

  it("does nothing on a re-run when the tables and every index already exist (idempotent)", async () => {
    const qi = makeQueryInterface();
    qi.showAllTables.mockResolvedValue(["countries", "organisations", "organisationcountry"]);
    qi.showIndex.mockImplementation((table: string) =>
      Promise.resolve(
        table === "organisations"
          ? [
              { name: "PRIMARY" },
              { name: "organisations_organisationcode_unique" },
              { name: "organisations_organisationname_live_unique" },
            ]
          : [
              { name: "PRIMARY" },
              { name: "organisationcountry_organisation_country_unique" },
              { name: "organisationcountry_countryid" },
            ],
      ),
    );
    await migration.up(qi);

    expect(qi.createTable).not.toHaveBeenCalled();
    expect(qi.addIndex).not.toHaveBeenCalled();
    expect(
      qi.sequelize.query.mock.calls.some((c) => /CREATE UNIQUE INDEX/.test(c[0])),
    ).toBe(false);
  });

  it("completes a half-applied run: tables exist but the live-name index is missing", async () => {
    const qi = makeQueryInterface();
    qi.showAllTables.mockResolvedValue(["countries", "organisations", "organisationcountry"]);
    qi.showIndex.mockImplementation((table: string) =>
      Promise.resolve(
        table === "organisations"
          ? [{ name: "PRIMARY" }, { name: "organisations_organisationcode_unique" }]
          : [
              { name: "organisationcountry_organisation_country_unique" },
              { name: "organisationcountry_countryid" },
            ],
      ),
    );
    await migration.up(qi);

    expect(qi.createTable).not.toHaveBeenCalled();
    expect(qi.addIndex).not.toHaveBeenCalled();
    expect(
      qi.sequelize.query.mock.calls.filter((c) => /CREATE UNIQUE INDEX/.test(c[0])),
    ).toHaveLength(1);
  });
});

describe("20261001120000-create-organisations down()", () => {
  it("drops the link table (it holds the foreign keys) before organisations, in a transaction", async () => {
    const qi = makeQueryInterface();
    qi.showAllTables.mockResolvedValue(["countries", "organisations", "organisationcountry"]);
    await migration.down(qi);

    expect(qi.dropTable.mock.calls.map((c) => c[0])).toEqual([
      "organisationcountry",
      "organisations",
    ]);
    for (const c of qi.dropTable.mock.calls) expect(c[1]).toEqual({ transaction: TX });
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
  });

  it("never touches a table that is not there, so a half-applied up() can be undone", async () => {
    const qi = makeQueryInterface();
    qi.showAllTables.mockResolvedValue(["countries", "organisations"]);
    await migration.down(qi);
    expect(qi.dropTable.mock.calls.map((c) => c[0])).toEqual(["organisations"]);
  });

  it("drops nothing else", async () => {
    const qi = makeQueryInterface();
    qi.showAllTables.mockResolvedValue(["countries", "schools", "organisations", "organisationcountry"]);
    await migration.down(qi);
    expect(qi.dropTable).toHaveBeenCalledTimes(2);
  });
});
