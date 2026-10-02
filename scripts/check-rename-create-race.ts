/**
 * A school rename racing a learner create, against a real database, with the
 * real business code. Whichever of the two commits second must leave the
 * learner's and the login's copy of the school name equal to the school's.
 *
 *   ALLOW_RACE_TEST=true npm run db:race-check -- --database edtech_lms_wp3
 *
 * It WRITES (a scratch school, learners and logins) and removes everything it
 * created before it exits. So that it cannot be pointed at a database that
 * matters it refuses to run unless ALL of these hold:
 *   - ALLOW_RACE_TEST=true,
 *   - `--database <name>` is given and is the database `.env` connects to,
 *   - the name looks like a scratch copy: edtech_lms_wp<N> or edtech_lms_scratch*.
 * `edtech_lms` and `edtech_lms_rpi` never match.
 *
 * Scenarios: (1) the create holds the school row and the rename must wait;
 * (2) a rename holds the school row, the create (which read the school's old
 * name earlier) must wait and then store the new name; (3) twelve unsynchronised
 * rename + create pairs. Exit 0 only if every learner and login ended up with
 * the school's own name. Scenarios 1 and 2 also fail if the second transaction
 * did not actually wait for the first (the lock is the mechanism).
 */
import { v4 as uuid } from "uuid";
import { QueryTypes, Transaction } from "sequelize";
import { dbinstance } from "src/services/dbservice";
import { initModels } from "src/models/data-models/init-models";
import { SchoolBusiness } from "src/business/school.business";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { StudentBusiness } from "src/business/student.business";

const PREFIX = "zzrace";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function refuseUnlessScratch(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--database");
  const named = i >= 0 ? args[i + 1] : undefined;
  const actual = process.env.DB_NAME;
  const scratch = /^edtech_lms_(wp\d+|scratch\w*)$/;
  if (process.env.ALLOW_RACE_TEST !== "true") throw new Error("Refusing: set ALLOW_RACE_TEST=true (this script writes).");
  if (!named) throw new Error("Refusing: pass --database <name>.");
  if (named !== actual) throw new Error("Refusing: --database does not match the database .env connects to.");
  if (!scratch.test(named)) throw new Error("Refusing: not a scratch database name (edtech_lms_wp<N> or edtech_lms_scratch*).");
  return named;
}

