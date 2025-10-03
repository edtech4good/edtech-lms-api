import joi from 'joi';
import { RequestValidator } from '../../models/RequestValidator';

export const createlessonpractice: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
  }),
  body: joi.object().keys({
    lessonpracticename: joi.string().required().min(3).max(100).label('Lesson Practice Name'),
    lessonpracticedescription: joi.string().required().label('Lesson Practice Description'),
    lessonpracticeorder: joi.number().required().label('Lesson Practice order'),
    points: joi.number().required().label('Lesson Practice Points'),
  }),
};

export const getlessonpracticeid: RequestValidator = {
  params: joi.object().keys({
    lessonpracticeid: joi.string().required().uuid().label('Lesson Practice ID'),
  }),
};
export const getlessonpractice: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
    lessonpracticeid: joi.string().required().uuid().label('Lesson Practice ID'),
  }),
};

export const updatelessonpractice: RequestValidator = {
  params: joi.object().keys({
    lessonpracticeid: joi.string().required().uuid().label('Lesson Practice ID'),
  }),
  body: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
    lessonpracticename: joi.string().required().min(3).max(100).label('Lesson Practice Name'),
    lessonpracticedescription: joi.string().required().label('Lesson Practice Description'),
    points: joi.number().required().label('Lesson Practice Points'),
  }),
};

export const updatestatuslessonpractice: RequestValidator = {
  params: joi.object().keys({
    lessonpracticeid: joi.string().required().uuid().label('Lesson Practice ID'),
  }),
};

export const updateorderlessonpractice: RequestValidator = {
  params: joi.object().keys({
    lessonpracticeid: joi.string().required().uuid().label('Lesson Practice ID'),
    lessonpracticeorder: joi.number().required().label('Lesson Practice order'),
  }),
};


export const createlessonpracticequestion: RequestValidator = {
  params: joi.object().keys({
    lessonpracticeid: joi.string().required().uuid().label("Lesson Practice ID"),
    questionid: joi.string().required().uuid().label("Question ID"),
    lessonpracticequestionorder: joi.number().required().label("Question order"),
  }),
};

export const updatestatuslessonpracticequestion: RequestValidator = {
  params: joi.object().keys({
    lessonpracticequestionid: joi
      .string()
      .required()
      .uuid()
      .label("Lesson Practice Question ID"),
  }),
};

export const updateorderlessonpracticequestion: RequestValidator = {
  params: joi.object().keys({
    lessonpracticequestionid: joi
      .string()
      .required()
      .uuid()
      .label("Lesson Practice Question ID"),
    lessonpracticequestionorder: joi.number().required().label("Question order"),
  }),
};
