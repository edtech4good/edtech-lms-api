import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { emptyString, passwordvalidator } from "src/validators/custom.validator";
import { RequestValidator } from "../../models/RequestValidator";

const createuser: RequestValidator = {
  body: joi.object().keys({
    lmsusername: joi
      .string()
      .email()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("User Email"))
      .label("User Email Address"),
    lmsuserpasswordhash: joi.string().custom(passwordvalidator).required(),
    lmsuserroles: joi
      .array()
      .min(1)
      .items(joi.string())
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
      .items(joi.string())
  }),
};

const updateuser: RequestValidator = {
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
  deletestandard,
  showstandard,
  showalluser,
};
