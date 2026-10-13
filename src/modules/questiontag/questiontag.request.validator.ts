import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { emptyString } from 'src/validators/custom.validator';
import { RequestValidator } from '../../models/RequestValidator';
import { filterValue } from "src/validators/organisation-filter";

const createquestiontag: RequestValidator = ({
  body: joi.object().keys({
    questiontagname: joi.string().alphanum().required().max(8).min(3).custom(emptyString("Question Tag Name")).label("Question Tag Name"),
  }),
});

const updatequestiontag: RequestValidator = ({
  body: joi.object().keys({
    questiontagname: joi.string().alphanum().required().max(8).min(3).custom(emptyString("Question Tag Name")).label("Question Tag Name"),
  }),
  params: joi.object().keys({
    questiontagid: joi.string().required().uuid().label('Question Tag ID'),
  }),
});

const deletequestiontag: RequestValidator = ({
  params: joi.object().keys({
    questiontagid: joi.string().required().uuid().label('Question Tag ID'),
  }),
});

const showquestiontag: RequestValidator = ({
  params: joi.object().keys({
    questiontagid: joi.string().required().uuid().label('Question Tag ID'),
  }),
});

const showallquestiontag: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().valid("questiontagname", "organisationid").required(),
      "value": filterValue(
        joi.string().required()
      ),
    }).max(5).message("Invalid filter")
  }),
});

export { createquestiontag, updatequestiontag, deletequestiontag, showquestiontag, showallquestiontag };

