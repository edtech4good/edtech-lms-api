/**
 * Concurrent issue of certificates, run for real against MySQL with two connections.
 *
 * Proves, through the real `CertificateBusiness.issue` and its READ COMMITTED transaction:
 *  - two issues at once for DIFFERENT learners both succeed (under REPEATABLE READ a locking read that matches no row
 *    takes gap locks and the two inserts deadlock, InnoDB error 1213);
 *  - two issues at once for the SAME learner leave exactly one unrevoked certificate, and the other call refuses the learner.
 *
 * SCRATCH DATABASE ONLY. It builds every table of the models in the configured database (`sync({ force: true })`, which
 * DROPS tables of those names), runs the certificates migration for its real indexes, and drops the tables again at the end.
 * Foreign-key checks and strict mode are switched off on its own connections so only the rows the code reads need to be
 * written. It runs ONLY when CERTIFICATES_CONCURRENCY_DB_SPEC=1; run it on its own, not alongside the other DB-gated specs,
 * which use the same database. The learning server (axios) is replaced: it answers `ready` for every learner.
 */
import axios from "axios";
import { Sequelize } from "sequelize";
import { Config } from "src/config";
import { CertificateBusiness } from "src/business/certificate.business";
import { curriculums } from "src/models/data-models/curriculums";
import { grades } from "src/models/data-models/grades";
import { levels } from "src/models/data-models/levels";
import { organisations } from "src/models/data-models/organisations";
import { schools } from "src/models/data-models/school";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { initModels } from "src/models/data-models/init-models";
import { dbinstance } from "src/services/dbservice";

jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261112120000-create-certificates");

const suite = process.env.CERTIFICATES_CONCURRENCY_DB_SPEC === "1" ? describe : describe.skip;

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SCHOOL = "00000000-0000-4000-8000-000000000201";
const CUR = "00000000-0000-4000-8000-000000000301";
const GRADE = "00000000-0000-4000-8000-000000000311";
const LEVEL = "00000000-0000-4000-8000-000000000321";
const learner = (n: number) => `00000000-0000-4000-8000-${String(1000 + n).padStart(12, "0")}`;
const ROUNDS = 8;
const SAME = learner(100);
const org = { organisationid: ORG, isplatform: false };

suite("certificates: concurrent issue", () => {
  let sequelize: Sequelize;
  const run = (sql: string, replacements: unknown[] = []) => sequelize.query(sql, { replacements });

  beforeAll(async () => {
    const db = Config.fortyk.api.database;
    const once = (conn: { query: (sql: string, cb: (e: Error | null) => void) => void }, sql: string) =>
      new Promise<void>((resolve, reject) => conn.query(sql, (e) => (e ? reject(e) : resolve())));
    sequelize = new Sequelize(db.name, db.user, db.password, {
      host: db.host,
      port: db.port,
      dialect: "mysql",
      logging: false,
      pool: { max: 4, min: 2 },
      hooks: {
        afterConnect: async (conn: unknown) => {
          await once(conn as never, "SET SESSION FOREIGN_KEY_CHECKS = 0");
          await once(conn as never, "SET SESSION sql_mode = ''");
        },
      },
    });
    // the business code reads through the shared instance and the models: point both at this one
    (dbinstance as unknown as { sequelize: Sequelize }).sequelize = sequelize;
    initModels(sequelize);
    for (const model of [organisations, schools, standards, curriculums, grades, levels, students]) {
      try {
        await model.sync({ force: true });
      } catch (e) {
        throw new Error(`could not create ${model.tableName}: ${(e as { parent?: { sqlMessage?: string } }).parent?.sqlMessage ?? (e as Error).message}`);
      }
    }
    await run("DROP TABLE IF EXISTS certificates");
    await migration.up(sequelize.getQueryInterface());

    await run("INSERT INTO organisations (organisationid, organisationname, isdeleted) VALUES (?, 'Mekong Learning Group', 0)", [ORG]);
    await run("INSERT INTO schools (schoolid, schoolname, organisationid, isdeleted) VALUES (?, 'សាលាក', ?, 0)", [SCHOOL, ORG]);
    await run(
      "INSERT INTO curriculums (curriculumid, curriculumname, organisationid, isdeleted, levelrecognition, graderecognition, curriculumrecognition) VALUES (?, 'ភាសាខ្មែរ', ?, 0, 'certificate', 'certificate', 'none')",
      [CUR, ORG],
    );
    await run("INSERT INTO grades (gradeid, curriculumid, gradename, isdeleted) VALUES (?, ?, 'ថ្នាក់ទី១', 0)", [GRADE, CUR]);
    await run("INSERT INTO levels (levelid, gradeid, levelname, isdeleted) VALUES (?, ?, 'មេរៀនទី២', 0)", [LEVEL, GRADE]);
    const ids = [SAME, ...Array.from({ length: ROUNDS * 2 }, (_, i) => learner(i))];
    for (const id of ids) {
      await run(
        "INSERT INTO students (studentid, studentfirstname, studentlastname, schoolid, curriculumid, curriculumids, isdeleted) VALUES (?, 'សុខា', 'ចាន់', ?, ?, ?, 0)",
        [id, SCHOOL, CUR, JSON.stringify([CUR])],
      );
    }
    (axios.post as jest.Mock).mockImplementation(async (_url: string, body: { studentids: string[] }) => ({
      data: { error: false, data: body.studentids.map((studentid) => ({ studentid, status: "ready", reasons: [], quizcount: 3, passedcount: 3 })) },
    }));
  });
  afterAll(async () => {
    await run("DROP TABLE IF EXISTS certificates");
    await sequelize.drop();
    await sequelize.close();
  });

  const issue = (studentids: string[]) => new CertificateBusiness(org as never).issue({ curriculumid: CUR, scope: "level", scopeid: LEVEL, studentids }, "staff-1");
  const held = async (studentid: string) => {
    const [rows] = await run("SELECT certificateid FROM certificates WHERE studentid = ? AND revokedat IS NULL", [studentid]);
    return (rows as unknown[]).length;
  };

  it("two issues at once for different learners both succeed, every round", async () => {
    for (let i = 0; i < ROUNDS; i += 1) {
      const [a, b] = await Promise.all([issue([learner(2 * i)]), issue([learner(2 * i + 1)])]);
      expect(a.issued.map((c) => c.studentid)).toEqual([learner(2 * i)]);
      expect(b.issued.map((c) => c.studentid)).toEqual([learner(2 * i + 1)]);
      expect(await held(learner(2 * i))).toBe(1);
      expect(await held(learner(2 * i + 1))).toBe(1);
    }
  });

  it("two issues at once for the same learner leave exactly one certificate and refuse the other call", async () => {
    const results = await Promise.all([issue([SAME]), issue([SAME])]);
    expect(results.flatMap((r) => r.issued).map((c) => c.studentid)).toEqual([SAME]);
    expect(results.flatMap((r) => r.refused)).toEqual([{ studentid: SAME, status: "issued", reasons: [] }]);
    expect(await held(SAME)).toBe(1);
  });
});
