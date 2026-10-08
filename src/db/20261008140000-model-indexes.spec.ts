/**
 * The indexes the models declare and no migration created (central never runs `sync()`). Drives up()/down()
 * against a stand-in for MySQL's index bookkeeping: it proves what the migration ASKS MySQL for, in what
 * order, and what it leaves alone. That a migrated database then has no declared index missing, and equals a
 * fresh one, was run on real MySQL (npm run db:check-indexes, SHOW CREATE TABLE before and after); see the change description.
 */
import { Sequelize } from "sequelize";
import { initModels } from "src/models/data-models/init-models";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261008140000-model-indexes");

const TX = { id: "the-transaction" };

/** Measured from the compiled models and information_schema (npm run db:check-indexes), written out independently of the migration. table -> [name, columns][]. */
const EXPECTED: Array<[string, Array<[string, string[]]>]> = [
  ["studentlearningsprogress", [["lessonlearningid", ["lessonlearningid"]]]],
  ["studentgradesprogress", [["gradeid", ["gradeid"]], ["curriculumid", ["curriculumid"]]]],
  ["studentlevelsprogress", [["levelid", ["levelid"]], ["gradeid", ["gradeid"]], ["curid", ["curid"]]]],
  ["studentlessonsprogress", [["lessonid", ["lessonid"]], ["levelid", ["levelid"]], ["gradeid", ["gradeid"]], ["curid", ["curid"]]]],
  ["studentactives", [["lessonid", ["referenceid"]]]],
  ["studentpoints", [["lessonid", ["lessonid"]]]],
  ["studentappusages", [["schooluserid", ["schooluserid"]]]],
  ["lessonplans", [["lessonid", ["lessonid"]]]],
];
const TABLES = EXPECTED.map(([t]) => t);
const ADDED = EXPECTED.flatMap(([t, ixs]) => ixs.map(([n]) => `${t}.${n}`));

/** Declared by a model but already covered by an index there (a composite that leads with the column; the foreign key's own index): NOT added. */
const COVERED = ["studentlearningsprogress.studentid", "studentgradesprogress.studentid", "studentlevelsprogress.studentid", "studentlessonsprogress.studentid", "studentactives.studentid", "studentpoints.studentid", "schools.countryid"];

/**
 * Every non-PRIMARY index the compiled models declare (table.name(columns)), as of this migration. CI has no MySQL to run
 * `npm run db:check-indexes`, so this pins the declared set: a NEW or CHANGED `indexes:` entry turns this red until someone
 * classifies it (add a migration for it and to EXPECTED above, list it in COVERED, or, if a migration already made it, update this list).
 * Classes: the 14 in EXPECTED are added here; the 7 in COVERED are not (an existing index leads with the column); 2 are unique and
 * already created by earlier migrations; the other 19 are created by earlier migrations.
 */
const DECLARED_SNAPSHOT = [
  "grades.curriculumid(curriculumid)",
  "lessonlearnings.lessonid(lessonid)",
  "lessonplans.lessonid(lessonid)",
  "lessonpracticequestions.lessonpracticeid(lessonpracticeid)",
  "lessonpracticequestions.questionid(questionid)",
  "lessonpractices.lessonid(lessonid)",
  "lessonquizquestions.lessonquizid(lessonquizid)",
  "lessonquizquestions.questionid(questionid)",
  "lessonquizzes.lessonid(lessonid)",
  "lessons.levelid(levelid)",
  "levelquizquestions.levelid(levelid)",
  "levelquizquestions.questionid(questionid)",
  "levels.gradeid(gradeid)",
  "organisationcountry.organisationcountry_organisation_country_unique(organisationid,countryid) UNIQUE",
  "schools.countryid(countryid)",
  "schoolusers.schoolusername(schoolusername) UNIQUE",
  "studentactives.lessonid(referenceid)",
  "studentactives.studentid(studentid)",
  "studentappusages.schooluserid(schooluserid)",
  "studentgradesprogress.curriculumid(curriculumid)",
  "studentgradesprogress.gradeid(gradeid)",
  "studentgradesprogress.studentid(studentid)",
  "studentlearningsprogress.lessonlearningid(lessonlearningid)",
  "studentlearningsprogress.studentid(studentid)",
  "studentlessonsprogress.curid(curid)",
  "studentlessonsprogress.gradeid(gradeid)",
  "studentlessonsprogress.lessonid(lessonid)",
  "studentlessonsprogress.levelid(levelid)",
  "studentlessonsprogress.studentid(studentid)",
  "studentlevelsprogress.curid(curid)",
  "studentlevelsprogress.gradeid(gradeid)",
  "studentlevelsprogress.levelid(levelid)",
  "studentlevelsprogress.studentid(studentid)",
  "studentpoints.lessonid(lessonid)",
  "studentpoints.studentid(studentid)",
  "studentprogressquestions.studentprogressid(studentprogressid)",
  "students.curriculumid(curriculumid)",
  "students.gradeid(gradeid)",
  "students.schooluserid(schooluserid)",
  "students.startinglevelid(startinglevelid)",
  "students.studentcurrentlessonid(studentcurrentlessonid)",
  "students.studentcurrentlevelid(studentcurrentlevelid)",
];

