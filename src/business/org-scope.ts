import { Model, ModelStatic, Op, Transaction, WhereOptions, FindOptions } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { organisations } from "src/models/data-models/organisations";
import { ErrorCode } from "src/models/enums/errorcode.enum";

/**
 * Who a staff request acts for, and how a table that carries `organisationid`
 * is limited to it.
 *
 * A request's SCOPE comes from the validated staff token (`@Org()`), never from
 * the request itself:
 *  - platform: a platform user who is not acting as an organisation
 *    (`isplatform` true, `organisationid` null). Sees every organisation.
 *  - organisation X: a user of X (`isplatform` false, `organisationid` X), or a
 *    platform user acting as X (`isplatform` true, `organisationid` X). The two
 *    are filtered exactly alike.
 * A token that is neither (not platform and no organisation) has no scope, and
 * a missing context has none either: both fail closed with 403.
 */
export type Scope =
  | { kind: "platform" }
  | { kind: "organisation"; organisationid: string };

export const scopeOf = (org: OrgContext | undefined | null): Scope => {
  if (org && typeof org === "object") {
    if (typeof org.organisationid === "string" && org.organisationid.length > 0) {
      return { kind: "organisation", organisationid: org.organisationid };
    }
    if (org.organisationid === null && org.isplatform === true) {
      return { kind: "platform" };
    }
  }
  throw new ApiError(ErrorCode.NOT_ALLOWED);
};

/** Is the caller's scope the whole platform (not limited to one organisation)? */
export const isPlatformScope = (org: OrgContext | undefined | null): boolean =>
  scopeOf(org).kind === "platform";

/**
 * A where-fragment limiting a table that has an `organisationid` column to the
 * caller's scope: nothing is added for the platform scope; for organisation X
 * it is `organisationid = X`, which excludes every row with no organisation
 * (platform accounts) as well as other organisations' rows. Throws (403) when
 * the caller context is missing or has no scope.
 *
 * Combine it with other conditions through `Op.and` (see `andOwned`), never by
 * spreading it next to a `where` that may already have an `organisationid` or
 * an `Op.and` key.
 */
export const ownedWhere = (org: OrgContext | undefined | null): WhereOptions => {
  const scope = scopeOf(org);
  return scope.kind === "platform" ? {} : { organisationid: scope.organisationid };
};

/** `where` AND the caller's scope. */
export const andOwned = (where: WhereOptions | undefined, org: OrgContext | undefined | null): WhereOptions => ({
  [Op.and]: [where ?? {}, ownedWhere(org)],
});

/** The error a route answers with for a row that is not there or not the caller's. */
export const notFoundError = (message = "That doesn't exist.") =>
  new ApiError(ErrorCode.NOT_FOUND, message);

/**
 * Reads one row by primary key within the caller's scope. A row that does not
 * exist, belongs to another organisation, or has no organisation (for an
 * organisation caller) is reported identically: the same not-found the route
 * already answers with for a missing id (`options.notFound`, 404 by default).
 * `options` are the usual find options (transaction, lock, include, ...); a
 * `where` in them is kept and ANDed with the key and the scope.
 */
export const findOwned = async <M extends Model>(
  model: ModelStatic<M>,
  id: string,
  org: OrgContext | undefined | null,
  options: Omit<FindOptions, "where"> & { where?: WhereOptions; notFound?: () => Error } = {},
): Promise<M> => {
  const { where, notFound, ...rest } = options;
  const owned = ownedWhere(org); // throws first when there is no scope
  const key = model.primaryKeyAttribute;
  if (!key) {
    // An uninitialised model has no key to look up by: never fall back to an
    // unscoped or keyless query.
    throw new Error("findOwned: the model has no primary key attribute");
  }
  const row = await model.findOne({
    ...rest,
    where: {
      [Op.and]: [where ?? {}, { [key]: id }, owned],
    },
  } as FindOptions);
  if (!row) {
    throw (notFound ?? notFoundError)();
  }
  return row;
};

/**
 * Inside a transaction: read the organisation row under a shared lock and
 * return it only if it exists and is not deleted, else null. The foreign key on
 * `organisationid` does not know about `isdeleted`, so every write that sets an
 * organisation on a row checks it here; the lock makes the check hold until
 * the transaction ends (deleting an organisation takes an exclusive lock on the
 * same row).
 */
export const lockLiveOrganisation = (organisationid: string, transaction: Transaction) =>
  organisations.findOne({
    where: { organisationid, isdeleted: false },
    transaction,
    lock: Transaction.LOCK.SHARE,
  });
