import joi from 'joi';
import { learningItemTypeNames } from 'src/business/learning-item-types';
import { RequestValidator } from '../../models/RequestValidator';

/**
 * The fields of a learning item beyond today's: all optional, so the current admin keeps working unchanged. The type
 * must be one the API knows (refused here, not by the column); what each type then requires of the document, the body
 * and the documents is checked by the route, after its ownership checks (src/business/learning-item-types.ts).
 */
const itemFields = {
  lessonlearningtype: joi.string().valid(...learningItemTypeNames()).label('Lesson Learning Type'),
  lessonlearningbody: joi.object().allow(null).label('Lesson Learning Body'),
  documents: joi
    .array()
    .items(
      joi.object().keys({
        documentid: joi.string().required().uuid().label('Document ID'),
        role: joi.string().required().valid('rendition', 'asset').label('Document role'),
        order: joi.number().integer().min(0).label('Document order'),
      }),
    )
    .max(100)
    .label('Documents'),
};

export const createlessonlearning: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
  }),
  body: joi.object().keys({
    documentid: joi.string().uuid().allow(null).label('Document ID'),
    lessonlearningname: joi.string().required().min(3).max(100).label('Lesson Learning Name'),
    lessonlearningdescription: joi.string().required().label('Lesson Learning Description'),
    lessonlearningorder: joi.number().required().label('Lesson Learning order'),
    ...itemFields,
  }),
};

export const getlessonlearning: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
    lessonlearningid: joi.string().required().uuid().label('Lesson Learning ID'),
  }),
};

export const updatelessonlearning: RequestValidator = {
  params: joi.object().keys({
    lessonlearningid: joi.string().required().uuid().label('Lesson Learning ID'),
  }),
  body: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
    documentid: joi.string().uuid().allow(null).label('Document ID'),
    lessonlearningname: joi.string().required().min(3).max(100).label('Lesson Learning Name'),
    lessonlearningdescription: joi.string().required().label('Lesson Learning Description'),
    ...itemFields,
  }),
};

export const updatestatuslessonlearning: RequestValidator = {
  params: joi.object().keys({
    lessonlearningid: joi.string().required().uuid().label('Lesson Learning ID'),
  }),
};

export const updateorderlessonlearning: RequestValidator = {
  params: joi.object().keys({
    lessonlearningid: joi.string().required().uuid().label('Lesson Learning ID'),
    lessonlearningorder: joi.number().required().label('Lesson Learning order'),
  }),
};

export const reorderlessonlearning: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
  }),
  body: joi.object().keys({
    lessonlearningids: joi.array().items(joi.string().uuid()).unique().max(500).required().label('Lesson Learning IDs'),
  }),
};