interface Ix {
  name: string;
  columns: string[];
}

/** What a migrated database has on the eight tables before this migration (primary keys and the composites that lead with studentid). */
const migrated = (): Map<string, Ix[]> =>
  new Map<string, Ix[]>([
    ["lessonplans", [{ name: "PRIMARY", columns: ["lessonplanid"] }]],
    ["studentactives", [{ name: "PRIMARY", columns: ["studentactiveid"] }, { name: "studentactives_studentid_referenceid", columns: ["studentid", "referenceid"] }]],
    ["studentappusages", [{ name: "PRIMARY", columns: ["studentappusageid"] }, { name: "studentappusages_studentappusageid_schooluserid", columns: ["studentappusageid", "schooluserid"] }]],
    ["studentgradesprogress", [{ name: "PRIMARY", columns: ["studentgradeprogressid"] }, { name: "studentgradesprogress_studentid_gradeid_curriculumid", columns: ["studentid", "gradeid", "curriculumid"] }]],
    ["studentlearningsprogress", [{ name: "PRIMARY", columns: ["studentlearningprogressid"] }, { name: "studentlearningsprogress_studentid_lessonlearningid", columns: ["studentid", "lessonlearningid"] }]],
    ["studentlessonsprogress", [{ name: "PRIMARY", columns: ["studentlessonprogressid"] }, { name: "studentlessonsprogress_studentid_lessonid_levelid_gradeid_curid", columns: ["studentid", "lessonid", "levelid", "gradeid", "curid"] }]],
    ["studentlevelsprogress", [{ name: "PRIMARY", columns: ["studentlevelprogressid"] }, { name: "studentlevelsprogress_studentid_levelid_gradeid_curid", columns: ["studentid", "levelid", "gradeid", "curid"] }]],
    ["studentpoints", [{ name: "PRIMARY", columns: ["studentpointid"] }, { name: "studentpoints_studentid_lessonid", columns: ["studentid", "lessonid"] }]],
  ]);

/** The same tables with the fourteen present. */
const complete = (): Map<string, Ix[]> => {
  const m = migrated();
  for (const [table, ixs] of EXPECTED) for (const [name, columns] of ixs) m.get(table)!.push({ name, columns });
  return m;
};

interface Opts {
  indexes?: Map<string, Ix[]>;
  /** Tables that do not exist. */
  missing?: string[];
  /** An ALTER whose SQL matches fails. */
  failOn?: RegExp;
  sqlMode?: string;
}

const clausesOf = (sql: string): string[] => sql.replace(/^ALTER TABLE `\w+` /, "").split(/, (?=ADD |DROP )/);

