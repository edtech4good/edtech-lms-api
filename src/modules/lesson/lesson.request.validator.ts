import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { emptyString } from "src/validators/custom.validator";
import { RequestValidator } from "../../models/RequestValidator";

export const createlesson: RequestValidator = {
  body: joi.object().keys({
    lessonname: joi
      .string()
      .required()
      .max(50)
      .min(3)
      .custom(emptyString("Lesson Name"))
      .label("Lesson Name"),
    lessondescription: joi
      .string()
      .max(500)
      .min(3)
      .custom(emptyString("Lesson description"))
      .label("Lesson description")
      .allow(null, ""),
    lessonorder: joi.number().integer().required().min(0).label("Lesson order"),
    total_points: joi.number().integer().default(10).required().min(0).label("Total Points"),
    levelid: joi.string().required().uuid().label("level ID"),
    passing_points: joi.number().required().label('Lesson Lesson Passing Points'),
  }),
};

export const updatelesson: RequestValidator = {
  body: joi.object().keys({
    lessonname: joi
      .string()
      .required()
      .max(50)
      .min(3)
      .custom(emptyString("Lesson Name"))
      .label("Lesson Name"),
    lessondescription: joi
      .string()
      .max(500)
      .min(3)
      .custom(emptyString("Lesson description"))
      .label("Lesson description")
      .allow(null, ""),
    lessonorder: joi.number().integer().required().min(0).label("Lesson order"),
    total_points: joi.number().integer().default(10).required().min(0).label("Total Points"),
    levelid: joi.string().required().uuid().label("level ID"),
    passing_points: joi.number().required().label('Lesson Lesson Passing Points'),
  }),
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label("Lesson ID"),
  }),
};

export const deletelesson: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label("Lesson ID"),
  }),
};

export const showlesson: RequestValidator = {
  params: joi.object().keys({
    lessonid: joi.string().required().uuid().label("Lesson ID"),
  }),
};

export const showalllesson: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi.string().valid("lessonname", "lessondescription").required(),
        value: joi.string().required(),
      })
      .max(5)
      .message("Invalid filter"),
  }),
};
