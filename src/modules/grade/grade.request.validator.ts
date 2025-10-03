import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { emptyString } from 'src/validators/custom.validator';
import { RequestValidator } from '../../models/RequestValidator';

const creategrade: RequestValidator = ({
  body: joi.object().keys({
    gradename: joi.string().required().max(50).min(3).custom(emptyString("Grade Name")).label("Grade Name"),
    gradedescription: joi.string().max(500).min(3).custom(emptyString("Grade description")).label("Grade description").allow(null, ''),
    gradeorder: joi.number().integer().required().min(0).label("Grade order"),
    curriculumid: joi.string().required().uuid().label("Curriculum ID"),
    passing_points: joi.number().required().label('Lesson Grade Passing Points'),
  }),
});

const updategrade: RequestValidator = ({
  body: joi.object().keys({
    gradename: joi.string().required().max(50).min(3).custom(emptyString("Grade Name")).label("Grade Name"),
    gradedescription: joi.string().max(500).min(3).custom(emptyString("Grade description")).label("Grade description").allow(null, ''),
    gradeorder: joi.number().integer().required().min(0).label("Grade order"),
    curriculumid: joi.string().required().uuid().label("Curriculum ID"),
    passing_points: joi.number().required().label('Lesson Grade Passing Points'),
  }),
  params: joi.object().keys({
    gradeid: joi.string().required().uuid().label('Grade ID'),
  }),
});

const deletegrade: RequestValidator = ({
  params: joi.object().keys({
    gradeid: joi.string().required().uuid().label('Grade ID'),
  }),
});

const showgrade: RequestValidator = ({
  params: joi.object().keys({
    gradeid: joi.string().required().uuid().label('Grade ID'),
  }),
});

const showgradebycurriculum: RequestValidator = ({
  params: joi.object().keys({
    curriculumid: joi.string().required().uuid().label('Curriculum ID'),
  }),
});

const showallgrade: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().valid("gradename", "gradedescription").required(),
      "value": joi.string().required(),
    }).max(5).message("Invalid filter")
  }),
});

export { creategrade, updategrade, deletegrade, showgrade, showallgrade, showgradebycurriculum };

