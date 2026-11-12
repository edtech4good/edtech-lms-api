/**
 * 20261112100000-curriculum-recognition, run for real against MySQL.
 *
 * The migration's SQL runs on one real MySQL connection against TEMPORARY `curriculums` and `organisations` tables the
 * spec creates on that connection. A temporary table shadows the real one, so nothing in the configured database is
 * read or written, and the spec cleans up by closing the connection. It runs ONLY when CURRICULUM_RECOGNITION_DB_SPEC=1
 * is set (it needs a reachable MySQL); otherwise it is skipped.
 *
 * A curriculum of a company organisation ends award / none / certificate, one of a school organisation award /
 * certificate / none, and a second run changes nothing (a value staff set in between is kept). down drops the columns.
 */
import { Sequelize, QueryTypes } from "sequelize";
import { Config } from "src/config";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261112100000-curriculum-recognition");

const suite = process.env.CURRICULUM_RECOGNITION_DB_SPEC === "1" ? describe : describe.skip;

suite("curriculum-recognition", () => {
  let sequelize: Sequelize;
  const run = (sql: string) => sequelize.query(sql, { type: QueryTypes.RAW });
  const rows = () =>
    sequelize.query<{ curriculumid: string; levelrecognition: string; graderecognition: string; curriculumrecognition: string }>(
      "SELECT curriculumid, levelrecognition, graderecognition, curriculumrecognition FROM curriculums ORDER BY curriculumid",
      { type: QueryTypes.SELECT },
    );
  const queryInterface = () => sequelize.getQueryInterface();
  const up = () => migration.up(queryInterface());
  const down = () => migration.down(queryInterface());

  beforeAll(() => {
    const db = Config.fortyk.api.database;
    // One connection, so the temporary tables are seen by every statement, the migration's transaction included.
    sequelize = new Sequelize(db.name, db.user, db.password, { host: db.host, port: db.port, dialect: "mysql", logging: false, pool: { max: 1, min: 1 } });
  });
  afterAll(async () => sequelize.close());

  beforeEach(async () => {
    await run("DROP TEMPORARY TABLE IF EXISTS curriculums");
    await run("DROP TEMPORARY TABLE IF EXISTS organisations");
    await run("CREATE TEMPORARY TABLE organisations (organisationid VARCHAR(36) PRIMARY KEY, organisationpreset VARCHAR(16) NOT NULL)");
    await run("CREATE TEMPORARY TABLE curriculums (curriculumid VARCHAR(36) PRIMARY KEY, curriculumname VARCHAR(250) NOT NULL, organisationid VARCHAR(36) NOT NULL)");
    await run("INSERT INTO organisations VALUES ('org-company', 'company'), ('org-school', 'school')");
    await run("INSERT INTO curriculums VALUES ('cur-company', 'មេរៀនគំរូ', 'org-company'), ('cur-school', 'Sample', 'org-school')");
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("sets the company defaults on a company organisation's curriculum and the school defaults on a school's", async () => {
    await up();
    expect(await rows()).toEqual([
      { curriculumid: "cur-company", levelrecognition: "award", graderecognition: "none", curriculumrecognition: "certificate" },
      { curriculumid: "cur-school", levelrecognition: "award", graderecognition: "certificate", curriculumrecognition: "none" },
    ]);
  });

  it("run again changes nothing, and keeps a value set since", async () => {
    await up();
    await run("UPDATE curriculums SET levelrecognition = 'certificate' WHERE curriculumid = 'cur-company'");
    const before = await rows();
    await up();
    expect(await rows()).toEqual(before);
    expect(before[0].levelrecognition).toBe("certificate");
  });

  it("down drops the three columns", async () => {
    await up();
    await down();
    const columns = Object.keys(await queryInterface().describeTable("curriculums"));
    expect(columns).toEqual(["curriculumid", "curriculumname", "organisationid"]);
  });
});
