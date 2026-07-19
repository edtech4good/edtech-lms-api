import { QueryInterface, QueryTypes, Transaction } from "sequelize";
import bcryptjs from "bcryptjs";

/**
 * Rewrap every stored unsalted-MD5 password hash as `bcrypt(md5hash)`.
 *
 * We hold `md5(password)` already — it *is* the stored value — so this needs no
 * user's password. Safe to run only AFTER both APIs are on the dual-mode verify
 * (they accept legacy md5 rows too), which is why it's a separate migration, not
 * bundled with a schema change. See docs/password-hashing-bcrypt-plan.md.
 *
 * Idempotent: an MD5 hex hash is exactly 32 chars; a bcrypt hash is 60 chars
 * starting `$2`. We only touch the 32-char rows, so re-running rewraps nothing.
 */
const BCRYPT_ROUNDS = 10;

const TARGETS = [
  { table: "lmsusers", pk: "lmsuserid", col: "lmsuserpasswordhash" },
  { table: "schoolusers", pk: "schooluserid", col: "schooluserpasswordhash" },
];

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      for (const { table, pk, col } of TARGETS) {
        const rows = await queryInterface.sequelize.query<Record<string, string>>(
          `SELECT ${pk} AS id, ${col} AS hash FROM ${table} ` +
            `WHERE ${col} IS NOT NULL AND CHAR_LENGTH(${col}) = 32 AND ${col} NOT LIKE '$2%'`,
          { type: QueryTypes.SELECT, transaction },
        );
        for (const row of rows) {
          const wrapped = bcryptjs.hashSync(row.hash, BCRYPT_ROUNDS);
          await queryInterface.sequelize.query(
            `UPDATE ${table} SET ${col} = :wrapped WHERE ${pk} = :id`,
            { replacements: { wrapped, id: row.id }, type: QueryTypes.UPDATE, transaction },
          );
        }
      }
    }),

  // Irreversible by construction: bcrypt(md5) cannot be unwound to md5. The
  // dual-mode verify keeps rewrapped rows working, so there is nothing to undo.
  down: (): Promise<void> => Promise.resolve(),
};
