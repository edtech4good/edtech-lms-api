import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { organisations } from "src/models/data-models/organisations";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { scopeOf } from "./org-scope";

/**
 * What a content sync (`GET sync/content`, `POST sync/cloud`) is for.
 *
 * Content is exported and pushed one organisation at a time (format 3). Whose it
 * is comes from the caller's token: an organisation's staff, and a platform user
 * acting as an organisation, sync that organisation. A platform user who is not
 * acting must say which one, with `organisationid`, and gets the same 404 for an
 * organisation that is not there as for one that is. Naming an organisation
 * other than the one the token acts in is the same 404, never a way into it.
 *
 * There is no other format: the whole-platform file (format 2) is retired, and a
 * request that names a `format` at all is refused (see `refuseRetiredFormat`).
 */
export interface SyncRequest {
  organisationid?: unknown;
}

/** What a content sync is for: the one organisation whose content is exported or pushed (format 3). */
export interface SyncPlan {
  organisation: organisations;
}

const invalid = (field: string, message: string) =>
  new ApiError(ErrorCode.INVALID_INPUT, message, { fields: [{ field, message }] });

const organisationNotFound = () => new ApiError(ErrorCode.NOT_FOUND, "That organisation doesn't exist.");

const parseOrganisationId = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 36) {
    throw invalid("organisationid", "organisationid must be an organisation's id.");
  }
  return value.trim();
};

/** The live organisation this sync is for (see above). */
export const resolveSyncOrganisation = async (org: OrgContext, named: unknown): Promise<organisations> => {
  const scope = scopeOf(org); // throws first when there is no scope
  const given = parseOrganisationId(named);
  let organisationid: string;
  if (scope.kind === "organisation") {
    if (given !== undefined && given.toLowerCase() !== scope.organisationid.toLowerCase()) {
      throw organisationNotFound();
    }
    organisationid = scope.organisationid;
  } else {
    if (given === undefined) {
      throw invalid("organisationid", "Choose an organisation.");
    }
    organisationid = given;
  }
  const row = await organisations.findOne({ where: { organisationid, isdeleted: false } });
  if (!row) {
    throw organisationNotFound();
  }
  return row;
};

const RETIRED_FORMAT_MESSAGE = "Format 2 has been retired; content is one organisation's (format 3).";

/**
 * A content sync takes no `format`: the format is always 3. A request that sends one (any value, in the query or the body;
 * the admin's older request body did) is a 400 that says why, and nothing is exported or pushed. The caller's scope is
 * read first, so a caller with no scope still gets the 403 it always did.
 */
export const refuseRetiredFormat = (org: OrgContext, format: unknown): void => {
  scopeOf(org); // throws first when there is no scope
  if (format !== undefined) {
    throw new ApiError(ErrorCode.INVALID_INPUT, RETIRED_FORMAT_MESSAGE, {
      fields: [{ field: "format", message: RETIRED_FORMAT_MESSAGE }],
    });
  }
};

/** The organisation a content sync (`sync/content`, `sync/cloud`) is for. */
export const planContentSync = async (org: OrgContext, request: SyncRequest): Promise<SyncPlan> => ({
  organisation: await resolveSyncOrganisation(org, request.organisationid),
});
