import { RequestValidator } from '../../models/RequestValidator';
import joi from 'joi';

export const createbaseline: RequestValidator = ({
  body: joi.object().keys({
    curriculumbaselineid: joi.string().required().uuid().label('Curriculumbaseline ID'),
    questionid: joi.string().required().uuid().label('Question ID'),
    baselinequestionorder: joi.number().required().label('Question order'),
  }),
});

export const clonebaselinequestion: RequestValidator = ({
  body: joi.object().keys({
    curriculumbaselineid: joi.string().required().uuid().label('Curriculumbaseline ID'),
    clonecurriculumbaselineid: joi.string().required().uuid().label('Clone Curriculumbaseline ID'),
  }),
})

export const deletebaselinequestion: RequestValidator = ({
  params: joi.object().keys({
    baselinequestionid: joi.string().required().uuid().label('Baseline Question ID'),
  }),
});

export const order: RequestValidator = ({
  params: joi.object().keys({
    baselinequestionid: joi.string().required().uuid().label('Baseline Question ID'),
    baselinequestionorder: joi.number().required().label('Baseline Question Order'),
  })
})