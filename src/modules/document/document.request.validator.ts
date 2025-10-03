import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { RequestValidator } from '../../models/RequestValidator';

export const showalldocument: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().max(10).valid("documentname", "documenttypeid", "documenttags").required(),
      "value": joi.string().required(),
    }).max(5).message("Invalid filter")
  }),
});


export const documenttagOperations: RequestValidator = ({
  params: joi.object().keys(<SchemaMap<IPaging>>{
    documentid: joi.string().uuid().required().label("Document ID"),
    tag: joi.string().required().label("Tag"),
  }),
});