/** A stand-in for the part of MySQL these ALTERs touch: indexes by name per table. `log` records every statement; a repeated ADD or a DROP of an absent index throws as MySQL does. */
const makeQI = (opts: Opts = {}) => {
  const indexes = opts.indexes ?? migrated();
  const missing = new Set(opts.missing ?? []);
  let mode = opts.sqlMode ?? "ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION";
  const log: string[] = [];
  const alters: string[] = [];
  const txOf = new Map<string, unknown>();

  const query = jest.fn((sql: string, o?: { replacements?: string[]; transaction?: unknown }): Promise<unknown> => {
    log.push(sql);
    txOf.set(sql, o?.transaction);
    if (/FROM information_schema\.statistics/.test(sql)) {
      const table = o!.replacements![0];
      return Promise.resolve((indexes.get(table) ?? []).map((i) => ({ name: i.name })));
    }
    if (/SELECT @@SESSION\.sql_mode/.test(sql)) {
      return Promise.resolve([{ mode }]);
    }
    const set = /^SET SESSION sql_mode = (.*)$/.exec(sql);
    if (set) {
      mode = set[1].startsWith("CONCAT") ? `${mode},STRICT_TRANS_TABLES` : set[1].replace(/^'|'$/g, "");
      return Promise.resolve([]);
    }
    const alter = /^ALTER TABLE `(\w+)` /.exec(sql);
    if (alter) {
      const table = alter[1];
      if (missing.has(table)) throw new Error(`Table '${table}' doesn't exist`);
      if (opts.failOn?.test(sql)) throw new Error("boom");
      alters.push(sql);
      const list = indexes.get(table)!;
      for (const clause of clausesOf(sql)) {
        const add = /^ADD INDEX `(\w+)` USING BTREE \((.*)\)$/.exec(clause);
        const drop = /^DROP INDEX `(\w+)`$/.exec(clause);
        if (add) {
          if (list.some((i) => i.name === add[1])) throw new Error(`Duplicate key name '${add[1]}'`);
          list.push({ name: add[1], columns: add[2].split(", ").map((c) => c.replace(/`/g, "")) });
        } else if (drop) {
          const at = list.findIndex((i) => i.name === drop[1]);
          if (at < 0) throw new Error(`Can't DROP '${drop[1]}'; check that column/key exists`);
          list.splice(at, 1);
        } else {
          throw new Error(`unrecognised clause: ${clause}`);
        }
      }
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });

  const qi = {
    showAllTables: jest.fn(() => Promise.resolve([...TABLES, "students", "schools"].filter((t) => !missing.has(t)))),
    sequelize: {
      query,
      escape: (v: string) => `'${v}'`,
      transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)),
    },
  };
  return { qi, indexes, log, alters, txOf, mode: () => mode };
};

/** All indexes as a sorted list of `table.name:columns`. */
const named = (indexes: Map<string, Ix[]>, of: (n: string) => boolean = () => true): string[] =>
  [...indexes.entries()].flatMap(([t, l]) => l.filter((i) => of(i.name)).map((i) => `${t}.${i.name}:${i.columns.join("+")}`)).sort();

describe("the declared set is pinned", () => {
  it("the compiled models declare exactly the 42 non-PRIMARY indexes in DECLARED_SNAPSHOT (a new or changed declaration needs classifying)", () => {
    const sequelize = new Sequelize("none", "none", "none", { dialect: "mysql" });
    initModels(sequelize);
    const declared: string[] = [];
    for (const model of Object.values(sequelize.models)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const i of ((model as any)._indexes ?? []) as any[]) {
        if (i.name === "PRIMARY") continue;
        const cols = i.fields.map((f: string | { name?: string; attribute?: string }) => (typeof f === "string" ? f : (f.name ?? f.attribute)));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        declared.push(`${(model as any).getTableName()}.${i.name}(${cols.join(",")})${i.unique ? " UNIQUE" : ""}`);
      }
    }
    expect(declared.sort()).toEqual([...DECLARED_SNAPSHOT].sort());
    expect(DECLARED_SNAPSHOT).toHaveLength(42);
  });
});

describe("the list matches the models", () => {
  it("each of the fourteen is declared by its model with this name and these columns, and the covered seven are declared too", () => {
    const sequelize = new Sequelize("none", "none", "none", { dialect: "mysql" });
    initModels(sequelize);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const declared = new Map<string, string[]>();
    for (const model of Object.values(sequelize.models)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const i of ((model as any)._indexes ?? []) as any[]) {
        declared.set(`${(model as any).getTableName()}.${i.name}`, i.fields.map((f: string | { name: string }) => (typeof f === "string" ? f : f.name)));
      }
    }
    for (const [table, ixs] of EXPECTED) for (const [name, cols] of ixs) expect(declared.get(`${table}.${name}`)).toEqual(cols);
    for (const c of COVERED) expect(declared.has(c)).toBe(true);
    expect(ADDED).toHaveLength(14);
  });
});

describe("up() on a migrated database", () => {
  it("issues exactly one ALTER per table, adding each index with the model's name, columns and BTREE", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    const want = EXPECTED.map(
      ([t, ixs]) => `ALTER TABLE \`${t}\` ` + ixs.map(([n, cols]) => `ADD INDEX \`${n}\` USING BTREE (${cols.map((c) => `\`${c}\``).join(", ")})`).join(", "),
    );
    expect(f.alters).toEqual(want);
  });

  it("adds 14 indexes, none unique", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    expect(f.alters.join("\n").match(/ADD INDEX/g)).toHaveLength(14);
    expect(f.alters.join("\n")).not.toMatch(/UNIQUE|FULLTEXT|SPATIAL/i);
  });

  it("indexes studentactives.referenceid under the name `lessonid`, as the model does", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    expect(f.alters).toContain("ALTER TABLE `studentactives` ADD INDEX `lessonid` USING BTREE (`referenceid`)");
  });

  it("ends in exactly the expected index set, every one of the eight tables", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    expect(named(f.indexes)).toEqual(named(complete()));
  });

  it("does not add the seven indexes an existing index already covers, and touches no other table", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    for (const c of COVERED) {
      const [table, name] = c.split(".");
      expect(f.alters.join("\n")).not.toContain(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\``);
    }
    expect(f.alters.every((s) => TABLES.some((t) => s.startsWith(`ALTER TABLE \`${t}\` `)))).toBe(true);
    expect(f.alters.some((s) => s.includes("`schools`"))).toBe(false);
    expect(f.alters.join("\n")).not.toMatch(/DROP|MODIFY|CHANGE|CONSTRAINT|FOREIGN/);
  });

  it("leaves the existing indexes alone (primary keys and the composites)", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    const kept = (n: string) => n === "PRIMARY" || n.includes("_studentid_") || n.startsWith("studentappusages_");
    expect(named(f.indexes, kept)).toEqual(named(migrated(), kept));
  });

  it("runs every statement in the transaction", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    expect(f.qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    for (const sql of [...f.alters, ...f.log.filter((s) => /information_schema/.test(s))]) {
      expect(f.txOf.get(sql)).toBe(TX);
    }
  });
});

