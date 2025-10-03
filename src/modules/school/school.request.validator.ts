import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { emptyString } from "src/validators/custom.validator";
import { RequestValidator } from "../../models/RequestValidator";

export const getschoolstudents: RequestValidator = {
  params: joi.object().keys({
    schoolname: joi.string().required().label("School Name"),
  }),
};

export const createschool: RequestValidator = {
  body: joi.object().keys({
    schoolname: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("School Name"))
      .label("School Name"),
    countryid: joi.string().required().uuid().label("Country ID"),
    curriculums: joi.array().items(joi.string()).required().label("Curriculums")
  }),
};

export const updateschool: RequestValidator = {
  body: joi.object().keys({
    schoolname: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("School Name"))
      .label("School Name"),
    countryid: joi.string().required().uuid().label("Country ID"),
    curriculums: joi.array().items(joi.string()).required().label("Curriculums")

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
        key: joi.string().valid("schoolname", "countryid", "curriculums").required(),
        value: joi.alternatives().try(joi.string().allow(''), joi.array().min(0)).required(),
      }
      )
      .max(5)
      .message("Invalid filter"),
  }),
};
