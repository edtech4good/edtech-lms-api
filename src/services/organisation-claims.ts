/**
 * What a staff access token must say about organisations, and what a
 * school-user token must not. Shared by the JWT strategy, `@Org()` and
 * PlatformGuard so that "is this a well-formed staff token" has one answer.
 */

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is this a non-empty string shaped like a UUID (the shape organisation ids have)? */
export const isUuidShaped = (value: unknown): value is string =>
  typeof value === "string" && UUID_SHAPE.test(value);

/**
 * Does this ACCESS-token payload carry the organisation claims every staff
 * token has? `organisationid` must be present and be null ("no organisation")
 * or a UUID-shaped string (absent is not the same as null, and the empty string
 * is neither), and `isplatform` must be a boolean. A staff token minted before
 * these claims existed has neither, so it is refused and its owner signs in
 * again.
 */
export const hasOrganisationClaims = (payload: unknown): boolean => {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const { organisationid, isplatform } = payload as {
    organisationid?: unknown;
    isplatform?: unknown;
  };
  return (
    (organisationid === null || isUuidShaped(organisationid)) &&
    typeof isplatform === "boolean"
  );
};

/** Is `schooluserid` present on the payload (the mark of a school-user token)? */
export const hasSchoolUserId = (payload: unknown): boolean =>
  typeof payload === "object" &&
  payload !== null &&
  (payload as { schooluserid?: unknown }).schooluserid !== undefined &&
  (payload as { schooluserid?: unknown }).schooluserid !== null;

/**
 * A token that mixes the two shapes: a school-user id together with a staff id,
 * or together with either organisation claim. No code mints one; it is refused
 * rather than interpreted as either kind.
 */
export const isMixedShape = (payload: unknown): boolean => {
  if (!hasSchoolUserId(payload)) {
    return false;
  }
  const p = payload as {
    lmsuserid?: unknown;
    organisationid?: unknown;
    isplatform?: unknown;
  };
  return (
    p.lmsuserid !== undefined ||
    p.organisationid !== undefined ||
    p.isplatform !== undefined
  );
};