describe("up() is idempotent", () => {
  it("on a database that already has all fourteen: sends no DDL at all", async () => {
    const f = makeQI({ indexes: complete() });
    await migration.up(f.qi);
    expect(f.alters).toEqual([]);
    expect(named(f.indexes)).toEqual(named(complete()));
  });

  it("run twice: the second run sends no DDL", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    const first = f.alters.length;
    await migration.up(f.qi);
    expect(first).toBe(8);
    expect(f.alters).toHaveLength(first);
  });

  it("skips an index by NAME and adds only what is missing, in one ALTER for that table", async () => {
    const indexes = migrated();
    indexes.get("studentlessonsprogress")!.push({ name: "levelid", columns: ["levelid"] }, { name: "curid", columns: ["curid"] });
    const f = makeQI({ indexes });
    await migration.up(f.qi);
    expect(f.alters.filter((s) => s.startsWith("ALTER TABLE `studentlessonsprogress`"))).toEqual([
      "ALTER TABLE `studentlessonsprogress` ADD INDEX `lessonid` USING BTREE (`lessonid`), ADD INDEX `gradeid` USING BTREE (`gradeid`)",
    ]);
    expect(named(f.indexes)).toEqual(named(complete()));
  });

  it("a name that already exists with other columns is left alone (sync() would too)", async () => {
    const indexes = migrated();
    indexes.get("studentpoints")!.push({ name: "lessonid", columns: ["levelid", "lessonid"] });
    const f = makeQI({ indexes });
    await migration.up(f.qi);
    expect(f.alters.some((s) => s.startsWith("ALTER TABLE `studentpoints`"))).toBe(false);
    expect(f.indexes.get("studentpoints")!.find((i) => i.name === "lessonid")!.columns).toEqual(["levelid", "lessonid"]);
  });

  it("does not create a table that is absent, and does not touch it", async () => {
    const f = makeQI({ missing: ["lessonplans"] });
    await migration.up(f.qi);
    expect(f.alters.some((s) => s.includes("`lessonplans`"))).toBe(false);
    expect(f.alters).toHaveLength(7);
  });
});

