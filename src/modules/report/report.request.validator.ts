import joi, { SchemaMap } from "joi";
import { IMultiPaging } from "src/models/IPaging";
import { RequestValidator } from "../../models/RequestValidator";

export const showallsyncrecords: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IMultiPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi.string().valid("filename", "type", "offlineonline", "created_by").required(),
        value: joi.alternatives().try(joi.string().allow(''), joi.array().min(0)).required(),
      })
      .max(5)
      .message("Invalid filter"),
  }),
};
