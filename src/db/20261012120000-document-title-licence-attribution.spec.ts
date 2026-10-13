import { DataTypes } from "sequelize";

/**
 * C-ML1: the title, licence and attribution of a document. Drives up() and down() against a stand-in QueryInterface
 * that holds the table's columns and the rows the reports and the down() guard read: it proves what the migration asks
 * MySQL for, in what order, and what it refuses. That a migrated database equals a fresh one was run on real MySQL
 * (schema-drift); see the change description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261012120000-document-title-licence-attribution");

interface Opts {
  has?: Array<"documenttitle" | "documentlicence" | "documentattribution">;
  perType?: Array<[number, number]>;
  notVideoLearnings?: number;
  oldRuleFailures?: number;
  titled?: string[];
  licenced?: string[];
  attributed?: string[];
}

const make = (opts: Opts = {}) => {
  const columns = new Set<string>(["documentid", "documentname", "documenttypeid", ...(opts.has ?? [])]);
  const added: Array<{ column: string; definition: { type: unknown; allowNull?: boolean; defaultValue?: unknown } }> = [];
  const removed: string[] = [];
  const statements: string[] = [];
  const calls: string[] = [];
  const ids = (list: string[] | undefined, sql: string) => {
    const limit = /LIMIT (\d+)$/.exec(sql);
    const sorted = [...(list ?? [])].sort();
    return (limit ? sorted.slice(0, Number(limit[1])) : sorted).map((id) => ({ id }));
  };
  const query = jest.fn(async (sql: string) => {
    statements.push(sql);
    if (/GROUP BY documenttypeid/.test(sql)) {
      calls.push("report");
      return (opts.perType ?? []).map(([t, n]) => ({ t, n }));
    }
    if (/JOIN `documents` d/.test(sql)) return [{ n: opts.notVideoLearnings ?? 0 }];
    if (/NOT REGEXP/.test(sql)) return [{ n: opts.oldRuleFailures ?? 0 }];
    const guard = /^SELECT (COUNT\(\*\) AS n|`documentid` AS id) FROM `documents` WHERE `(documenttitle|documentlicence|documentattribution)`/.exec(sql);
    if (guard) {
      const list = guard[2] === "documenttitle" ? opts.titled : guard[2] === "documentlicence" ? opts.licenced : opts.attributed;
      return guard[1].startsWith("COUNT") ? [{ n: (list ?? []).length }] : ids(list, sql);
    }
    return [];
  });
  const tx = { id: "tx" };
  const queryInterface = {
    sequelize: { query, transaction: async (fn: (t: unknown) => Promise<void>) => fn(tx) },
    describeTable: jest.fn(async () => Object.fromEntries([...columns].map((c) => [c, {}]))),
    addColumn: jest.fn(async (_table: string, column: string, definition: never) => {
      calls.push(`add ${column}`);
      columns.add(column);
      added.push({ column, definition });
    }),
    removeColumn: jest.fn(async (_table: string, column: string) => {
      calls.push(`remove ${column}`);
      columns.delete(column);
      removed.push(column);
    }),
  };
  const writes = () => statements.filter((s) => /^\s*(UPDATE|INSERT|DELETE|ALTER)/i.test(s));
  return { queryInterface: queryInterface as never, columns, added, removed, statements, calls, writes };
};

const logged = () => (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("C-ML1 up()", () => {
  it("adds documenttitle as VARCHAR(255) that may be NULL", async () => {
    const fake = make();
    await migration.up(fake.queryInterface);
    const title = fake.added.find((a) => a.column === "documenttitle")!;
    expect(String(title.definition.type)).toBe("VARCHAR(255)");
    expect(title.definition.allowNull).toBe(true);
    expect(title.definition.defaultValue).toBeUndefined();
  });

  it("adds documentlicence as VARCHAR(64) NOT NULL DEFAULT 'unspecified' (every existing row gets the default from the ALTER alone)", async () => {
    const fake = make();
    await migration.up(fake.queryInterface);
    const licence = fake.added.find((a) => a.column === "documentlicence")!;
    expect(String(licence.definition.type)).toBe("VARCHAR(64)");
    expect(licence.definition.allowNull).toBe(false);
    expect(licence.definition.defaultValue).toBe("unspecified");
  });

  it("adds documentattribution as a JSON column that may be NULL, and exactly these three columns", async () => {
    const fake = make();
    await migration.up(fake.queryInterface);
    const attribution = fake.added.find((a) => a.column === "documentattribution")!;
    expect(attribution.definition.type).toBe(DataTypes.JSON);
    expect(attribution.definition.allowNull).toBe(true);
    expect(fake.added.map((a) => a.column)).toEqual(["documenttitle", "documentlicence", "documentattribution"]);
  });

  it("writes no data: no UPDATE, INSERT, DELETE or hand-written ALTER", async () => {
    const fake = make({ perType: [[1, 2]], notVideoLearnings: 3, oldRuleFailures: 9 });
    await migration.up(fake.queryInterface);
    expect(fake.writes()).toEqual([]);
  });

  it("is idempotent: with all three columns there a second run adds nothing", async () => {
    const fake = make({ has: ["documenttitle", "documentlicence", "documentattribution"] });
    await migration.up(fake.queryInterface);
    expect(fake.added).toEqual([]);
  });

  it("finishes a run that stopped halfway: only the missing columns are added", async () => {
    const fake = make({ has: ["documenttitle"] });
    await migration.up(fake.queryInterface);
    expect(fake.added.map((a) => a.column)).toEqual(["documentlicence", "documentattribution"]);
  });

  it("prints the three counts, before any column is added", async () => {
    const fake = make({ perType: [[1, 4], [2, 7], [6, 1]], notVideoLearnings: 2, oldRuleFailures: 5 });
    await migration.up(fake.queryInterface);
    expect(logged()).toEqual([
      "C-ML1 documents per documenttypeid: 1=4, 2=7, 6=1",
      "C-ML1 learnings on a document that is not a video: 2",
      "C-ML1 documents whose name fails the old upload name rule (letters, digits, _, at most 25, then an extension): 5",
    ]);
    expect(fake.calls.indexOf("report")).toBeLessThan(fake.calls.indexOf("add documenttitle"));
  });

  it("an empty table prints none", async () => {
    await migration.up(make().queryInterface);
    expect(logged()[0]).toBe("C-ML1 documents per documenttypeid: none");
  });
});

describe("C-ML1 down()", () => {
  const upgraded = (opts: Opts = {}) => make({ has: ["documenttitle", "documentlicence", "documentattribution"], ...opts });

  it("with nothing to lose: drops the three columns", async () => {
    const fake = upgraded();
    await migration.down(fake.queryInterface);
    expect([...fake.removed].sort()).toEqual(["documentattribution", "documentlicence", "documenttitle"]);
  });

  it.each([
    ["a title", { titled: ["doc-z", "doc-a"] }, "documents.documenttitle holds a title: 2 document(s) (all 2): doc-a, doc-z"],
    ["a licence other than unspecified", { licenced: ["doc-l"] }, "documents.documentlicence holds a licence other than 'unspecified': 1 document(s) (all 1): doc-l"],
    ["an attribution", { attributed: ["doc-b"] }, "documents.documentattribution holds an attribution: 1 document(s) (all 1): doc-b"],
  ] as Array<[string, Opts, string]>)("refuses, naming the ids, when a document holds %s; drops nothing", async (_n, opts, line) => {
    const fake = upgraded(opts);
    const err = await migration.down(fake.queryInterface).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("refused");
    expect(err.message).toContain(line);
    expect(fake.removed).toEqual([]);
  });

  it("names every reason in ONE refusal", async () => {
    const fake = upgraded({ titled: ["t"], licenced: ["l"], attributed: ["a"] });
    const err = await migration.down(fake.queryInterface).catch((e: Error) => e);
    expect(err.message.split("\n").filter((l: string) => / document\(s\) \(/.test(l))).toHaveLength(3);
    expect(fake.removed).toEqual([]);
  });

  it("lists at most 50 ids of a kind but counts them all", async () => {
    const many = Array.from({ length: 52 }, (_, i) => `doc-${String(i).padStart(2, "0")}`);
    const err = await migration.down(upgraded({ titled: many }).queryInterface).catch((e: Error) => e);
    expect(err.message).toContain("52 document(s) (first 50 of 52)");
    expect(err.message).not.toContain("doc-50");
  });

  it("is a no-op when the columns are already gone", async () => {
    const fake = make();
    await migration.down(fake.queryInterface);
    expect(fake.removed).toEqual([]);
  });

  it("round-trips: up, down, up", async () => {
    const fake = make();
    await migration.up(fake.queryInterface);
    await migration.down(fake.queryInterface);
    expect([...fake.columns].sort()).toEqual(["documentid", "documentname", "documenttypeid"]);
    await migration.up(fake.queryInterface);
    expect([...fake.columns].sort()).toEqual(["documentattribution", "documentid", "documentlicence", "documentname", "documenttitle", "documenttypeid"]);
  });
});
