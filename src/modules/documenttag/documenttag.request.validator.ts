import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { emptyString } from 'src/validators/custom.validator';
import { RequestValidator } from '../../models/RequestValidator';

const createdocumenttag: RequestValidator = ({
  body: joi.object().keys({
    documenttagname: joi.string().alphanum().required().max(8).min(3).custom(emptyString("Document Tag Name")).label("Document Tag Name"),
  }),
});

const updatedocumenttag: RequestValidator = ({
  body: joi.object().keys({
    documenttagname: joi.string().alphanum().required().max(8).min(3).custom(emptyString("Document Tag Name")).label("Document Tag Name"),
  }),
  params: joi.object().keys({
    documenttagid: joi.string().required().uuid().label('Document Tag ID'),
  }),
});

const deletedocumenttag: RequestValidator = ({
  params: joi.object().keys({
    documenttagid: joi.string().required().uuid().label('Document Tag ID'),
  }),
});

const showdocumenttag: RequestValidator = ({
  params: joi.object().keys({
    documenttagid: joi.string().required().uuid().label('Document Tag ID'),
  }),
});

const showalldocumenttag: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().valid("documenttagname").required(),
      "value": joi.string().required(),
    }).max(5).message("Invalid filter")
  }),
});

export { createdocumenttag, updatedocumenttag, deletedocumenttag, showdocumenttag, showalldocumenttag };

