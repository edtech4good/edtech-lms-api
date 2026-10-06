/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * The two organisations the local development seeds (`seed:local`, `seed:demo`,
 * `seed:dcrs`) put their rows in, and the one place that creates them.
 *
 * Every school and every piece of content belongs to an organisation (the
 * owner columns are required), so each seed makes sure the organisation it
 * writes into exists before it inserts anything, whichever seed runs first.
 * The organisations here are the ones the local backfill mapping names; the
 * platform's own account (the seeded Super Admin) belongs to none, by design.
 *
 *  - `edtech4good`: the demo content and its demo school;
 *  - `miv`: the DCRS content and its school (a corporate-themed organisation).
 *
 * `ensureOrganisation` looks the organisation up by its CODE first and uses the
 * id it finds, so a database that already has the organisation (the backfill
 * gives its own ids) is reused, never duplicated. Only when the code is not
 * there is a row inserted, with the fixed id below. Its country link is added
 * the same way. Nothing is ever overwritten.
 */
const COUNTRY = { id: "b0000000-0000-4000-8000-000000000001", name: "Cambodia" };

const ORGANISATIONS = {
  edtech4good: {
    id: "a0000000-0000-4000-8000-000000000001",
    linkid: "a0000000-0000-4000-8000-000000000003",
    code: "edtech4good",
    name: "EdTech for Good",
    shortname: "EG",
    preset: "schoolnetwork",
    uitheme: "kids",
  },
  miv: {
    id: "a0000000-0000-4000-8000-000000000002",
    linkid: "a0000000-0000-4000-8000-000000000004",
    code: "miv",
    name: "Mekong Inclusive Ventures",
    shortname: "MIV",
    preset: "company",
    uitheme: "corporate",
  },
};

/** `conn` is a mysql2/promise connection. Returns the organisation's id. */
async function ensureOrganisation(conn, code) {
  const org = ORGANISATIONS[code];
  if (!org) {
    throw new Error(`Unknown seed organisation: ${code}`);
  }
  // The country every local organisation is linked to (the demo and DCRS seeds share this row).
  await conn.execute(`INSERT IGNORE INTO countries (countryid, countryname, isdeleted) VALUES (?,?,0)`, [
    COUNTRY.id,
    COUNTRY.name,
  ]);
  let [rows] = await conn.execute(`SELECT organisationid FROM organisations WHERE organisationcode = ? LIMIT 1`, [code]);
  if (rows.length === 0) {
    await conn.execute(
      `INSERT INTO organisations (organisationid, organisationname, organisationcode, organisationshortname, organisationpreset, uitheme)
       VALUES (?,?,?,?,?,?)`,
      [org.id, org.name, org.code, org.shortname, org.preset, org.uitheme],
    );
    [rows] = await conn.execute(`SELECT organisationid FROM organisations WHERE organisationcode = ? LIMIT 1`, [code]);
  }
  const organisationid = rows[0].organisationid;
  const [links] = await conn.execute(
    `SELECT 1 FROM organisationcountry WHERE organisationid = ? AND countryid = ? LIMIT 1`,
    [organisationid, COUNTRY.id],
  );
  if (links.length === 0) {
    await conn.execute(`INSERT INTO organisationcountry (organisationcountryid, organisationid, countryid) VALUES (?,?,?)`, [
      org.linkid,
      organisationid,
      COUNTRY.id,
    ]);
  }
  return organisationid;
}

/**
 * Seeds insert with INSERT IGNORE, which turns a refused row (a missing parent, a NULL in a
 * required column) into a silent skip. So after inserting, each seed fills an owner that is
 * still NULL on its own rows (never overwriting one: a server whose rows already belong to
 * another organisation keeps them) and then checks that every row it meant to write is
 * there and has an owner. Throws, naming the table, when not.
 *
 * `expected`: [{ table, key, ids, column, value }]: `ids` are the seeded primary keys,
 * `value` what a NULL `column` is filled with.
 */
async function fillAndVerifyOwners(conn, expected) {
  for (const { table, key, ids, column, value } of expected) {
    for (const id of ids) {
      await conn.execute(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${key}\` = ? AND \`${column}\` IS NULL`, [value, id]);
    }
    const marks = ids.map(() => "?").join(",");
    const [rows] = await conn.execute(
      `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${key}\` IN (${marks}) AND \`${column}\` IS NOT NULL`,
      ids,
    );
    if (Number(rows[0].n) !== ids.length) {
      throw new Error(
        `Seed check failed: ${table} should hold ${ids.length} seeded row(s) with ${column} set, found ${rows[0].n}.`,
      );
    }
  }
}

module.exports = { ORGANISATIONS, COUNTRY, ensureOrganisation, fillAndVerifyOwners };
