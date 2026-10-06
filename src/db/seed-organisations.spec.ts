/**
 * The local development seeds put every school and piece of content in an
 * organisation, because the owner columns are required. This drives their shared
 * helper (scripts/lib/seed-organisations.js) against a recording stand-in for a
 * mysql2 connection; the seeds themselves are run for real against a fresh
 * database (see the change description).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ORGANISATIONS, COUNTRY, ensureOrganisation, fillAndVerifyOwners } = require("../../scripts/lib/seed-organisations");

type Row = Record<string, unknown>;

/** Just enough of `conn.execute` for the statements the helper sends. */
const fakeConn = (state: { organisations?: Row[]; links?: Row[]; tables?: Record<string, Row[]> } = {}) => {
  const organisations = [...(state.organisations ?? [])];
  const links = [...(state.links ?? [])];
  const tables = state.tables ?? {};
  const sent: string[] = [];
  const execute = jest.fn(async (sql: string, params: unknown[] = []): Promise<[unknown, unknown]> => {
    sent.push(sql.replace(/\s+/g, " ").trim());
    if (/^INSERT IGNORE INTO countries/.test(sql)) return [{}, undefined];
    if (/^SELECT organisationid, isdeleted FROM organisations WHERE organisationcode/.test(sql)) {
      return [organisations.filter((o) => o.organisationcode === params[0]).map((o) => ({ organisationid: o.organisationid, isdeleted: o.isdeleted ?? 0 })), undefined];
    }
    if (/^INSERT INTO organisations/.test(sql)) {
      const [organisationid, , organisationcode] = params;
      organisations.push({ organisationid, organisationcode });
      return [{}, undefined];
    }
    if (/^SELECT 1 FROM organisationcountry/.test(sql)) {
      return [links.filter((l) => l.organisationid === params[0] && l.countryid === params[1]), undefined];
    }
    if (/^INSERT INTO organisationcountry/.test(sql)) {
      links.push({ organisationcountryid: params[0], organisationid: params[1], countryid: params[2] });
      return [{}, undefined];
    }
    const update = /^UPDATE `(\w+)` SET `(\w+)` = \? WHERE `(\w+)` = \? AND `\w+` IS NULL/.exec(sql);
    if (update) {
      const [, table, column, key] = update;
      for (const r of tables[table] ?? []) if (r[key] === params[1] && r[column] == null) r[column] = params[0];
      return [{}, undefined];
    }
    const count = /^SELECT COUNT\(\*\) AS n FROM `(\w+)` WHERE `(\w+)` IN \(.*\) AND `(\w+)` IS NOT NULL/.exec(sql);
    if (count) {
      const [, table, key, column] = count;
      return [[{ n: (tables[table] ?? []).filter((r) => params.includes(r[key]) && r[column] != null).length }], undefined];
    }
    throw new Error(`unexpected statement: ${sql}`);
  });
  return { conn: { execute }, organisations, links, sent };
};

describe("the two seed organisations", () => {
  it("are the ones the local backfill mapping names: edtech4good and miv, each linked to Cambodia, with their own presets and themes", () => {
    expect(ORGANISATIONS.edtech4good).toMatchObject({ code: "edtech4good", name: "EdTech for Good", shortname: "EG", preset: "schoolnetwork", uitheme: "kids" });
    expect(ORGANISATIONS.miv).toMatchObject({ code: "miv", name: "Mekong Inclusive Ventures", shortname: "MIV", preset: "company", uitheme: "corporate" });
    expect(COUNTRY.name).toBe("Cambodia");
  });
});

describe("ensureOrganisation", () => {
  it("creates the organisation with its fixed id and links it to Cambodia when the code is not there", async () => {
    const f = fakeConn();
    const id = await ensureOrganisation(f.conn, "miv");
    expect(id).toBe(ORGANISATIONS.miv.id);
    expect(f.organisations).toEqual([{ organisationid: ORGANISATIONS.miv.id, organisationcode: "miv" }]);
    expect(f.links).toEqual([{ organisationcountryid: ORGANISATIONS.miv.linkid, organisationid: ORGANISATIONS.miv.id, countryid: COUNTRY.id }]);
  });

  it("reuses an organisation that already has the code, whatever its id (the backfill gives its own), and adds nothing", async () => {
    const f = fakeConn({
      organisations: [{ organisationid: "id-from-the-backfill", organisationcode: "edtech4good" }],
      links: [{ organisationid: "id-from-the-backfill", countryid: COUNTRY.id }],
    });
    expect(await ensureOrganisation(f.conn, "edtech4good")).toBe("id-from-the-backfill");
    expect(f.sent.filter((s) => /^INSERT INTO/.test(s))).toEqual([]);
  });

  it("links an existing organisation that lacks the country link, and a second call changes nothing", async () => {
    const f = fakeConn({ organisations: [{ organisationid: "o1", organisationcode: "miv" }] });
    await ensureOrganisation(f.conn, "miv");
    expect(f.links).toHaveLength(1);
    await ensureOrganisation(f.conn, "miv");
    expect(f.links).toHaveLength(1);
    expect(f.organisations).toHaveLength(1);
  });

  it("refuses a code whose organisation is soft-deleted: codes are never reissued, so it is neither reused nor replaced, and nothing is written", async () => {
    const f = fakeConn({ organisations: [{ organisationid: "gone", organisationcode: "miv", isdeleted: 1 }] });
    await expect(ensureOrganisation(f.conn, "miv")).rejects.toThrow('The organisation with code "miv" has been deleted');
    expect(f.sent.filter((s) => /^INSERT INTO (organisations|organisationcountry)/.test(s))).toEqual([]);
    expect(f.links).toEqual([]);
  });

  it("refuses a code that is not a seed organisation", async () => {
    await expect(ensureOrganisation(fakeConn().conn, "other")).rejects.toThrow("Unknown seed organisation: other");
  });
});

describe("fillAndVerifyOwners", () => {
  const expected = (ids: string[]) => [{ table: "subjects", key: "subjectid", ids, column: "organisationid", value: "org-seed" }];

  it("fills an owner that is still NULL on the seed's own rows", async () => {
    const rows: Row[] = [{ subjectid: "a", organisationid: null }];
    await fillAndVerifyOwners(fakeConn({ tables: { subjects: rows } }).conn, expected(["a"]));
    expect(rows[0].organisationid).toBe("org-seed");
  });

  it("never overwrites an owner a row already has", async () => {
    const rows: Row[] = [{ subjectid: "a", organisationid: "someone-else" }];
    await fillAndVerifyOwners(fakeConn({ tables: { subjects: rows } }).conn, expected(["a"]));
    expect(rows[0].organisationid).toBe("someone-else");
  });

  it("throws, naming the table, when a row the seed meant to write is missing (INSERT IGNORE skipped it)", async () => {
    const rows: Row[] = [{ subjectid: "a", organisationid: "x" }];
    await expect(fillAndVerifyOwners(fakeConn({ tables: { subjects: rows } }).conn, expected(["a", "b"]))).rejects.toThrow(
      "Seed check failed: subjects should hold 2 seeded row(s) with organisationid set, found 1.",
    );
  });
});
