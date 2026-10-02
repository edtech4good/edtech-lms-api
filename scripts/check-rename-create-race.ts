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
 * rename + create pairs; (4) an edit that read the school's old name, queued
 * behind a rename, must not write the old name back over it.
 *
 * What each proves. 1 and 2 are the deterministic proofs of the lock: each
 * checks that the second transaction really WAITED, and removing the lock or
 * the in-transaction re-read turns scenario 2 red. 3 only proves that with the
 * real timing of unsynchronised pairs no row ends up with a different name; it
 * is a smoke test, not a proof (it can pass with the lock removed). 4 is
 * deterministic for the stale write-back only when the edit is granted the lock
 * second, which is the usual order; with either order the result must agree.
 *
 * It fails CLOSED: the process exit code is set here, not left to the logger,
 * and is 0 only when every scenario ran to its last check and passed. A crash,
 * a refusal or a script that never reached the end exits non-zero.
 *
 * Scratch rows carry a fixed prefix (`zzrace`). A run first removes whatever a
 * killed earlier run left, and removes its own on the way out; every open
 * transaction is rolled back in the `finally`.
 */
import { v4 as uuid } from "uuid";
import { QueryTypes, Transaction } from "sequelize";
import { dbinstance } from "src/services/dbservice";
import { initModels } from "src/models/data-models/init-models";
import { SchoolBusiness } from "src/business/school.business";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { StudentBusiness } from "src/business/student.business";

const PREFIX = "zzrace";
const SCHOOL_PREFIX = "zzrace school ";
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

async function main(): Promise<number> {
  refuseUnlessScratch();
  const db = dbinstance.getdbinstance();
  (db as unknown as { options: { logging: boolean } }).options.logging = false;
  initModels(db);
  const select = <T>(sql: string, replacements: unknown[] = []) =>
    db.query(sql, { replacements: replacements as never, type: QueryTypes.SELECT }) as Promise<T[]>;

  const open: Transaction[] = [];
  const begin = async () => {
    const t = await db.transaction();
    open.push(t);
    return t;
  };
  const sweep = async () => {
    await db.query("DELETE FROM students WHERE schooluserid IN (SELECT schooluserid FROM schoolusers WHERE schoolusername LIKE ?)", { replacements: [`${PREFIX}%`] });
    await db.query("DELETE FROM schoolusers WHERE schoolusername LIKE ?", { replacements: [`${PREFIX}%`] });
    await db.query("DELETE FROM schools WHERE schoolname LIKE ?", { replacements: [`${SCHOOL_PREFIX}%`] });
  };

  let failures = 0;
  let reachedEnd = false;
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failures++;
  };

  try {
    await sweep(); // what a killed earlier run left behind
    const [country] = await select<{ countryid: string }>("SELECT countryid FROM countries LIMIT 1");
    const [curriculum] = await select<{ curriculumid: string }>("SELECT curriculumid FROM curriculums LIMIT 1");
    if (!country || !curriculum) throw new Error("The scratch database needs a country and a curriculum.");

    const schoolid = uuid();
    const original = `${SCHOOL_PREFIX}${schoolid.slice(0, 8)}`;
    await db.query("INSERT INTO schools (schoolid, schoolname, isdeleted, curriculums, countryid) VALUES (?, ?, 0, JSON_ARRAY(), ?)", {
      replacements: [schoolid, original, country.countryid],
    });

    const staff = { lmsuserid: "race-script" } as never;
    const edit = (name: string) =>
      new SchoolBusiness().updateschoolName(
        { schoolid, schoolname: name, countryid: country.countryid, curriculums: [] } as never,
        staff,
      );
    const rename = edit;
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

    // 1. create holds the lock; the rename must wait, then its cascade renames the new learner.
    const txC = await begin();
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
    const txR = await begin();
    const renamedTo = `${original} two`;
    for (const t of ["schools", "students", "schoolusers"]) {
      await db.query(`UPDATE \`${t}\` SET schoolname = ? WHERE schoolid = ?`, { replacements: [renamedTo, schoolid], transaction: txR });
    }
    const txC2 = await begin();
    let created = false;
    const c2 = createLearner(`${PREFIX}2`, txC2, stale).then(() => { created = true; });
    await sleep(1500);
    check("2: the create waits while the rename is uncommitted", !created);
    await txR.commit();
    await c2;
    await txC2.commit();
    check("2: learner and login carry the new name, not the one the create had read", await agrees(`${PREFIX}2`));

    // 3. unsynchronised pairs (smoke test: see the header for what it does and does not prove).
    let bad = 0;
    for (let i = 0; i < 12; i++) {
      const login = `${PREFIX}f${i}`;
      const name = `${original} f${i}`;
      const current = await currentName();
      const tx = await begin();
      const c = createLearner(login, tx, current).then(() => tx.commit());
      const r = i % 2 ? sleep(5).then(() => rename(name)) : rename(name);
      await Promise.all([c, r]);
      if (!(await agrees(login))) bad++;
    }
    check("3: twelve unsynchronised rename + create pairs leave no mismatched name", bad === 0);

    // 4. a school edit queued behind a rename must not write the old name back over it.
    const before = await currentName();
    const hold = await begin();
    await db.query("SELECT schoolid FROM schools WHERE schoolid = ? FOR UPDATE", { replacements: [schoolid], transaction: hold });
    const a = rename(`${original} four`);
    await sleep(500);
    const b = edit(before); // an edit that sends the name it last saw
    await sleep(500);
    await hold.commit();
    await Promise.all([a, b]);
    const [counts] = await select<{ mismatched: number }>(
      `SELECT COUNT(*) AS mismatched FROM students st JOIN schoolusers su ON su.schooluserid = st.schooluserid
        JOIN schools sc ON sc.schoolid = st.schoolid
       WHERE sc.schoolid = ? AND (CAST(st.schoolname AS BINARY) <> CAST(sc.schoolname AS BINARY) OR CAST(su.schoolname AS BINARY) <> CAST(sc.schoolname AS BINARY))`,
      [schoolid],
    );
    check("4: after a rename and a stale edit, no learner or login has a name different from the school's", counts.mismatched === 0);
    reachedEnd = true;
  } finally {
    for (const t of open) {
      try {
        await t.rollback();
      } catch {
        // already committed or finished
      }
    }
    try {
      await sweep();
      const [left] = await select<{ n: number }>(
        "SELECT (SELECT COUNT(*) FROM schools WHERE schoolname LIKE ?) + (SELECT COUNT(*) FROM schoolusers WHERE schoolusername LIKE ?) AS n",
        [`${SCHOOL_PREFIX}%`, `${PREFIX}%`],
      );
      console.log(`cleanup: ${left.n} scratch rows left`);
    } finally {
      await db.close();
    }
  }
  return reachedEnd && failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
    process.exit(code);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
