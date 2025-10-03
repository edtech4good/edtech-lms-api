import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { emptyString } from 'src/validators/custom.validator';
import { RequestValidator } from '../../models/RequestValidator';

const createcurriculum: RequestValidator = ({
  body: joi.object().keys({
    curriculumname: joi.string().required().max(50).min(3).custom(emptyString("Curriculum Name")).label("Curriculum Name"),
    curriculumdescription: joi.string().max(500).min(3).custom(emptyString("Curriculum description")).label("Curriculum description").allow(null, ''),
    countryid: joi.array().items(joi.string()).required().label("Country Id"),
    subjectid: joi.string().required().uuid().label('Subject ID'),
  }),
});

const updatecurriculum: RequestValidator = ({
  body: joi.object().keys({
    curriculumname: joi.string().required().max(50).min(3).custom(emptyString("Curriculum Name")).label("Curriculum Name"),
    curriculumdescription: joi.string().max(500).min(3).custom(emptyString("Curriculum description")).label("Curriculum description").allow(null, ''),
    countryid: joi.array().items(joi.string()).required().label("Country Id"),
    subjectid: joi.string().required().uuid().label('Subject ID'),
  }),
  params: joi.object().keys({
    curriculumid: joi.string().required().uuid().label('Curriculum ID'),
  }),
});

const deletecurriculum: RequestValidator = ({
  params: joi.object().keys({
    curriculumid: joi.string().required().uuid().label('Curriculum ID'),
  }),
});

const showcurriculum: RequestValidator = ({
  params: joi.object().keys({
    curriculumid: joi.string().required().uuid().label('Curriculum ID'),
  }),
});

const showcurriculumbycountry: RequestValidator = ({
  params: joi.object().keys({
    countryid: joi.string().required().uuid().label('Country ID'),
  }),
});

const showallcurriculum: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().valid("curriculumname", "curriculumdescription").required(),
      "value": joi.string().required(),
    }).max(5).message("Invalid filter")
  }),
});

export { createcurriculum, updatecurriculum, deletecurriculum, showcurriculum, showallcurriculum, showcurriculumbycountry };