async function main() {
  refuseUnlessScratch();
  const db = dbinstance.getdbinstance();
  (db as unknown as { options: { logging: boolean } }).options.logging = false;
  initModels(db);
  const select = <T>(sql: string, replacements: unknown[] = []) =>
    db.query(sql, { replacements: replacements as never, type: QueryTypes.SELECT }) as Promise<T[]>;

  const [country] = await select<{ countryid: string }>("SELECT countryid FROM countries LIMIT 1");
  const [curriculum] = await select<{ curriculumid: string }>("SELECT curriculumid FROM curriculums LIMIT 1");
  if (!country || !curriculum) throw new Error("The scratch database needs a country and a curriculum.");

  const schoolid = uuid();
  const original = `${PREFIX} school ${schoolid.slice(0, 8)}`;
  await db.query("INSERT INTO schools (schoolid, schoolname, isdeleted, curriculums, countryid) VALUES (?, ?, 0, JSON_ARRAY(), ?)", {
    replacements: [schoolid, original, country.countryid],
  });

  const staff = { lmsuserid: "race-script" } as never;
  const rename = (name: string) =>
    new SchoolBusiness().updateschoolName(
      { schoolid, schoolname: name, countryid: country.countryid, curriculums: [] } as never,
      staff,
    );
  const createLearner = async (login: string, tx: Transaction, givenName: string) => {
    const schooluserid = uuid();
    await new SchoolUserBusiness().createSchoolUser(
      [{ schooluserid, schoolusername: login, schooluserpasswordhash: "Pw12345", schooluserrole: 4, schooluserstatus: 1, isdisabled: false, schoolid, schoolname: givenName }] as never,
      tx,
    );
    await new StudentBusiness().createStudents(
      [{ studentid: uuid(), studentfirstname: "Sample", genderid: 1, city: "c", country: "c", state: "c", curriculumid: curriculum.curriculumid, isactive: 1, schooluserid, schoolid, schoolname: givenName }] as never,
      tx,
    );
  };
  const agrees = async (login: string): Promise<boolean> => {
    const [row] = await select<{ a: number; b: number }>(
      `SELECT (CAST(st.schoolname AS BINARY) = CAST(sc.schoolname AS BINARY)) AS a,
              (CAST(su.schoolname AS BINARY) = CAST(sc.schoolname AS BINARY)) AS b
         FROM schoolusers su JOIN students st ON st.schooluserid = su.schooluserid
         JOIN schools sc ON sc.schoolid = ? WHERE su.schoolusername = ?`,
      [schoolid, login],
    );
    return !!row && !!row.a && !!row.b;
  };
  const currentName = async () => (await select<{ schoolname: string }>("SELECT schoolname FROM schools WHERE schoolid = ?", [schoolid]))[0].schoolname;

  let failures = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failures++;
  };

  try {
    // 1. create holds the lock; the rename must wait, then its cascade renames the new learner.
    const txC = await db.transaction();
    await createLearner(`${PREFIX}1`, txC, original);
    let renamed = false;
    const r1 = rename(`${original} one`).then(() => { renamed = true; });
    await sleep(1500);
    check("1: the rename waits while the create is uncommitted", !renamed);
    await txC.commit();
    await r1;
    check("1: learner and login carry the school's name afterwards", await agrees(`${PREFIX}1`));

    // 2. a rename holds the lock; a create that read the OLD name earlier must wait, then store the new name.
    const stale = await currentName();
    const txR = await db.transaction();
    const renamedTo = `${original} two`;
    for (const t of ["schools", "students", "schoolusers"]) {
      await db.query(`UPDATE \`${t}\` SET schoolname = ? WHERE schoolid = ?`, { replacements: [renamedTo, schoolid], transaction: txR });
    }
    const txC2 = await db.transaction();
    let created = false;
    const c2 = createLearner(`${PREFIX}2`, txC2, stale).then(() => { created = true; });
    await sleep(1500);
    check("2: the create waits while the rename is uncommitted", !created);
    await txR.commit();
    await c2;
    await txC2.commit();
    check("2: learner and login carry the new name, not the one the create had read", await agrees(`${PREFIX}2`));

    // 3. unsynchronised pairs.
    let bad = 0;
    for (let i = 0; i < 12; i++) {
      const login = `${PREFIX}f${i}`;
      const name = `${original} f${i}`;
      const current = await currentName();
      const tx = await db.transaction();
      const c = createLearner(login, tx, current).then(() => tx.commit());
      const r = i % 2 ? sleep(5).then(() => rename(name)) : rename(name);
      await Promise.all([c, r]);
      if (!(await agrees(login))) bad++;
    }
    check("3: twelve unsynchronised rename + create pairs leave no mismatched name", bad === 0);
  } finally {
    await db.query("DELETE FROM students WHERE schooluserid IN (SELECT schooluserid FROM schoolusers WHERE schoolusername LIKE ?)", { replacements: [`${PREFIX}%`] });
    await db.query("DELETE FROM schoolusers WHERE schoolusername LIKE ?", { replacements: [`${PREFIX}%`] });
    await db.query("DELETE FROM schools WHERE schoolid = ?", { replacements: [schoolid] });
    const [left] = await select<{ n: number }>(
      "SELECT (SELECT COUNT(*) FROM schools WHERE schoolid = ?) + (SELECT COUNT(*) FROM schoolusers WHERE schoolusername LIKE ?) AS n",
      [schoolid, `${PREFIX}%`],
    );
    console.log(`cleanup: ${left.n} scratch rows left`);
    await db.close();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
