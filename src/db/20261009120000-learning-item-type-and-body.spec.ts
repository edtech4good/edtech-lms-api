import { DataTypes } from "sequelize";
import { RequiredColumn } from "./required-columns";
import { makeRequiredColumnsQI } from "src/test-support/required-columns-qi";

/**
 * C-LI1: the type and body of a learning item, and a nullable `documentid`. Drives up() and down() against a stand-in
 * QueryInterface (src/test-support/required-columns-qi.ts, extended with the table's columns and the rows the reports
 * and the down() guard read): it proves what the migration asks MySQL for, in what order, and what it refuses. That a
 * migrated database equals a fresh one was run on real MySQL; see the change description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261009120000-learning-item-type-and-body");

const DOCUMENT: readonly RequiredColumn[] = [{ table: "lessonlearnings", column: "documentid", pk: "lessonlearningid" }];
const KEY = "lessonlearnings.documentid";

interface Opts {
  /** The columns the table has besides the ones every table has. */
  has?: Array<"lessonlearningtype" | "lessonlearningbody">;
  documentNullable?: boolean;
  /** Items holding a NULL document. */
  nullDocuments?: string[];
  /** Items whose type is not 'video'. */
  nonVideo?: string[];
  /** Items holding a body. */
  withBody?: string[];
  /** Order ties: [lessonid, order, how many learnings share it]. */
  ties?: Array<[string, number, number]>;
  /** Learnings on a document that is not a video. */
  notVideoDocuments?: number;
}

