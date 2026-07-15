import { QueryInterface } from "sequelize";

/**
 * Sets a known password for the seeded superadmin (see 20230306155558-superadmin).
 * Plaintext (local / dev only): LocalDev_Superadmin1
 * Hash: MD5 via crypto-js, same as AuthBusiness.login
 *
 * Documented in LOCAL_DEVELOPMENT.md — change or remove in production deployments.
 */
const SUPERADMIN_USER_ID = "5ec8814c-4390-40e3-8d93-828adca9aa08";
const NEW_HASH = "ab6295f119d1b922e420e0bdf118196e";
const PREVIOUS_HASH = "36237ee4e2207807adde67236d2dc7bd";

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `UPDATE \`lmsusers\` SET \`lmsuserpasswordhash\` = '${NEW_HASH}' WHERE \`lmsuserid\` = '${SUPERADMIN_USER_ID}'`,
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `UPDATE \`lmsusers\` SET \`lmsuserpasswordhash\` = '${PREVIOUS_HASH}' WHERE \`lmsuserid\` = '${SUPERADMIN_USER_ID}'`,
    );
  },
};
