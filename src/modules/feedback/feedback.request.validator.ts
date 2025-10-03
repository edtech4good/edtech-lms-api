import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { emptyString } from "src/validators/custom.validator";
import { RequestValidator } from "../../models/RequestValidator";

const createcountry: RequestValidator = {
  body: joi.object().keys({
    countryname: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("Country Name"))
      .label("Country Name"),
  }),
};

const updatecountry: RequestValidator = {
  body: joi.object().keys({
    countryname: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("Country Name"))
      .label("Country Name"),
  }),
  params: joi.object().keys({
    countryid: joi.string().required().uuid().label("Country ID"),
  }),
};

const deletecountry: RequestValidator = {
  params: joi.object().keys({
    countryid: joi.string().required().uuid().label("Country ID"),
  }),
};

const showfeedback: RequestValidator = {
  params: joi.object().keys({
    feedbackid: joi.string().required().uuid().label("Country ID"),
  }),
};

const showallfeedback: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi.string().valid("schoolname").required(),
        value: joi.string().required(),
      })
      .max(5)
      .message("Invalid filter"),
  }),
};

export {
  createcountry,
  updatecountry,
  deletecountry,
  showfeedback,
  showallfeedback,
};
