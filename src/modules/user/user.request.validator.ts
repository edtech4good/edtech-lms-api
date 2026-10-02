import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { emptyString, passwordvalidator } from "src/validators/custom.validator";
import { RequestValidator } from "../../models/RequestValidator";

/** Role ids are 8-character strings today; the bounds only keep a request from sending oversized values. */
const ROLE_ID_MAX_LENGTH = 36;
const ROLE_IDS_MAX = 50;

/** The width of `lmsusers.lmsusername` in the database (varchar(45)); an email longer than this cannot be stored. */
const STAFF_EMAIL_MAX_LENGTH = 45;

const createuser: RequestValidator = {
  body: joi.object().keys({
    lmsusername: joi
      .string()
      .email()
      .required()
      .max(STAFF_EMAIL_MAX_LENGTH)
      .min(1)
      .custom(emptyString("User Email"))
      .label("User Email Address"),
    lmsuserpasswordhash: joi.string().custom(passwordvalidator).required(),
    lmsuserroles: joi
      .array()
      .min(1)
      .max(ROLE_IDS_MAX)
      .items(joi.string().max(ROLE_ID_MAX_LENGTH))
      .required()
      .messages({
        // 'array.min': `"lmsuserroles" should have a minimum length of {#limit}`,
        'array.min': `The user must have at least {#limit} role`,
      }),
    countryids: joi
      .array()
      .min(0)
      .items(joi.string()),
    schoolids: joi
      .array()
      .min(0)
      .items(joi.string()),
    organisationid: joi.string().uuid().allow(null).label("Organisation ID"),
  }),
};

/**
 * The body of `PUT /user/:id`, as the admin form sends it: the roles are always
 * an array (empty when none is ticked), so they are required here; a request
 * without them is a 400 rather than a half-applied edit. The id repeats the
 * path's and is not used. The password is optional (empty or null leaves it
 * unchanged).
 */
const updateuser: RequestValidator = {
  body: joi.object().keys({
    lmsuserid: joi.string().uuid().label("User ID"),
    lmsusername: joi.string().email().required().min(1).max(STAFF_EMAIL_MAX_LENGTH).label("User Email Address"),
    organisationid: joi.string().uuid().allow(null).label("Organisation ID"),
    lmsuserpasswordhash: joi.string().max(300).allow(null, ""),
    lmsuserroles: joi
      .array()
      .max(ROLE_IDS_MAX)
      .items(joi.string().max(ROLE_ID_MAX_LENGTH))
      .required()
      .label("Roles"),
    countryids: joi.array().items(joi.string().max(ROLE_ID_MAX_LENGTH)).max(1000).allow(null),
    schoolids: joi.array().items(joi.string().max(ROLE_ID_MAX_LENGTH)).max(1000).allow(null),
  }),
  params: joi.object().keys({
    lmsuserid: joi.string().required().uuid().label("User ID"),
  }),
};

const deleteuser: RequestValidator = {
  params: joi.object().keys({
    lmsuserid: joi.string().required().uuid().label("User ID"),
  }),
};

const deletestandard: RequestValidator = {
  params: joi.object().keys({
    standardid: joi.string().required().uuid().label("Standard ID"),
  }),
};

const showstandard: RequestValidator = {
  params: joi.object().keys({
    standardid: joi.string().required().uuid().label("Standard ID"),
  }),
};

const showalluser: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi.string().valid("lmsusername").required(),
        value: joi.string().required(),
      })
      .max(5)
      .message("Invalid filter"),
  }),
};

export {
  createuser,
  updateuser,
  deleteuser,
  deletestandard,
  showstandard,
  showalluser,
};
