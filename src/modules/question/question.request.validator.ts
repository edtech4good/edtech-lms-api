import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { emptyString } from 'src/validators/custom.validator';
import { RequestValidator } from '../../models/RequestValidator';

export const createquestion: RequestValidator = ({
  body: joi.object().keys({
    questionidentifier: joi.string().required().max(100).min(3).custom(emptyString("Question identifier")).label("Question identifier"),
  }).unknown(true),
});

export const updatequestion: RequestValidator = ({
  body: joi.object().keys({
    questionidentifier: joi.string().required().max(100).min(3).custom(emptyString("Question identifier")).label("Question identifier"),
  }).unknown(true),
  params: joi.object().keys({
    questionid: joi.string().required().uuid().label('Question ID'),
  }),
});

export const deletequestion: RequestValidator = ({
  params: joi.object().keys({
    questionid: joi.string().required().uuid().label('Question ID'),
  }),
});

export const updatequestionIdentifier: RequestValidator = ({
  params: joi.object().keys({
    questionid: joi.string().required().uuid().label('Question ID'),
    questionidentifier: joi.string().required().max(100).min(3).custom(emptyString("Question identifier")).label("Question identifier"),
  }),
});

export const showquestion: RequestValidator = ({
  params: joi.object().keys({
    questionid: joi.string().required().uuid().label('Question ID'),
  }),
});

export const quicksearch: RequestValidator = ({
  params: joi.object().keys({
    search: joi.string().required().min(3).max(20).label('search key'),
  }),
});


export const showallquestion: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().valid("questionidentifier", "questiontags", "questionstatus", "templatetypeid").required(),
      "value": joi.string().required(),
    }).max(5).message("Invalid filter")
  }).unknown(true),
});


export const questionOperations: RequestValidator = ({
  params: joi.object().keys(<SchemaMap<IPaging>>{
    questionid: joi.string().uuid().required().label("Question ID"),
    tag: joi.string().required().label("Tag"),
  }),
});


