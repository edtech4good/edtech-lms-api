import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { emptyString } from "src/validators/custom.validator";
import { RequestValidator } from "../../models/RequestValidator";

const createstandard: RequestValidator = {
  body: joi.object().keys({
    standardname: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("Standard Name"))
      .label("Standard Name"),
    schoolid: joi
      .string()
      .required()
      .uuid()
      .custom(emptyString("Schoolid"))
      .label("Schoolid"),
  }),
};

const updatestandard: RequestValidator = {
  body: joi.object().keys({
    standardname: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("Standard Name"))
      .label("Standard Name"),
    schoolid: joi
      .string()
      .required()
      .uuid()
      .custom(emptyString("Schoolid"))
      .label("Schoolid"),
  }),
  params: joi.object().keys({
    standardid: joi.string().required().uuid().label("Standard ID"),
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

const showallstandard: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi.string().valid("standardname","schoolid").required(),
        value: joi.alternatives().try(joi.string().allow(''), joi.array().min(0)).required(),
      })
      .max(5)
      .message("Invalid filter"),
  }),
};

const showschoolid: RequestValidator = {
  params: joi.object().keys({
    schoolid: joi.string().required().uuid().label("School ID"),
  }),
};

export {
  createstandard,
  updatestandard,
  deletestandard,
  showstandard,
  showallstandard,
  showschoolid
};
