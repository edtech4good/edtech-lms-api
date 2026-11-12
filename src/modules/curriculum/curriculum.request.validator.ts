import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { emptyString } from 'src/validators/custom.validator';
import { RequestValidator } from '../../models/RequestValidator';
import { ALLOWED_RECOGNITION } from 'src/business/curriculum-recognition';
import { filterValue } from "src/validators/organisation-filter";

// Optional on create and edit; a value outside the tier's list (any case but lower, null, a number) is a 400 naming the field.
const recognitionKeys = {
  levelrecognition: joi.string().valid(...ALLOWED_RECOGNITION.levelrecognition).strict().label("levelrecognition"),
  graderecognition: joi.string().valid(...ALLOWED_RECOGNITION.graderecognition).strict().label("graderecognition"),
  curriculumrecognition: joi.string().valid(...ALLOWED_RECOGNITION.curriculumrecognition).strict().label("curriculumrecognition"),
};

const createcurriculum: RequestValidator = ({
  body: joi.object().keys({
    curriculumname: joi.string().required().max(50).min(3).custom(emptyString("Curriculum Name")).label("Curriculum Name"),
    curriculumdescription: joi.string().max(500).min(3).custom(emptyString("Curriculum description")).label("Curriculum description").allow(null, ''),
    countryid: joi.array().items(joi.string()).required().label("Country Id"),
    subjectid: joi.string().required().uuid().label('Subject ID'),
    ...recognitionKeys,
  }),
});

const updatecurriculum: RequestValidator = ({
  body: joi.object().keys({
    curriculumname: joi.string().required().max(50).min(3).custom(emptyString("Curriculum Name")).label("Curriculum Name"),
    curriculumdescription: joi.string().max(500).min(3).custom(emptyString("Curriculum description")).label("Curriculum description").allow(null, ''),
    countryid: joi.array().items(joi.string()).required().label("Country Id"),
    subjectid: joi.string().required().uuid().label('Subject ID'),
    ...recognitionKeys,
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
      "key": joi.string().valid("curriculumname", "curriculumdescription", "organisationid").required(),
      "value": filterValue(
        joi.string().required()
      ),
    }).max(5).message("Invalid filter")
  }),
});

export { createcurriculum, updatecurriculum, deletecurriculum, showcurriculum, showallcurriculum, showcurriculumbycountry };