describe("strict SQL mode", () => {
  it("is switched on for the ALTERs and restored to the session's own mode afterwards", async () => {
    const f = makeQI({ sqlMode: "ONLY_FULL_GROUP_BY,NO_ENGINE_SUBSTITUTION" });
    await migration.up(f.qi);
    const sets = f.log.filter((s) => /^SET SESSION sql_mode/.test(s));
    expect(sets).toHaveLength(2);
    expect(f.log.indexOf(sets[0])).toBeLessThan(f.log.findIndex((s) => /^ALTER TABLE/.test(s)));
    expect(f.log.lastIndexOf(sets[1])).toBeGreaterThan(f.log.map((s, i) => (/^ALTER TABLE/.test(s) ? i : -1)).reduce((a, b) => Math.max(a, b), -1));
    expect(f.mode()).toBe("ONLY_FULL_GROUP_BY,NO_ENGINE_SUBSTITUTION");
  });

  it("sends nothing when the session is already strict", async () => {
    const f = makeQI();
    await migration.up(f.qi);
    expect(f.log.filter((s) => /^SET SESSION/.test(s))).toEqual([]);
  });

  it("restores the mode even when an ALTER fails", async () => {
    const f = makeQI({ sqlMode: "NO_ENGINE_SUBSTITUTION", failOn: /^ALTER TABLE `studentpoints`/ });
    await expect(migration.up(f.qi)).rejects.toThrow("boom");
    expect(f.mode()).toBe("NO_ENGINE_SUBSTITUTION");
  });

  it("down() is pinned too", async () => {
    const f = makeQI({ indexes: complete(), sqlMode: "NO_ENGINE_SUBSTITUTION" });
    await migration.down(f.qi);
    expect(f.log.filter((s) => /^SET SESSION/.test(s))).toHaveLength(2);
    expect(f.mode()).toBe("NO_ENGINE_SUBSTITUTION");
  });
});

describe("down()", () => {
  const upped = async () => {
    const f = makeQI();
    await migration.up(f.qi);
    return f;
  };

  it("after up(): removes the 14 indexes and nothing else", async () => {
    const f = await upped();
    f.alters.length = 0;
    await migration.down(f.qi);
    expect(named(f.indexes).filter((n) => ADDED.some((a) => n.startsWith(`${a}:`)))).toEqual([]);
    expect(named(f.indexes)).toEqual(named(migrated()));
  });

  it("issues one ALTER per table in reverse table order, dropping each index by name", async () => {
    const f = await upped();
    f.alters.length = 0;
    await migration.down(f.qi);
    expect(f.alters).toEqual(
      [...EXPECTED].reverse().map(([t, ixs]) => `ALTER TABLE \`${t}\` ` + [...ixs].reverse().map(([n]) => `DROP INDEX \`${n}\``).join(", ")),
    );
  });

  it("drops only the indexes that are present, by name", async () => {
    const indexes = migrated();
    indexes.get("studentpoints")!.push({ name: "lessonid", columns: ["lessonid"] });
    const f = makeQI({ indexes });
    await migration.down(f.qi);
    expect(f.alters).toEqual(["ALTER TABLE `studentpoints` DROP INDEX `lessonid`"]);
  });

  it("on a database that never had them: sends no DDL", async () => {
    const f = makeQI();
    await migration.down(f.qi);
    expect(f.alters).toEqual([]);
  });

  it("skips an absent table", async () => {
    const f = makeQI({ indexes: complete(), missing: ["lessonplans"] });
    await migration.down(f.qi);
    expect(f.alters.some((s) => s.includes("`lessonplans`"))).toBe(false);
    expect(f.alters).toHaveLength(7);
  });

  it("up() again after down() ends where the first up() did", async () => {
    const f = await upped();
    const first = named(f.indexes);
    await migration.down(f.qi);
    await migration.up(f.qi);
    expect(named(f.indexes)).toEqual(first);
  });

  it("does not drop a primary key or a composite", async () => {
    const f = await upped();
    await migration.down(f.qi);
    expect(f.alters.join("\n")).not.toMatch(/DROP INDEX `(PRIMARY|\w+_studentid_\w+|studentappusages_\w+)`/);
  });
});
