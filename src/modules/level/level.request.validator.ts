import joi, { SchemaMap } from 'joi';
import { IPaging } from 'src/models/IPaging';
import { emptyString } from 'src/validators/custom.validator';
import { RequestValidator } from '../../models/RequestValidator';

export const createlevel: RequestValidator = ({
  body: joi.object().keys({
    levelname: joi.string().required().max(50).min(3).custom(emptyString("Level Name")).label("Level Name"),
    leveldescription: joi.string().max(500).min(3).custom(emptyString("Level description")).label("Level description").allow(null, ''),
    levelorder: joi.number().integer().required().min(0).label("Level order"),
    gradeid: joi.string().required().uuid().label("Grade ID"),
    quiz_points: joi.number().required().label('Lesson Level-Quiz Points'),
    passing_points: joi.number().required().label('Lesson Level Passing Points'),
  }),
});

export const updatelevel: RequestValidator = ({
  body: joi.object().keys({
    levelname: joi.string().required().max(50).min(3).custom(emptyString("Level Name")).label("Level Name"),
    leveldescription: joi.string().max(500).min(3).custom(emptyString("Level description")).label("Level description").allow(null, ''),
    levelorder: joi.number().integer().required().min(0).label("Level order"),
    gradeid: joi.string().required().uuid().label("Grade ID"),
    quiz_points: joi.number().required().label('Lesson Level-Quiz Points'),
    passing_points: joi.number().required().label('Lesson Level Passing Points'),
  }),
  params: joi.object().keys({
    levelid: joi.string().required().uuid().label('Level ID'),
  }),
});

export const deletelevel: RequestValidator = ({
  params: joi.object().keys({
    levelid: joi.string().required().uuid().label('Level ID'),
  }),
});

export const showlevel: RequestValidator = ({
  params: joi.object().keys({
    levelid: joi.string().required().uuid().label('Level ID'),
  }),
});

export const showalllevel: RequestValidator = ({
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi.array().items({
      "key": joi.string().valid("levelname", "leveldescription").required(),
      "value": joi.string().required(),
    }).max(5).message("Invalid filter")
  }),
});


