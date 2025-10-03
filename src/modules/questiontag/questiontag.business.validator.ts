/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { QuestionTagBusiness } from 'src/business';
import { IRequest } from 'src/models/IRequest';

export const CreateQuestionTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionTagBusiness().isexistsquestionTagName({ questiontagname: data.questiontagname, questiontagid: "", isdeleted: false });
  if (tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Question tag already exists';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditQuestionTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionTagBusiness().isexistsquestionTagID(data.questiontagid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid question tag id';
    error.details.push(erroritem);
    return [error];
  }
  else {
    const tagexistsnew = await new QuestionTagBusiness().isexistsquestionTagName({ questiontagname: data.questiontagname, questiontagid: data.questiontagid, isdeleted: false });
    if (tagexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: [''],
        type: '',
      };
      erroritem.message = 'Question tag already exists';
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteQuestionTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionTagBusiness().isexistsquestionTagID(data.questiontagid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid question tag id';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
