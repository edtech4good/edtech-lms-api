import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { RequestValidator } from '../../models/RequestValidator';

export const showalldocument: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().max(10).valid("documentname", "documenttypeid", "documenttags", "organisationid").required(),
      "value": joi.string().required().when("key", {
        is: "documenttypeid",
        // an exact match on one type id or a comma-separated list of them
        then: joi.string().pattern(/^\s*\d+(\s*,\s*\d+)*\s*$/).required().messages({ "string.pattern.base": "A document type filter is a type id, or ids separated by commas" }),
      }),
    }).max(5).message("Invalid filter")
  }),
});


export const documenttagOperations: RequestValidator = ({
  params: joi.object().keys(<SchemaMap<IPaging>>{
    documentid: joi.string().uuid().required().label("Document ID"),
    tag: joi.string().required().label("Tag"),
  }),
});


