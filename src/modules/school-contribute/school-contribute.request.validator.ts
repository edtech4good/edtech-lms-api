import {RequestValidator} from "../../models";
import joi, { SchemaMap } from "joi";
import {emptyString} from "../../validators/custom.validator";
import { IPaging } from "src/models/IPaging";

export const createschoolcontribute: RequestValidator = {
  body: joi.object().keys({
    schoolname: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("School Name"))
      .label("School Name"),
    schoolid: joi
      .string()
      .required()
      .uuid()
      .label("School ID"),
    countryid: joi
      .string()
      .required()
      .uuid()
      .label("Country ID"),
    expected: joi
      .number()
      .required()
      .max(100000)
      .min(1)
      .label("Expected"),
    actual: joi
      .number()
      .required()
      .max(100000)
      .min(1)
      .label("Actual"),
  }),
};

export const updateschoolcontribute: RequestValidator = {
  body: joi.object().keys({
    schoolname: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("School Name"))
      .label("School Name"),
    countryid: joi
      .string()
      .required()
      .uuid()
      .label("Country ID"),
  }),
  params: joi.object().keys({
    schoolid: joi
    .string()
    .required()
    .uuid()
    .label("School Contribute ID"),
  }),
};

export const showscholcontribute: RequestValidator = {
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
  params: joi.object().keys({
    schoolid: joi
    .string()
    .required()
    .uuid()
    .label("School ID"),
  })
};

export const updateschooldashboard: RequestValidator = {
  body: joi.object().keys({
    expected: joi
      .number()
      .required()
      .max(100000)
      .min(1)
      .label("Expected"),
    actual: joi
      .number()
      .required()
      .max(100000)
      .min(1)
      .label("Actual"),
  }),
  params: joi.object().keys({
    schoolcontributeid: joi
    .string()
    .required()
    .uuid()
    .label("School Contribute ID"),
  })
}

export const getschooldashboardbyid: RequestValidator = {
  params: joi.object().keys({
    schoolid: joi
    .string()
    .required()
    .uuid()
    .label("School ID"),
  }),
}

export const deleteschoolcontribute: RequestValidator = {
  params: joi.object().keys({
    schoolid: joi.string().required().uuid().label("School ID"),
  }),
};

export const schoolid: RequestValidator = {
  params: joi.object().keys({
    schoolid: joi
    .string()
    .required()
    .uuid()
    .label("School ID"),
  }),
}

export const schoolcontributeid: RequestValidator = {
  params: joi.object().keys({
    schoolcontributeid: joi
    .string()
    .required()
    .uuid()
    .label("SchoolContribute ID"),
  }),
}