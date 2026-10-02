import { Op, Transaction } from "sequelize";
import { OrgContext } from "../decorators/org.decorator";
import { ApiError } from "../models/ApiError";
import { ErrorCode } from "../models/enums/errorcode.enum";
import { lmsusers } from "../models/data-models/lmsusers";
import { roles } from "../models/data-models/roles";
import { tokens } from "../models/data-models/tokens";
import { Role } from "../models/enums";
import { permissions } from "../models/data-models/permissions";
import { SUPERADMIN } from "../models/enums/permissions.enum";

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

/** The ids of the roles an account holds right now (read inside the transaction). */
export const heldRoleIds = async (user: lmsusers, transaction?: Transaction): Promise<string[]> =>
  (await user.getRoles({ transaction })).map((role) => role.roleid);

/** Do two lists of role ids name the same SET of roles (order and repeats do not matter)? */
export const sameRoleSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
};

/**
 * Call after a user's roles have been replaced. When the SET of roles changed
 * (`before` was read before the change), the account's sessions end in the same
 * transaction: a token carries the permissions of the roles held when it was
 * minted, so a demoted account must not keep its old permissions until the token
 * expires. An edit that leaves the set the same ends nothing. Returns whether the
 * set changed.
 */
export const revokeIfRolesChanged = async (
  lmsuserid: string,
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
  transaction?: Transaction,
): Promise<boolean> => {
  const changed = !sameRoleSet(before, after);
  if (changed) {
    await revokeStaffSessions(lmsuserid, transaction);
  }
  return changed;
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


/**
 * The built-in roles an organisation's staff may add to an account. Every other
 * built-in role (Admin, User, API Key, Super Admin, and any added to the `Role`
 * enum later) is named in route guards by its identity, so its reach is wider
 * than its permissions say and an organisation's staff cannot hand it out.
 */
const BUILT_IN_ASSIGNABLE_BY_ORGANISATION: ReadonlyArray<string> = [Role.organisationadmin, Role.teacher];

/** Is this role one of the built-in roles (derived from the `Role` enum, never a second list)? */
const isBuiltInRole = (roleid: string) => (Object.values(Role) as string[]).includes(roleid);

/** Is the caller a platform user who is not acting as an organisation? */
const isUnscopedPlatform = (caller: OrgContext | undefined) =>
  caller?.isplatform === true && caller.organisationid === null;

/**
 * Of these role ROWS, which could the caller add to an account? Reads each
 * role's grants from the database (inside `transaction` when given). A platform
 * caller who is not acting as an organisation may add any; everyone else (an
 * organisation's staff, a platform user acting as one, a missing context) may
 * add a role only when
 *  1. it is not a built-in role, or it is one built in for organisations
 *     (Organisation Admin, Teacher); AND
 *  2. every permission it holds is one the caller holds now (the permissions
 *     the validated token carries; the `superadmin` wildcard holds them all).
 * Rule 2 is what bounds custom roles; it applies to the built-in two as well.
 */
export const rolesCallerMayAdd = async (
  caller: OrgContext | undefined,
  candidates: ReadonlyArray<roles>,
  transaction?: Transaction,
): Promise<Set<string>> => {
  if (isUnscopedPlatform(caller)) {
    return new Set(candidates.map((r) => r.roleid));
  }
  const held = new Set(caller?.permissions ?? []);
  const holdsAll = held.has(SUPERADMIN);
  const eligible = candidates.filter(
    (r) => !isBuiltInRole(r.roleid) || BUILT_IN_ASSIGNABLE_BY_ORGANISATION.includes(r.roleid),
  );
  if (eligible.length === 0) {
    return new Set();
  }
  const withGrants = await roles.findAll({
    where: { roleid: { [Op.in]: eligible.map((r) => r.roleid) } },
    include: [{ model: permissions, attributes: ["permissionname"], through: { attributes: [] } }],
    transaction,
  });
  const allowed = new Set<string>();
  for (const row of withGrants) {
    // Compare the stored id exactly: the database matches ids without regard to case.
    if (!eligible.some((r) => r.roleid === row.roleid)) continue;
    if (holdsAll || (row.permissions ?? []).every((p) => held.has(p.permissionname))) {
      allowed.add(row.roleid);
    }
  }
  return allowed;
};

/**
 * The rule for which roles a caller in an organisation's scope may ADD to an
 * account (create, update, bind, to itself or to others alike): see
 * `rolesCallerMayAdd`. "Add" means in the new set and not in the account's
 * current set (`currentRoleIds`; empty on create). Roles the account already
 * holds and keeps are not re-checked, and removing a role is not restricted
 * here (the Super Admin rules in `assertMaySetRoles` still apply). Refused with
 * 403 (NOT_ALLOWED) before anything is written. Takes resolved role ROWS.
 * A platform caller not acting as an organisation is unchanged.
 */
export const assertMayAddRoles = async (opts: {
  caller: OrgContext | undefined;
  currentRoleIds: ReadonlyArray<string>;
  newRoles: ReadonlyArray<roles>;
  transaction?: Transaction;
}) => {
  if (isUnscopedPlatform(opts.caller)) {
    return;
  }
  const current = new Set(opts.currentRoleIds);
  const added = opts.newRoles.filter((r) => !current.has(r.roleid));
  if (added.length === 0) {
    return;
  }
  const allowed = await rolesCallerMayAdd(opts.caller, added, opts.transaction);
  if (added.some((r) => !allowed.has(r.roleid))) {
    throw new ApiError(ErrorCode.NOT_ALLOWED, "You can't give a role that has more access than your own.");
  }
};


/**
 * Is this account within the caller's reach? It is when every role it holds is
 * one the caller could add (`rolesCallerMayAdd`); an account holding any other
 * role is WIDER than the caller. A platform caller who is not acting as an
 * organisation reaches everyone, and an account editing itself is always within
 * its own reach. (An account that holds no role is within reach.)
 */
export const isWithinReach = async (opts: {
  caller: OrgContext | undefined;
  heldRoles: ReadonlyArray<roles>;
  isSelf: boolean;
  transaction?: Transaction;
}): Promise<boolean> => {
  if (opts.isSelf || isUnscopedPlatform(opts.caller)) {
    return true;
  }
  const allowed = await rolesCallerMayAdd(opts.caller, opts.heldRoles, opts.transaction);
  return opts.heldRoles.every((r) => allowed.has(r.roleid));
};

/**
 * A caller in an organisation's scope may not change the SIGN-IN IDENTITY (the
 * email, which is also where a reset or verification mail goes) or the PASSWORD
 * of an account that is wider than the caller: the caller could then sign in as
 * that account and hold the reach the caller itself may not hand out. Refused
 * with 403 before anything is written. Anything else about such an account
 * (removing roles, disabling it, an edit that changes neither) stays allowed.
 */
export const assertMayChangeSignIn = async (opts: {
  caller: OrgContext | undefined;
  heldRoles: ReadonlyArray<roles>;
  isSelf: boolean;
  changesEmail: boolean;
  changesPassword: boolean;
  transaction?: Transaction;
}) => {
  if (!opts.changesEmail && !opts.changesPassword) {
    return;
  }
  if (!(await isWithinReach(opts))) {
    throw new ApiError(
      ErrorCode.NOT_ALLOWED,
      "You can't change the sign-in details of an account that has more access than your own.",
    );
  }
};

/**
 * Ends the sessions of every account that holds the role (inside `transaction`).
 * A token carries the permissions the role had when it was minted, so a role
 * whose permissions change must reach its holders now.
 */
export const revokeRoleHolders = async (roleid: string, transaction?: Transaction) => {
  const holders = await lmsusers.findAll({
    attributes: ["lmsuserid"],
    include: [{ model: roles, attributes: [], where: { roleid }, required: true }],
    transaction,
  });
  const ids = holders.map((u) => u.lmsuserid);
  if (ids.length > 0) {
    await tokens.destroy({ where: { lmsuserid: { [Op.in]: ids } }, transaction });
  }
  return ids;
};
