/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Sets a known password on the seeded superadmin (see 20230306155558-superadmin)
 * so you can log in to a freshly migrated local database.
 *
 * Usage: ALLOW_LOCAL_DEV_SEED=true npm run seed:local
 *        ALLOW_LOCAL_DEV_SEED=true SUPERADMIN_PASSWORD='something-else' npm run seed:local
 *
 * This used to be a migration (20260407120000-superadmin-local-dev-password).
 * That was wrong: `npm run db:migrate` is the same command in every
 * environment, so running it against production reset the superadmin password
 * to a value published in LOCAL_DEVELOPMENT.md. Dev credentials belong behind
 * an explicit opt-in command, guarded by ALLOW_LOCAL_DEV_SEED=true.
 *
 * It also creates the two organisations the other local seeds put their rows in
 * (`edtech4good` and `miv`, each linked to Cambodia: see lib/seed-organisations.js),
 * so a fresh local database has them. The Super Admin belongs to NO organisation:
 * it is the platform's own account. Every other seeded school, login and piece of
 * content is created by `seed:demo` / `seed:dcrs`, inside its organisation. Each of
 * those seeds also creates the organisation it needs, so they run in any order.
 *
 * Stored value is bcrypt(md5(password)), matching hashPassword() in
 * src/services/password.service.ts. That file's verifyPassword() rejects
 * anything that is not a bcrypt hash (must start with `$2`), so a bare MD5
 * write would seed an account that cannot log in.
 */
const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const bcryptjs = require("bcryptjs");
const md5 = require("crypto-js/md5");
const { ORGANISATIONS, ensureOrganisation } = require("./lib/seed-organisations");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SUPERADMIN_USER_ID = "5ec8814c-4390-40e3-8d93-828adca9aa08";
const DEFAULT_PASSWORD = "LocalDev_Superadmin1";

async function main() {
  if (process.env.ALLOW_LOCAL_DEV_SEED !== "true") {
    console.error("Refusing to run: set ALLOW_LOCAL_DEV_SEED=true to seed LOCAL DEV credentials. This script overwrites the superadmin password with the published dev value and must never run outside a local dev database.");
    process.exit(1);
  }

  const host = process.env.DB_HOST || "127.0.0.1";
  const port = parseInt(String(process.env.DB_PORT || "3306"), 10);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME || "edtech_lms";

  if (!user || password === undefined) {
    console.error("Missing DB_USER or DB_PASSWORD in edtech-lms-api/.env");
    process.exit(1);
  }

  const plaintext = process.env.SUPERADMIN_PASSWORD || DEFAULT_PASSWORD;
  // Stored form must be bcrypt(md5(password)), matching
  // src/services/password.service.ts hashPassword() exactly (same bcryptjs and
  // crypto-js/md5 packages, same BCRYPT_ROUNDS) — that file's verifyPassword()
  // now rejects a bare md5 hash, so a raw md5 constant here seeds an account
  // that can never log in.
  const hash = bcryptjs.hashSync(md5(plaintext).toString(), 10);

  const conn = await mysql.createConnection({ host, port, user, password, database });
  try {
    const [result] = await conn.execute(
      "UPDATE `lmsusers` SET `lmsuserpasswordhash` = ? WHERE `lmsuserid` = ?",
      [hash, SUPERADMIN_USER_ID],
    );
    if (result.affectedRows === 0) {
      console.error(
        `No lmsusers row with id ${SUPERADMIN_USER_ID}. Run 'npm run db:migrate' first.`,
      );
      process.exit(1);
    }
    for (const code of Object.keys(ORGANISATIONS)) {
      await ensureOrganisation(conn, code);
    }
    console.log(`Organisations ready: ${Object.values(ORGANISATIONS).map((o) => `${o.name} (${o.code})`).join(", ")}.`);
    console.log(`Superadmin password set to: ${plaintext}`);
    console.log("Local development only. Never run this against a real deployment.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
