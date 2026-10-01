import { Transaction } from "sequelize";
import { lmsusers } from "../models/data-models/lmsusers";
import { tokens } from "../models/data-models/tokens";
import { Role } from "../models/enums";

/**
 * Ends every session of one staff user: deletes their rows in `tokens`
 * (access, refresh and the single-use tokens). Every request checks that table,
 * so their existing tokens stop working at once and they sign in again.
 */
export const revokeStaffSessions = (lmsuserid: string, transaction?: Transaction) =>
  tokens.destroy({ where: { lmsuserid }, transaction });

/** Does this user hold the Super Admin role right now (read inside the transaction)? */
export const holdsSuperAdmin = async (user: lmsusers, transaction?: Transaction) =>
  (await user.getRoles({ transaction })).some((role) => role.roleid === Role.superadmin);

/**
 * Call after a user's roles have been replaced. If they held Super Admin
 * before (`hadSuperAdmin`, read before the change) and the new set no longer
 * includes it, their sessions end in the same transaction: a token minted while
 * they were Super Admin carries the wildcard permission and the platform claim,
 * and must not outlive the role.
 */
export const revokeIfSuperAdminRemoved = async (
  lmsuserid: string,
  hadSuperAdmin: boolean,
  newRoleIds: ReadonlyArray<string>,
  transaction?: Transaction,
) => {
  if (hadSuperAdmin && !newRoleIds.includes(Role.superadmin)) {
    await revokeStaffSessions(lmsuserid, transaction);
  }
};
