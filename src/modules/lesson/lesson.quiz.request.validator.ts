import joi from 'joi';
import { RequestValidator } from '../../models/RequestValidator';

export const createlessonquiz: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
  }),
  body: joi.object().keys({
    lessonquizname: joi.string().required().min(3).max(100).label('Lesson Quiz Name'),
    lessonquizdescription: joi.string().required().label('Lesson Quiz Description'),
    lessonquizorder: joi.number().required().label('Lesson Quiz order'),
    points: joi.number().required().label('Lesson Quiz Points'),
  }),
};

export const getlessonquiz: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
    lessonquizid: joi.string().required().uuid().label('Lesson Quiz ID'),
  }),
};

export const getlessonquizid: RequestValidator = {
  params: joi.object().keys({
    lessonquizid: joi.string().required().uuid().label('Lesson Quiz ID'),
  }),
};


export const updatelessonquiz: RequestValidator = {
  params: joi.object().keys({
    lessonquizid: joi.string().required().uuid().label('Lesson Quiz ID'),
  }),
  body: joi.object().keys({
    lessonid: joi.string().required().uuid().label('Lesson ID'),
    lessonquizname: joi.string().required().min(3).max(100).label('Lesson Quiz Name'),
    lessonquizdescription: joi.string().required().label('Lesson Quiz Description'),
    points: joi.number().required().label('Lesson Quiz Points'),
  }),
};

export const updatestatuslessonquiz: RequestValidator = {
  params: joi.object().keys({
    lessonquizid: joi.string().required().uuid().label('Lesson Quiz ID'),
  }),
};

export const updateorderlessonquiz: RequestValidator = {
  params: joi.object().keys({
    lessonquizid: joi.string().required().uuid().label('Lesson Quiz ID'),
    lessonquizorder: joi.number().required().label('Lesson Quiz order'),
  }),
};



export const createlessonquizquestion: RequestValidator = {
  params: joi.object().keys({
    lessonquizid: joi.string().required().uuid().label("Lesson Quiz ID"),
    questionid: joi.string().required().uuid().label("Question ID"),
    lessonquizquestionorder: joi.number().required().label("Question order"),
  }),
};

export const updatestatuslessonquizquestion: RequestValidator = {
  params: joi.object().keys({
    lessonquizquestionid: joi
      .string()
      .required()
      .uuid()
      .label("Lesson Quiz Question ID"),
  }),
};

export const updateorderlessonquizquestion: RequestValidator = {
  params: joi.object().keys({
    lessonquizquestionid: joi
      .string()
      .required()
      .uuid()
      .label("Lesson Quiz Question ID"),
    lessonquizquestionorder: joi.number().required().label("Question order"),
  }),
};
