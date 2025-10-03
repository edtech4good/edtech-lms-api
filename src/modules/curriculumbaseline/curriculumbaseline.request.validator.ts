import joi from "joi";
import { RequestValidator } from "../../models/RequestValidator";
import { emptyString } from "src/validators/custom.validator";

export const createcurriculumbaseline: RequestValidator = {
  body: joi.object().keys({
    baselineid: joi.string().required().uuid().label("Base Line ID"),
    curriculumid: joi.string().required().uuid().label("Curriculum ID"),
    baselinename: joi.string().required().max(300).min(1).custom(emptyString("Baseline Name")).label("Baseline Name"),
    baselinetype: joi.number().required().max(3).min(1).label("Baseline Type"),
    // baselinestatus: joi.boolean().required().label('Baseline Status'),
    startdate: joi.date().required().label("Start Date"),
    enddate: joi.date().required().label("End Date"),
    schoolid: joi.array().items(joi.string()).required().label("School Id"),
  }).unknown(true),
};

export const deletecurriculumbaseline: RequestValidator = {
  params: joi.object().keys({
    curriculumbaselineid: joi
      .string()
      .required()
      .uuid()
      .label("Curriculumbaseline ID"),
    // baselinetype: joi.number().required().max(3).min(1).label("Baseline Type"),
  }),
};

export const activatebaseline: RequestValidator = {
  params: joi.object().keys({
    curriculumbaselineid: joi
    .string()
    .required()
    .uuid()
    .label("Curriculumbaseline ID"),
    curriculumid: joi
    .string()
    .required()
    .uuid()
    .label("Curriculum ID"),
  })
}
