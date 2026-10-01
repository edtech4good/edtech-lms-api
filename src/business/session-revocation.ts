import { Transaction } from "sequelize";
import { OrgContext } from "../decorators/org.decorator";
import { ApiError } from "../models/ApiError";
import { ErrorCode } from "../models/enums/errorcode.enum";
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

/**
 * The rule for who may change the Super Admin role, applied wherever a user's
 * roles are set (create, update, bind, delete). It is what keeps the platform
 * a closed group: `isplatform` is "no organisation AND Super Admin", so
 * whoever can hand out Super Admin can mint platform accounts.
 *
 *  - The new role set includes Super Admin (granting it, or keeping it while
 *    editing): the caller must be a platform user, and the target must have no
 *    organisation, whoever the caller is.
 *  - The target holds Super Admin now and the new set does not (removing it,
 *    including by clearing every role): the caller must be a platform user.
 *  - Anything else is not about Super Admin and is not restricted here.
 *
 * Refused with 403 (NOT_ALLOWED) before anything is written. A missing caller
 * context counts as not platform.
 */
export const assertMaySetRoles = (opts: {
  caller: OrgContext | undefined;
  hadSuperAdmin: boolean;
  newRoleIds: ReadonlyArray<string>;
  targetOrganisationid: string | null | undefined;
}) => {
  const callerIsPlatform = opts.caller?.isplatform === true;
  const willHold = opts.newRoleIds.includes(Role.superadmin);
  if (willHold) {
    if (!callerIsPlatform || (opts.targetOrganisationid ?? null) !== null) {
      throw new ApiError(
        ErrorCode.NOT_ALLOWED,
        "The Super Admin role can only be given to a platform account, by a platform user.",
      );
    }
    return;
  }
  if (opts.hadSuperAdmin && !callerIsPlatform) {
    throw new ApiError(
      ErrorCode.NOT_ALLOWED,
      "Only a platform user can remove the Super Admin role.",
    );
  }
};
