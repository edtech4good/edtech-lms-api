import joi from 'joi';
import { RequestValidator } from '../../models/RequestValidator';

export const createlessonlearning: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
  }),
  body: joi.object().keys({
    documentid: joi.string().required().uuid().label('Document ID'),
    lessonlearningname: joi.string().required().min(3).max(100).label('Lesson Learning Name'),
    lessonlearningdescription: joi.string().required().label('Lesson Learning Description'),
    lessonlearningorder: joi.number().required().label('Lesson Learning order'),
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
    documentid: joi.string().required().uuid().label('Document ID'),
    lessonlearningname: joi.string().required().min(3).max(100).label('Lesson Learning Name'),
    lessonlearningdescription: joi.string().required().label('Lesson Learning Description'),
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
