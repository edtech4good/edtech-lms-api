import joi from 'joi';
import { RequestValidator } from '../../models/RequestValidator';


export const createlevelquizquestion: RequestValidator = ({
  params: joi.object().keys({
    levelid: joi.string().required().uuid().label('Level ID'),
    questionid: joi.string().required().uuid().label('Question ID'),
    levelquizquestionorder: joi.number().required().label('Question order'),
  }),
});

export const updatestatuslevelquizquestion: RequestValidator = ({
  params: joi.object().keys({
    levelquizquestionid: joi.string().required().uuid().label('Level Quiz Question ID'),
  }),
});

export const updateorderlevelquizquestion: RequestValidator = ({
  params: joi.object().keys({
    levelquizquestionid: joi.string().required().uuid().label('Level Quiz Question ID'),
    levelquizquestionorder: joi.number().required().label('Question order'),
  }),
});


