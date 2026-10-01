import { Op, Transaction } from "sequelize";
import { OrgContext } from "../decorators/org.decorator";
import { ApiError } from "../models/ApiError";
import { ErrorCode } from "../models/enums/errorcode.enum";
import { lmsusers } from "../models/data-models/lmsusers";
import { roles } from "../models/data-models/roles";
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
 * Turns the role ids a request asked for into the role ROWS they name, read
 * from the database inside the caller's transaction. The Super Admin rule is
 * applied to these rows and to nothing else, so a request string can never reach
 * it: `roles.roleid` is compared case-insensitively (and ignoring trailing
 * spaces) by MySQL, so a lookup can match a row for an id that is not spelled
 * the way the row spells it.
 *
 * Refuses with 400 (and the caller writes nothing) unless the request is an
 * array of strings, each given once, and EVERY one is exactly the id of an
 * existing role. An id that only matches by collation is not accepted.
 */
export const resolveRequestedRoles = async (
  requested: unknown,
  field: string,
  transaction?: Transaction,
): Promise<roles[]> => {
  const invalid = () =>
    new ApiError(ErrorCode.INVALID_INPUT, "Some of the information isn't valid.", {
      fields: [{ field, message: "Choose roles that exist, each only once." }],
    });
  if (!Array.isArray(requested) || requested.some((id) => typeof id !== "string")) {
    throw invalid();
  }
  const ids = requested as string[];
  if (new Set(ids).size !== ids.length) {
    throw invalid();
  }
  if (ids.length === 0) {
    return [];
  }
  const found = await roles.findAll({ where: { roleid: { [Op.in]: ids } }, transaction });
  const byId = new Map(found.map((row) => [row.roleid, row]));
  const resolved = ids.map((id) => byId.get(id));
  if (resolved.some((row) => row === undefined)) {
    throw invalid();
  }
  return resolved as roles[];
};

/**
 * Who may change an account that holds Super Admin. A caller who is not a
 * platform user may not modify one in any way (its email, password, scope,
 * roles, enabled state), whatever fields the request changes: such an account
 * can sign in as the platform. Refused with 403 before anything is written.
 * Apply it to every route that writes another user's `lmsusers` row, roles or
 * sessions.
 */
export const assertMayModifyUser = (opts: {
  caller: OrgContext | undefined;
  targetHoldsSuperAdmin: boolean;
}) => {
  if (opts.targetHoldsSuperAdmin && opts.caller?.isplatform !== true) {
    throw new ApiError(
      ErrorCode.NOT_ALLOWED,
      "Only a platform user can change a Super Admin account.",
    );
  }
};

/** `assertMayModifyUser` for a caller that has only the target's id: loads the user and its roles. */
export const assertMayModifyUserId = async (
  lmsuserid: string,
  caller: OrgContext | undefined,
  transaction?: Transaction,
) => {
  const user = await lmsusers.findOne({ where: { lmsuserid }, transaction });
  if (user) {
    assertMayModifyUser({
      caller,
      targetHoldsSuperAdmin: await holdsSuperAdmin(user, transaction),
    });
  }
};

/**
 * The rule for who may change the Super Admin role, applied wherever a user's
 * roles are set (create, update, bind, delete). It is what keeps the platform
 * a closed group: `isplatform` is "no organisation AND Super Admin", so
 * whoever can hand out Super Admin can mint platform accounts.
 *
 * It takes role ROWS (from `resolveRequestedRoles`), never request strings, and
 * compares the canonical ids stored in the database with the canonical Super
 * Admin id.
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
  newRoles: ReadonlyArray<roles>;
  targetOrganisationid: string | null | undefined;
}) => {
  const callerIsPlatform = opts.caller?.isplatform === true;
  const willHold = opts.newRoles.some((role) => role.roleid === Role.superadmin);
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
