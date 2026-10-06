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
 * behind a rename, must not write the old name back over it;
 * (A) a writer that looked a school up BY NAME holds its transaction open while
 * a rename of that school starts: the rename must wait, then succeed (it used to
 * deadlock with the writer's insert), and the inserted row must carry the final
 * name; (B) while such a writer's transaction is open, a rename of an unrelated
 * school and a school create must not be blocked (the lookup used to lock the
 * whole name index); (C) a school moved to another country (and renamed) must
 * not end in a country its organisation is not linked to when the organisation
 * drops that country at the same moment.
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
 * Every school belongs to an organisation (the column is required), so the script
 * makes a scratch organisation of its own (code `zzrace…`), links it to the country
 * it uses, and puts the schools of scenarios 1 to 4, A and B in it; school writes
 * go through the real business code as a platform caller that names that
 * organisation where the code needs one (a school create). Scenario C keeps its own
 * two-country organisation. Nothing outside the `zzrace` rows is touched.
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
import { OrganisationBusiness } from "src/business/organisation.business";
import { resolveSchoolByName } from "src/business/school-identity";

const PREFIX = "zzrace";
const settledWithin = async (p: Promise<unknown>, ms: number): Promise<"ok" | "failed" | "timeout"> =>
  Promise.race([
    p.then(() => "ok" as const, () => "failed" as const),
    new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms)),
  ]);
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
    await db.query("DELETE FROM organisationcountry WHERE organisationid IN (SELECT organisationid FROM organisations WHERE organisationcode LIKE ?)", { replacements: [`${PREFIX}%`] });
    await db.query("DELETE FROM organisations WHERE organisationcode LIKE ?", { replacements: [`${PREFIX}%`] });
    await db.query("DELETE FROM countries WHERE countryname LIKE ?", { replacements: [`${PREFIX} country%`] });
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

    // The scratch organisation the main schools belong to, linked to the one country they use.
    const mainOrg = uuid();
    await db.query(
      "INSERT INTO organisations (organisationid, organisationname, organisationcode, organisationshortname, organisationpreset) VALUES (?, ?, ?, 'ZR', 'schoolnetwork')",
      { replacements: [mainOrg, `${PREFIX} main org ${mainOrg.slice(0, 8)}`, `${PREFIX}m${mainOrg.slice(0, 7)}`] },
    );
    await db.query("INSERT INTO organisationcountry (organisationcountryid, organisationid, countryid) VALUES (?, ?, ?)", {
      replacements: [uuid(), mainOrg, country.countryid],
    });

    const schoolid = uuid();
    const original = `${SCHOOL_PREFIX}${schoolid.slice(0, 8)}`;
    await db.query("INSERT INTO schools (schoolid, schoolname, isdeleted, curriculums, countryid, organisationid) VALUES (?, ?, 0, JSON_ARRAY(), ?, ?)", {
      replacements: [schoolid, original, country.countryid, mainOrg],
    });

    const staff = { lmsuserid: "race-script" } as never;
    // package 2b: a school write needs the caller's scope
    const platform = { organisationid: null, isplatform: true } as never;
    const editSchool = (id: string, name: string, countryid: string) =>
      new SchoolBusiness().updateschoolName({ schoolid: id, schoolname: name, countryid, curriculums: [] } as never, staff, platform);
    const edit = (name: string) => editSchool(schoolid, name, country.countryid);
    const rename = edit;
    // `byName`: the writer names the school by its NAME only (teacher create, the teacher
    // CSV import, the learner edit upload); otherwise the id is given as well.
    const createLearner = async (login: string, tx: Transaction, givenName: string, forSchool = schoolid, byName = false) => {
      const schooluserid = uuid();
      const ids = byName ? {} : { schoolid: forSchool };
      await new SchoolUserBusiness().createSchoolUser(
        [{ schooluserid, schoolusername: login, schooluserpasswordhash: "Pw12345", schooluserrole: 4, schooluserstatus: 1, isdisabled: false, ...ids, schoolname: givenName }] as never,
        tx,
      );
      await new StudentBusiness().createStudents(
        [{ studentid: uuid(), studentfirstname: "Sample", genderid: 1, city: "c", country: "c", state: "c", curriculumid: curriculum.curriculumid, isactive: 1, schooluserid, ...ids, schoolname: givenName }] as never,
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

    // A. a by-name writer holds its transaction open while a rename of that school starts.
    const nameForA = await currentName();
    const txA = await begin();
    await resolveSchoolByName(nameForA, txA);
    let renameA: "ok" | "failed" | undefined;
    const rA = rename(`${original} A`).then(() => { renameA = "ok"; }, () => { renameA = "failed"; });
    await sleep(1500);
    check("A: the rename waits while the by-name writer's transaction is open", renameA === undefined);
    let insertedA = true;
    try {
      await createLearner(`${PREFIX}A`, txA, nameForA, schoolid, true);
      await txA.commit();
    } catch {
      insertedA = false;
    }
    await rA;
    check("A: the by-name writer's insert succeeds (no deadlock)", insertedA);
    check("A: the rename succeeds (no deadlock)", renameA === "ok");
    check("A: the inserted learner and login carry the school's FINAL name", insertedA && (await agrees(`${PREFIX}A`)));

    // B. while a by-name writer's transaction is open, unrelated school writes are not blocked.
    const otherId = uuid();
    const otherName = `${SCHOOL_PREFIX}b ${otherId.slice(0, 8)}`;
    await db.query("INSERT INTO schools (schoolid, schoolname, isdeleted, curriculums, countryid, organisationid) VALUES (?, ?, 0, JSON_ARRAY(), ?, ?)", {
      replacements: [otherId, otherName, country.countryid, mainOrg],
    });
    const txB = await begin();
    await resolveSchoolByName(await currentName(), txB);
    const unrelatedRename = await settledWithin(editSchool(otherId, `${otherName} renamed`, country.countryid), 3000);
    const unrelatedCreate = await settledWithin(
      new SchoolBusiness().createschool(
        { schoolname: `${SCHOOL_PREFIX}b new ${otherId.slice(0, 8)}`, countryid: country.countryid, curriculums: [], organisationid: mainOrg } as never,
        staff,
        platform,
      ),
      3000,
    );
    check("B: a rename of an UNRELATED school is not blocked by the open by-name writer", unrelatedRename === "ok");
    check("B: a school create is not blocked by the open by-name writer", unrelatedCreate === "ok");
    await txB.commit();

    // C. a school moved to another country while its organisation drops that country.
    const country2 = uuid();
    await db.query("INSERT INTO countries (countryid, countryname) VALUES (?, ?)", { replacements: [country2, `${PREFIX} country ${country2.slice(0, 8)}`] });
    const orgId = uuid();
    await db.query(
      "INSERT INTO organisations (organisationid, organisationname, organisationcode, organisationshortname, organisationpreset) VALUES (?, ?, ?, 'ZR', 'schoolnetwork')",
      { replacements: [orgId, `${PREFIX} org ${orgId.slice(0, 8)}`, `${PREFIX}${orgId.slice(0, 8)}`] },
    );
    for (const c of [country.countryid, country2]) {
      await db.query("INSERT INTO organisationcountry (organisationcountryid, organisationid, countryid) VALUES (?, ?, ?)", { replacements: [uuid(), orgId, c] });
    }
    const orgSchool = uuid();
    const orgSchoolName = `${SCHOOL_PREFIX}c ${orgSchool.slice(0, 8)}`;
    await db.query("INSERT INTO schools (schoolid, schoolname, isdeleted, curriculums, countryid, organisationid) VALUES (?, ?, 0, JSON_ARRAY(), ?, ?)", {
      replacements: [orgSchool, orgSchoolName, country.countryid, orgId],
    });
    const txL = await begin();
    await createLearner(`${PREFIX}C`, txL, orgSchoolName, orgSchool);
    await txL.commit();
    const holdC = await begin();
    await db.query("SELECT studentid FROM students WHERE schoolid = ? FOR UPDATE", { replacements: [orgSchool], transaction: holdC });
    // the rename (also moves the school to country2) passes its country check, then pauses at its cascade
    const moving = settledWithin(editSchool(orgSchool, `${orgSchoolName} moved`, country2), 15000);
    await sleep(1500);
    // the organisation now drops country2
    let orgOutcome: "ok" | "failed" | undefined;
    const dropping = new OrganisationBusiness()
      .updateorganisation(orgId, { organisationname: `${PREFIX} org ${orgId.slice(0, 8)}`, organisationshortname: "ZR" }, [country.countryid], staff)
      .then(() => { orgOutcome = "ok"; }, () => { orgOutcome = "failed"; });
    await sleep(1500);
    check("C: the organisation's country edit waits for the school write that is in progress", orgOutcome === undefined);
    await holdC.commit();
    const moved = await moving;
    await dropping;
    const [linkedAtEnd] = await select<{ n: number }>(
      "SELECT COUNT(*) AS n FROM organisationcountry oc JOIN schools s ON s.organisationid = oc.organisationid AND s.countryid = oc.countryid WHERE s.schoolid = ?",
      [orgSchool],
    );
    check("C: the school does not end in a country its organisation is not linked to", linkedAtEnd.n === 1);
    check("C: exactly one of the two writes won (the other was refused), none half-applied", (moved === "ok") !== (orgOutcome === "ok"));
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
