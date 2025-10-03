/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { QuestionBusiness } from 'src/business';
import { questionsAttributes } from 'src/models/data-models/init-models';
import { IRequest } from 'src/models/IRequest';

export const CreateQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionBusiness().isexistsquestionIdentifier(<questionsAttributes>{ questionidentifier: data.questionidentifier, questionid: "", isdeleted: false });
  if (tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Question identifier already exists';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionBusiness().isexistsquestionID(data.questionid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid question id';
    error.details.push(erroritem);
    return [error];
  }
  else {
    const tagexistsnew = await new QuestionBusiness().isexistsquestionIdentifier(<questionsAttributes>{
      questionidentifier: data.questionidentifier, questionid: data.questionid
    });
    if (tagexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: [''],
        type: '',
      };
      erroritem.message = 'Question identifier already exists';
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionBusiness().isexistsquestionID(data.questionid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid question id';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
