import joi from "joi";
import { RequestValidator } from "../../models/RequestValidator";

/**
 * Request-shape validation for the organisation routes. Rules that need the
 * database (uniqueness, countries exist, immutability) are in
 * organisation.business.validator.ts.
 *
 * Joi here only validates: SchemaValidationInterceptor never writes the
 * converted value back, so `.trim()` makes the length rules apply to the
 * trimmed text but the body the handler receives is still raw - the
 * controller trims again.
 */

/** The values `schools.uitheme` accepts today (school.request.validator.ts). */
export const UI_THEMES = ["kids", "corporate"];

/** What an organisation "started from". Nothing may branch on it (§3). */
export const ORGANISATION_PRESETS = ["company", "schoolnetwork"];

/** Lowercase ASCII letters and digits: the code is typed at learner sign-in. */
export const ORGANISATION_CODE_PATTERN = /^[a-z0-9]+$/;

/**
 * Characters a name must never contain: every control character (`\p{Cc}`:
 * NUL, tab, newline, ...) and the bidirectional controls U+202A-U+202E and
 * U+2066-U+2069, which can make text display in a different order from how it
 * is stored. Zero-width space, joiner and non-joiner (U+200B, U+200D, U+200C)
 * are NOT here: Khmer text uses them inside words.
 */
const FORBIDDEN_IN_NAME = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Display text (an organisation name, a branding display name): no control or
 * bidirectional characters, and at least one letter or digit, so a name made
 * only of invisible characters is refused. Trimming is done by Joi's `.trim()`
 * before this runs.
 */
export const isPlainDisplayText = (value: string): boolean =>
  !FORBIDDEN_IN_NAME.test(value) && HAS_LETTER_OR_DIGIT.test(value);

const displayText = (value: string, helpers: joi.CustomHelpers) =>
  isPlainDisplayText(value) ? value : helpers.error("string.pattern.base");

/** One letter, then letters and combining marks (Khmer vowel signs and subscripts are marks). */
const SHORTNAME_PATTERN = /^\p{L}[\p{L}\p{M}]*$/u;
export const SHORTNAME_MAX_CODE_POINTS = 12;
export const SHORTNAME_MAX_GRAPHEMES = 3;

// The TypeScript lib this project compiles against predates Intl.Segmenter
// (Node 22, which this package requires, has it).
const Segmenter = (
  Intl as unknown as {
    Segmenter: new (
      locale: string | undefined,
      options: { granularity: "grapheme" },
    ) => { segment(input: string): Iterable<unknown> };
  }
).Segmenter;

/**
 * Tile initials: 1 to 3 grapheme clusters, each starting with a letter and
 * holding only letters and combining marks, at most 12 code points. Counting
 * graphemes (not code points) is what makes Khmer work: a cluster such as "សុ"
 * or "ក្ស" is one visible unit but two or three code points.
 */
export const isValidShortName = (value: string): boolean => {
  if (!SHORTNAME_PATTERN.test(value)) {
    return false;
  }
  if ([...value].length > SHORTNAME_MAX_CODE_POINTS) {
    return false;
  }
  const graphemes = [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
  return graphemes >= 1 && graphemes <= SHORTNAME_MAX_GRAPHEMES;
};

const MAX_COUNTRIES = 250;

const organisationname = joi
  .string()
  .trim()
  .min(1)
  .max(250)
  .custom(displayText)
  .label("Organisation Name");

const organisationshortname = joi
  .string()
  .custom((value, helpers) =>
    isValidShortName(value) ? value : helpers.error("string.pattern.base"),
  )
  .label("Organisation Short Name");

const uitheme = joi.string().valid(...UI_THEMES).label("UI Theme");

/**
 * The logo must be an https URL with no user info (`user:pass@host`): not
 * `http:`, `javascript:` or `data:`, and nothing that smuggles credentials or
 * disguises the host. 2048 characters at most.
 *
 * NOTHING FETCHES THIS URL ON THE SERVER TODAY: it is only stored and handed to
 * clients. If a server-side fetch is ever added (thumbnailing, validation,
 * proxying), it needs an SSRF guard first - resolve the host and refuse
 * loopback, link-local, private and metadata addresses, refuse redirects to
 * them, and cap time and size. This validation does not make a URL safe to
 * fetch.
 */
const logourl = joi
  .string()
  .max(2048)
  .uri({ scheme: ["https"] })
  .custom((value, helpers) => {
    const authority = /^https:\/\/([^/?#]*)/i.exec(value)?.[1] ?? "";
    return authority.includes("@") ? helpers.error("string.uri") : value;
  });

/**
 * Shape of `brandingconfig` (§3: "logo, display name, tile colour"). Closed on
 * purpose: unknown keys are refused. `null` clears it. What is STORED is built
 * from these three named keys only (`pickBranding` in organisation.business.ts),
 * never from the request object itself.
 */
const brandingconfig = joi
  .object({
    logourl,
    displayname: joi.string().trim().min(1).max(250).custom(displayText),
    tilecolour: joi.string().pattern(/^#[0-9a-fA-F]{6}$/),
  })
  .allow(null)
  .label("Branding");

/** Uniqueness and existence of the ids are business rules, not Joi's. */
const countryids = joi
  .array()
  .items(joi.string().uuid())
  .min(1)
  .max(MAX_COUNTRIES)
  .required()
  .label("Country IDs");

const organisationid = joi.string().required().uuid().label("Organisation ID");

export const createorganisation: RequestValidator = {
  body: joi.object().keys({
    organisationname: organisationname.required(),
    organisationcode: joi
      .string()
      .min(2)
      .max(16)
      .pattern(ORGANISATION_CODE_PATTERN)
      .required()
      .label("Organisation Code"),
    organisationshortname: organisationshortname.required(),
    organisationpreset: joi
      .string()
      .valid(...ORGANISATION_PRESETS)
      .required()
      .label("Organisation Preset"),
    uitheme: uitheme.optional(),
    brandingconfig: brandingconfig.optional(),
    countryids,
    // Not writable through the API in this package.
    settingsconfig: joi.any().forbidden().label("Settings"),
  }),
};

export const updateorganisation: RequestValidator = {
  body: joi.object().keys({
    organisationname: organisationname.required(),
    organisationshortname: organisationshortname.required(),
    uitheme: uitheme.optional(),
    brandingconfig: brandingconfig.optional(),
    organisationstatus: joi.boolean().strict().optional().label("Status"),
    countryids,
    // The code and the preset cannot be changed. They are accepted here only so
    // that a form which sends the whole record back is not refused for a value
    // it did not change: the business rule compares them with the stored value
    // and returns a field error for any difference. (Strings only, no format
    // check, since a mismatch is refused anyway.)
    organisationcode: joi.string().max(64).label("Organisation Code"),
    organisationpreset: joi.string().max(64).label("Organisation Preset"),
    // Not writable through the API in this package.
    settingsconfig: joi.any().forbidden().label("Settings"),
  }),
  params: joi.object().keys({ organisationid }),
};

export const deleteorganisation: RequestValidator = {
  params: joi.object().keys({ organisationid }),
};

export const showorganisation: RequestValidator = {
  params: joi.object().keys({ organisationid }),
};

export const showallorganisation: RequestValidator = {
  query: joi.object().keys({
    pageindex: joi.number().integer().min(0).max(1000000).label("Page Index"),
    pagesize: joi.number().integer().min(0).max(200).label("Page Size"),
    organisationname: joi.string().max(250).allow("").label("Organisation Name"),
  }),
};
