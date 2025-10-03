import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { emptyString } from 'src/validators/custom.validator';
import { RequestValidator } from '../../models/RequestValidator';

const createsubject: RequestValidator = ({
  body: joi.object().keys({
    subjectname: joi.string().required().max(25).min(3).custom(emptyString("Subject Name")).label("Subject Name"),
    subjectdescription: joi.string().max(100).min(3).custom(emptyString("Subject Description")).label("Subject Description"),
  }),
});

const updatesubject: RequestValidator = ({
  body: joi.object().keys({
    subjectname: joi.string().required().max(25).min(3).custom(emptyString("Subject Name")).label("Subject Name"),
    subjectdescription: joi.string().max(100).min(3).custom(emptyString("Subject Name")).label("Subject Description"),
  }),
  params: joi.object().keys({
    subjectid: joi.string().required().uuid().label('Subject ID'),
  }),
});

const deletesubject: RequestValidator = ({
  params: joi.object().keys({
    subjectid: joi.string().required().uuid().label('Subject ID'),
  }),
});

const showsubject: RequestValidator = ({
  params: joi.object().keys({
    subjectid: joi.string().required().uuid().label('Subject ID'),
  }),
});

const showallsubject: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().valid("subjectname").required(),
      "value": joi.string().required(),
    }).max(5).message("Invalid filter")
  }),
});

export { createsubject, updatesubject, deletesubject, showsubject, showallsubject };

