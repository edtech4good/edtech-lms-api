import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { emptyString } from "src/validators/custom.validator";
import { RequestValidator } from "../../models/RequestValidator";
import { filterValue } from "src/validators/organisation-filter";
import { LABEL_PRESET_NAMES, MAX_LABEL_LENGTH } from "src/constants/tier-labels";
import { isPlainDisplayText } from "../organisation/organisation.request.validator";

export const getschoolstudents: RequestValidator = {
  params: joi.object().keys({
    schoolname: joi.string().required().label("School Name"),
  }),
};

export const createschool: RequestValidator = {
  body: joi.object().keys({
    schoolname: joi
      .string()
      .trim()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("School Name"))
      .label("School Name"),
    countryid: joi.string().required().uuid().label("Country ID"),
    curriculums: joi.array().items(joi.string()).required().label("Curriculums"),
    organisationid: joi.string().uuid().allow(null).label("Organisation ID"),
  }),
};

export const updateschool: RequestValidator = {
  body: joi.object().keys({
    schoolname: joi
      .string()
      .trim()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("School Name"))
      .label("School Name"),
    countryid: joi.string().required().uuid().label("Country ID"),
    curriculums: joi.array().items(joi.string()).required().label("Curriculums"),
    uitheme: joi.string().valid("kids", "corporate").optional().label("UI Theme"),
    organisationid: joi.string().uuid().allow(null).label("Organisation ID"),

  }),
  params: joi.object().keys({
    schoolid: joi.string().required().uuid().label("School ID"),
  }),
};

export const deleteschool: RequestValidator = {
  params: joi.object().keys({
    schoolid: joi.string().required().uuid().label("School ID"),
  }),
};

export const showschool: RequestValidator = {
  params: joi.object().keys({
    schoolid: joi.string().required().uuid().label("School ID"),
  }),
};

export const showschoolscurriculum: RequestValidator = {
  params: joi.object().keys({
    countryid: joi.string().required().uuid().label("Country ID"),
    curriculumid: joi.string().required().uuid().label("Curriculum ID"),
  }),
};

export const showallschool: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi.string().valid("schoolname", "countryid", "curriculums", "organisationid").required(),
        value: filterValue(
          joi.alternatives().try(joi.string().allow(''), joi.array().min(0)).required()
        ),
      }
      )
      .max(5)
      .message("Invalid filter"),
  }),
};

/**
 * One label text: not empty once trimmed, no control or bidirectional characters, at least one letter or digit.
 * Khmer text is accepted as it is typed (marks and joiners are kept); this code writes none.
 */
const labelText = joi
  .string()
  .trim()
  .min(1)
  .max(MAX_LABEL_LENGTH)
  .custom((value: string, helpers: joi.CustomHelpers) => (isPlainDisplayText(value) ? value : helpers.error("string.pattern.base")));

const tierLabel = joi.object({
  en: joi.object({ one: labelText.required(), other: labelText.required() }).required(),
  km: labelText,
});

/**
 * The tier labels of a school (`PUT /school/labels/:schoolid`): a preset by name, the school's own label for any of the
 * four tiers, and whether a tier holding one item is hidden. Every key is optional but at least one is sent; `null`
 * clears a preset or the school's own labels. The list of tiers is closed. The labels sent replace the school's own
 * labels as a set and each tier whole (deliberate: the admin sends the full set).
 */
export const updateschoollabels: RequestValidator = {
  params: joi.object().keys({
    schoolid: joi.string().required().uuid().label("School ID"),
  }),
  body: joi
    .object()
    .keys({
      labelPreset: joi.string().valid(...LABEL_PRESET_NAMES).allow(null),
      labels: joi.object({ curriculum: tierLabel, grade: tierLabel, level: tierLabel, lesson: tierLabel }).allow(null),
      hideSingleItemTiers: joi.boolean().strict(),
    })
    .min(1)
    .messages({ "object.min": "needs at least one of labelPreset, labels or hideSingleItemTiers." }),
};
