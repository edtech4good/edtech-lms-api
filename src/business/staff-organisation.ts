import { Transaction } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { lockLiveOrganisation, scopeOf } from "./org-scope";

/**
 * Which organisation a staff account belongs to, and who may set it.
 *
 * Every staff account that is not a platform account belongs to exactly one
 * organisation. A platform account (one that holds Super Admin) has none. The
 * organisation of a new account comes from the caller's scope, never from a
 * default: an organisation's staff create accounts in their own organisation,
 * and only a platform caller (not acting as an organisation) chooses one. An
 * account never holds Super Admin and an organisation at once; that half of
 * the rule is enforced where roles are set (`assertMaySetRoles`), with the
 * resulting organisation passed in.
 */

const invalid = (field: string, message: string) =>
  new ApiError(ErrorCode.INVALID_INPUT, "Some of the information isn't valid.", {
    fields: [{ field, message }],
  });

/**
 * The organisation a NEW account gets, with the organisation row locked and
 * checked live inside the caller's transaction.
 *
 *  - Caller scope organisation X: X. A requested value, if one was sent, must
 *    equal X, else 403 (an organisation's staff do not choose).
 *  - Caller scope platform: an account with Super Admin has none (the request
 *    must send none or null, else 400); any other account must name an
 *    organisation that exists and is not deleted (else 400).
 */
export const organisationForNewAccount = async (opts: {
  org: OrgContext;
  requested: string | null | undefined;
  holdsSuperAdmin: boolean;
  transaction: Transaction;
}): Promise<string | null> => {
  const scope = scopeOf(opts.org);
  if (scope.kind === "organisation") {
    if (opts.requested !== undefined && opts.requested !== scope.organisationid) {
      throw new ApiError(ErrorCode.NOT_ALLOWED);
    }
    if (!(await lockLiveOrganisation(scope.organisationid, opts.transaction))) {
      throw new ApiError(ErrorCode.NOT_ALLOWED);
    }
    return scope.organisationid;
  }
  if (opts.holdsSuperAdmin) {
    if (opts.requested !== undefined && opts.requested !== null) {
      throw invalid("organisationid", "A Super Admin account has no organisation.");
    }
    return null;
  }
  if (typeof opts.requested !== "string") {
    throw invalid("organisationid", "Choose the organisation this account belongs to.");
  }
  if (!(await lockLiveOrganisation(opts.requested, opts.transaction))) {
    throw invalid("organisationid", "Choose an organisation that exists.");
  }
  return opts.requested;
};

/**
 * The organisation an account has AFTER an update or role change. Only a
 * platform caller may change it: any other caller sending the key is refused
 * (403). Moving an account into an organisation needs that organisation to
 * exist and not be deleted (row locked here); clearing it needs the resulting
 * role set to include Super Admin (else 400). An account that holds Super Admin
 * and has no organisation cannot be left with neither: removing Super Admin
 * from a platform account requires giving it an organisation in the same
 * request (400).
 *
 * `changed` says whether the account was moved, so the caller can end its
 * sessions. (The Super Admin half, "not with an organisation", is applied by
 * `assertMaySetRoles` with the returned value.)
 */
export const organisationAfterChange = async (opts: {
  org: OrgContext;
  requested: string | null | undefined;
  current: string | null;
  hadSuperAdmin: boolean;
  willHoldSuperAdmin: boolean;
  transaction: Transaction;
}): Promise<{ organisationid: string | null; changed: boolean }> => {
  const scope = scopeOf(opts.org);
  if (opts.requested !== undefined && scope.kind !== "platform") {
    throw new ApiError(ErrorCode.NOT_ALLOWED);
  }
  const resulting = opts.requested === undefined ? opts.current : opts.requested;
  const changed = resulting !== opts.current;
  if (changed) {
    if (resulting === null) {
      if (!opts.willHoldSuperAdmin) {
        throw invalid("organisationid", "An account without an organisation must hold Super Admin.");
      }
    } else if (!opts.willHoldSuperAdmin) {
      if (!(await lockLiveOrganisation(resulting, opts.transaction))) {
        throw invalid("organisationid", "Choose an organisation that exists.");
      }
    }
    // (an account that will hold Super Admin cannot be moved into an
    // organisation: assertMaySetRoles refuses it with the resulting value)
  }
  if (opts.hadSuperAdmin && opts.current === null && resulting === null && !opts.willHoldSuperAdmin) {
    throw invalid("organisationid", "Give this account an organisation to remove Super Admin from it.");
  }
  return { organisationid: resulting, changed };
};
