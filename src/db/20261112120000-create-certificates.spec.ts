/**
 * 20261112120000-create-certificates, run for real against MySQL.
 *
 * The migration's SQL runs on one real MySQL connection (a pool of one, so any read outside the migration's transaction
 * would hang). It creates a REAL `certificates` table and drops it again, so point the config at a scratch database and
 * never at a shared one (it refuses to run unless the database name contains "scratch") (a temporary table cannot stand in: the migration reads INFORMATION_SCHEMA, which does not list
 * temporary tables). It runs ONLY when CERTIFICATES_DB_SPEC=1 is set; otherwise it is skipped.
 *
 * Proved: up creates the columns and the three indexes (the shortcode one unique) with utf8mb4 / utf8mb4_unicode_ci; a
 * second up changes nothing; the unique index refuses a repeated code; down refuses while the table holds a row, and drops
 * the empty table.
 */
import { Sequelize, QueryTypes } from "sequelize";
import { Config } from "src/config";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261112120000-create-certificates");

/** Refuses to touch a database that is not a scratch one: this spec drops and re-creates real table names. */
const assertScratchDatabase = (name: string) => {
  if (!/scratch/.test(name)) {
    throw new Error(`Refusing to run: the configured database "${name}" is not a scratch database (its name must contain "scratch"). This spec creates and drops real tables.`);
  }
};

const suite = process.env.CERTIFICATES_DB_SPEC === "1" ? describe : describe.skip;

suite("create-certificates", () => {
  let sequelize: Sequelize;
  let scratchChecked = false;
  const qi = () => sequelize.getQueryInterface();
  const run = (sql: string) => sequelize.query(sql, { type: QueryTypes.RAW });

  beforeAll(() => {
    const db = Config.fortyk.api.database;
    assertScratchDatabase(db.name);
    scratchChecked = true;
    sequelize = new Sequelize(db.name, db.user, db.password, { host: db.host, port: db.port, dialect: "mysql", logging: false, pool: { max: 1, min: 1 } });
  });
  afterAll(async () => sequelize?.close());
  beforeEach(async () => {
    await run("DROP TABLE IF EXISTS certificates");
  });
  afterEach(async () => {
    if (scratchChecked) await run("DROP TABLE IF EXISTS certificates");
  });

  const insert = (code: string) =>
    run(
      `INSERT INTO certificates (certificateid, shortcode, organisationid, studentid, curriculumid, scope, scopeid, issuedat, issuedby, snapshot, created_at, updated_at)
       VALUES (UUID(), '${code}', 'o', 's', 'c', 'level', 'l', NOW(3), 'u', '{}', NOW(), NOW())`,
    );

  it("creates the table, names its collation, and indexes the shortcode uniquely", async () => {
    await migration.up(qi());
    const columns = Object.keys(await qi().describeTable("certificates"));
    expect(columns).toEqual([
      "certificateid", "shortcode", "organisationid", "studentid", "curriculumid", "scope", "scopeid", "standardid", "issuedat", "issuedby",
      "revokedat", "revokedby", "revokereason", "snapshot", "created_at", "updated_at",
    ]);
    const [table] = (await sequelize.query("SELECT TABLE_COLLATION AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificates'", { type: QueryTypes.SELECT })) as Array<{ c: string }>;
    expect(table.c).toBe("utf8mb4_unicode_ci");
    const indexes = ((await qi().showIndex("certificates")) as Array<{ name: string; unique: boolean; fields: Array<{ attribute: string }> }>)
      .filter((i) => i.name !== "PRIMARY")
      .map((i) => `${i.name}:${i.unique}:${i.fields.map((f) => f.attribute).join(",")}`)
      .sort();
    expect(indexes).toEqual(
      [
        "certificates_org_curriculum_scope:false:organisationid,curriculumid,scope,scopeid",
        "certificates_shortcode_unique:true:shortcode",
        "certificates_studentid:false:studentid",
      ].sort(),
    );
    await insert("AAAA-BBBB");
    // Sequelize reports MySQL's duplicate-key error (1062) as a unique constraint error, whose message is "Validation error"
    await expect(insert("AAAA-BBBB")).rejects.toMatchObject({ name: "SequelizeUniqueConstraintError" });
  });

  it("run again changes nothing", async () => {
    await migration.up(qi());
    await insert("AAAA-BBBB");
    await migration.up(qi());
    const [row] = (await sequelize.query("SELECT COUNT(*) AS n FROM certificates", { type: QueryTypes.SELECT })) as Array<{ n: number }>;
    expect(Number(row.n)).toBe(1);
  });

  it("down refuses while certificates are held, and drops the empty table", async () => {
    await migration.up(qi());
    await insert("AAAA-BBBB");
    await expect(migration.down(qi())).rejects.toThrow(/holds issued certificates/);
    await run("DELETE FROM certificates");
    await migration.down(qi());
    expect(await qi().showAllTables()).not.toContain("certificates");
  });
});
