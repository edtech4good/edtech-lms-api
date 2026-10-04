import { OrgContext } from "src/decorators/org.decorator";
import { defaultSyncFormat } from "src/config";
import { ApiError } from "src/models/ApiError";
import { organisations } from "src/models/data-models/organisations";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { scopeOf } from "./org-scope";

/**
 * What a content sync (`GET sync`, `GET sync/content`, `POST sync/cloud`) is for.
 *
 * Content is exported and pushed one organisation at a time. Whose it is comes
 * from the caller's token: an organisation's staff, and a platform user acting
 * as an organisation, sync that organisation. A platform user who is not acting
 * must say which one, with `organisationid`, and gets the same 404 for an
 * organisation that is not there as for one that is. Naming an organisation
 * other than the one the token acts in is the same 404, never a way into it.
 *
 * The platform, not acting as an organisation, can also ask for the whole
 * platform's content in the older format 2 (`format=2`). Nobody else can, and
 * `SYNC_FORMAT_DEFAULT` (see `defaultSyncFormat`) is what a request that does
 * not say gets.
 */
export interface SyncRequest {
  organisationid?: unknown;
  format?: unknown;
}

export type SyncPlan = { format: 2 } | { format: 3; organisation: organisations };

const invalid = (field: string, message: string) =>
  new ApiError(ErrorCode.INVALID_INPUT, message, { fields: [{ field, message }] });

const organisationNotFound = () => new ApiError(ErrorCode.NOT_FOUND, "That organisation doesn't exist.");

/** `2` or `3`, as a number or as text; nothing given is `undefined`; anything else is a 400. */
const parseFormat = (value: unknown): 2 | 3 | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (text === "2") return 2;
  if (text === "3") return 3;
  throw invalid("format", "format must be 2 or 3.");
};

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

/** The format and the organisation a content sync (`sync/content`, `sync/cloud`) is for. */
export const planContentSync = async (org: OrgContext, request: SyncRequest): Promise<SyncPlan> => {
  const scope = scopeOf(org);
  const asked = parseFormat(request.format);
  const format = asked ?? defaultSyncFormat();
  if (format === 2) {
    if (scope.kind !== "platform") {
      throw new ApiError(
        ErrorCode.INVALID_INPUT,
        asked === undefined
          ? "This server syncs the whole platform's content only. Sync as a platform user who is not acting as an organisation."
          : "Format 2 is for the platform, not acting as an organisation, only.",
        { fields: [{ field: "format", message: "Format 2 is for the platform, not acting as an organisation, only." }] },
      );
    }
    if (parseOrganisationId(request.organisationid) !== undefined) {
      throw invalid("organisationid", "Format 2 is the whole platform's content: it does not take an organisation.");
    }
    return { format: 2 };
  }
  return { format: 3, organisation: await resolveSyncOrganisation(org, request.organisationid) };
};
