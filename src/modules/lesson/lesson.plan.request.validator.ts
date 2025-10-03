import joi from 'joi';
import { RequestValidator } from '../../models/RequestValidator';

export const createlessonplan: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
  }),
  body: joi.object().keys({
    documentid: joi.string().required().uuid().label('Document ID'),
    lessonplanname: joi.string().required().min(3).max(100).label('Lesson Plan Name'),
    lessonplandescription: joi.string().required().label('Lesson Plan Description'),
    lessonplanorder: joi.number().required().label('Lesson Plan order'),
  }),
};

export const getlessonplan: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
    lessonplanid: joi.string().required().uuid().label('Lesson Plan ID'),
  }),
};

export const updatelessonplan: RequestValidator = {
  params: joi.object().keys({
    lessonplanid: joi.string().required().uuid().label('Lesson Plan ID'),
  }),
  body: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
    documentid: joi.string().required().uuid().label('Document ID'),
    lessonplanname: joi.string().required().min(3).max(100).label('Lesson Plan Name'),
    lessonplandescription: joi.string().required().label('Lesson Plan Description'),
  }),
};

export const updatestatuslessonplan: RequestValidator = {
  params: joi.object().keys({
    lessonplanid: joi.string().required().uuid().label('Lesson Plan ID'),
  }),
};

export const updateorderlessonlearning: RequestValidator = {
  params: joi.object().keys({
    lessonlearningid: joi.string().required().uuid().label('Lesson Learning ID'),
    lessonlearningorder: joi.number().required().label('Lesson Learning order'),
  }),
};