const make = (opts: Opts = {}) => {
  const base = makeRequiredColumnsQI(DOCUMENT, { [KEY]: { nullable: opts.documentNullable ?? false, nulls: opts.nullDocuments ?? [] } });
  const columns = new Set<string>(["lessonlearningid", "documentid", "lessonlearningorder", ...(opts.has ?? [])]);
  const added: Array<{ column: string; definition: { type: unknown; allowNull?: boolean; defaultValue?: unknown } }> = [];
  const removed: string[] = [];
  const calls: string[] = [];
  const ids = (list: string[] | undefined, sql: string) => {
    const limit = /LIMIT (\d+)$/.exec(sql);
    const sorted = [...(list ?? [])].sort();
    return (limit ? sorted.slice(0, Number(limit[1])) : sorted).map((id) => ({ id }));
  };
  const original = base.sequelize.query;
  base.sequelize.query = jest.fn(async (sql: string, o?: unknown) => {
    if (/GROUP BY lessonid, lessonlearningorder/.test(sql)) {
      calls.push("report");
      base.statements.push(sql);
      return (opts.ties ?? []).map(([lessonid, ord, n]) => ({ lessonid, ord, n }));
    }
    if (/JOIN documents d/.test(sql)) {
      base.statements.push(sql);
      return [{ n: opts.notVideoDocuments ?? 0 }];
    }
    const guard = /^SELECT (COUNT\(\*\) AS n|lessonlearningid AS id) FROM `lessonlearnings` WHERE `(lessonlearningtype|lessonlearningbody)`/.exec(sql);
    if (guard) {
      base.statements.push(sql);
      const list = guard[2] === "lessonlearningtype" ? opts.nonVideo : opts.withBody;
      return guard[1].startsWith("COUNT") ? [{ n: (list ?? []).length }] : ids(list, sql);
    }
    if (/^ALTER TABLE/.test(sql)) calls.push("alter");
    return original(sql, o as never);
  }) as never;
  const queryInterface = {
    sequelize: base.sequelize,
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
  return { ...base, queryInterface: queryInterface as never, columns, added, removed, calls, nullable: () => base.cols.get(KEY)!.nullable };
};

const logged = () => (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("C-LI1 up()", () => {
  it("adds lessonlearningtype as VARCHAR(16) NOT NULL DEFAULT 'video' (every existing row becomes a video item by the default alone)", async () => {
    const fake = make();
    await migration.up(fake.queryInterface);
    const type = fake.added.find((a) => a.column === "lessonlearningtype")!;
    expect(String(type.definition.type)).toBe("VARCHAR(16)");
    expect(type.definition.allowNull).toBe(false);
    expect(type.definition.defaultValue).toBe("video");
  });

  it("adds lessonlearningbody as a JSON column that may be NULL, with no default", async () => {
    const fake = make();
    await migration.up(fake.queryInterface);
    const body = fake.added.find((a) => a.column === "lessonlearningbody")!;
    expect(body.definition.type).toBe(DataTypes.JSON);
    expect(body.definition.allowNull).toBe(true);
    expect(body.definition.defaultValue).toBeUndefined();
  });

  it("makes documentid NULL-able with one MODIFY, and adds exactly the two columns", async () => {
    const fake = make();
    await migration.up(fake.queryInterface);
    expect(fake.added.map((a) => a.column)).toEqual(["lessonlearningtype", "lessonlearningbody"]);
    expect(fake.alters()).toHaveLength(1);
    expect(fake.alters()[0]).toMatch(/^ALTER TABLE `lessonlearnings` MODIFY COLUMN `documentid` varchar\(36\)/);
    expect(fake.alters()[0]).toMatch(/NULL DEFAULT NULL$/);
    expect(fake.nullable()).toBe(true);
  });

  it("writes no data: no UPDATE, INSERT or DELETE (the default alone makes the rows video items)", async () => {
    const fake = make({ ties: [["lesson-1", 1, 2]], notVideoDocuments: 3 });
    await migration.up(fake.queryInterface);
    expect(fake.writes()).toEqual([]);
  });

  it("is idempotent: with both columns there and documentid already NULL-able a second run sends nothing", async () => {
    const fake = make({ has: ["lessonlearningtype", "lessonlearningbody"], documentNullable: true });
    await migration.up(fake.queryInterface);
    expect(fake.added).toEqual([]);
    expect(fake.alters()).toEqual([]);
  });

  it("finishes a run that stopped halfway: only the missing column is added", async () => {
    const fake = make({ has: ["lessonlearningtype"] });
    await migration.up(fake.queryInterface);
    expect(fake.added.map((a) => a.column)).toEqual(["lessonlearningbody"]);
  });

  it("reports the lessons whose learnings share an order value, before any change, and does not renumber them", async () => {
    const fake = make({ ties: [["lesson-a", 2, 2], ["lesson-b", 1, 3]] });
    await migration.up(fake.queryInterface);
    const lines = logged();
    expect(lines).toContain("C-LI1 order ties: 2 lesson(s) hold learnings that share an order value (reported, not renumbered)");
    expect(lines).toContain("C-LI1 order tie: lesson lesson-a: order 2 is shared by 2 learnings");
    expect(lines).toContain("C-LI1 order tie: lesson lesson-b: order 1 is shared by 3 learnings");
    expect(fake.calls.indexOf("report")).toBeLessThan(fake.calls.indexOf("add lessonlearningtype"));
    expect(fake.statements.filter((s) => /lessonlearningorder\s*=/.test(s) && /^\s*UPDATE/i.test(s))).toEqual([]);
  });

  it("reports a clean table as no ties, and the count of learnings on a document that is not a video", async () => {
    const fake = make({ notVideoDocuments: 4 });
    await migration.up(fake.queryInterface);
    expect(logged()).toContain("C-LI1 order ties: 0 lesson(s) hold learnings that share an order value (reported, not renumbered)");
    expect(logged()).toContain("C-LI1 learnings on a document that is not a video: 4");
  });

  it("lists at most 50 tied lessons and says how many it left out", async () => {
    const ties = Array.from({ length: 53 }, (_, i): [string, number, number] => [`lesson-${String(i).padStart(2, "0")}`, 1, 2]);
    await migration.up(make({ ties }).queryInterface);
    expect(logged().filter((l) => l.startsWith("C-LI1 order tie: "))).toHaveLength(50);
    expect(logged()).toContain("C-LI1 order ties: 3 more not listed");
  });
});

describe("C-LI1 down()", () => {
  const upgraded = (opts: Opts = {}) => make({ has: ["lessonlearningtype", "lessonlearningbody"], documentNullable: true, ...opts });

  it("with nothing to lose: makes documentid NOT NULL again and drops the body, then the type", async () => {
    const fake = upgraded();
    await migration.down(fake.queryInterface);
    expect(fake.nullable()).toBe(false);
    expect(fake.alters()).toHaveLength(1);
    expect(fake.alters()[0]).toMatch(/MODIFY COLUMN `documentid`.* NOT NULL$/);
    expect(fake.removed).toEqual(["lessonlearningbody", "lessonlearningtype"]);
  });

  it("refuses, naming the ids, when an item has a type other than 'video'; changes nothing", async () => {
    const fake = upgraded({ nonVideo: ["item-z", "item-a"] });
    const err = await migration.down(fake.queryInterface).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("refused");
    expect(err.message).toContain("lessonlearnings.lessonlearningtype is not 'video': 2 item(s) (all 2): item-a, item-z");
    expect(fake.alters()).toEqual([]);
    expect(fake.removed).toEqual([]);
    expect(fake.nullable()).toBe(true);
  });

  it("refuses, naming the ids, when an item holds a body; changes nothing", async () => {
    const fake = upgraded({ withBody: ["item-b"] });
    const err = await migration.down(fake.queryInterface).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("lessonlearnings.lessonlearningbody holds a body: 1 item(s) (all 1): item-b");
    expect(fake.alters()).toEqual([]);
    expect(fake.removed).toEqual([]);
  });

  it("refuses, naming the ids, when an item has no document (the NOT NULL could not be restored); changes nothing", async () => {
    const fake = upgraded({ nullDocuments: ["item-n1", "item-n2"] });
    const err = await migration.down(fake.queryInterface).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("lessonlearnings.documentid: 2 row(s) with no value (lessonlearningid, all 2): item-n1, item-n2");
    expect(fake.alters()).toEqual([]);
    expect(fake.removed).toEqual([]);
    expect(fake.nullable()).toBe(true);
  });

  it("lists at most 50 ids of a kind but counts them all", async () => {
    const many = Array.from({ length: 52 }, (_, i) => `item-${String(i).padStart(2, "0")}`);
    const err = await migration.down(upgraded({ nonVideo: many }).queryInterface).catch((e: Error) => e);
    expect(err.message).toContain("52 item(s) (first 50 of 52)");
  });

  it("is a no-op when the columns are already gone and documentid is already required", async () => {
    const fake = make();
    await migration.down(fake.queryInterface);
    expect(fake.alters()).toEqual([]);
    expect(fake.removed).toEqual([]);
  });

  it("round-trips: up, down, up ends with the columns there and documentid NULL-able", async () => {
    const fake = make();
    await migration.up(fake.queryInterface);
    await migration.down(fake.queryInterface);
    expect([...fake.columns].sort()).toEqual(["documentid", "lessonlearningid", "lessonlearningorder"]);
    expect(fake.nullable()).toBe(false);
    await migration.up(fake.queryInterface);
    expect([...fake.columns].sort()).toEqual(["documentid", "lessonlearningbody", "lessonlearningid", "lessonlearningorder", "lessonlearningtype"]);
    expect(fake.nullable()).toBe(true);
  });
});
