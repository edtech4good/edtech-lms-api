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
 * 2-3 letters of any script. The product is used in Khmer, so tile initials
 * may be Khmer consonants; `\p{L}` is a letter in any language (dependent
 * vowel signs are marks, not letters, and are not accepted).
 */
export const ORGANISATION_SHORTNAME_PATTERN = /^\p{L}{2,3}$/u;

/** No control characters (NUL, newlines, tabs...) in a display name. */
const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F]*$/;

const MAX_COUNTRIES = 250;

const organisationname = joi
  .string()
  .trim()
  .min(1)
  .max(250)
  .pattern(NO_CONTROL_CHARACTERS)
  .label("Organisation Name");

const organisationshortname = joi
  .string()
  .pattern(ORGANISATION_SHORTNAME_PATTERN)
  .label("Organisation Short Name");

const uitheme = joi.string().valid(...UI_THEMES).label("UI Theme");

/**
 * Shape of `brandingconfig` (§3: "logo, display name, tile colour"). Closed on
 * purpose - unknown keys are refused - and the logo must be an http(s) URL so
 * it can never be a `javascript:` or `data:` URI. `null` clears it.
 */
const brandingconfig = joi
  .object({
    logourl: joi
      .string()
      .uri({ scheme: ["http", "https"] })
      .max(2048),
    displayname: joi.string().trim().min(1).max(250).pattern(NO_CONTROL_CHARACTERS),
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
