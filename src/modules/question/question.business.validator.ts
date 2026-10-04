/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { QuestionBusiness } from 'src/business';
import { questionsAttributes } from 'src/models/data-models/init-models';
import { nameScope, requestScope } from "src/business/content-scope";
import { ownerOfQuestion } from "src/business/content-owner";
import { IRequest } from 'src/models/IRequest';

export const CreateQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionBusiness(requestScope(request)).isexistsquestionIdentifier(<questionsAttributes>{ questionidentifier: data.questionidentifier, questionid: "", isdeleted: false });
  if (tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questionidentifier'],
      type: 'any.exists',
    };
    erroritem.message = "That question identifier already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionBusiness(requestScope(request)).isexistsquestionID(data.questionid);
  if (!tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questionid'],
      type: 'any.invalid',
    };
    erroritem.message = "That question doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  else {
    const tagexistsnew = await new QuestionBusiness(await nameScope(request, ownerOfQuestion, data.questionid)).isexistsquestionIdentifier(<questionsAttributes>{
      questionidentifier: data.questionidentifier, questionid: data.questionid
    });
    if (tagexistsnew) {
      const error = new ValidationError('Validation', [], {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: ['questionidentifier'],
        type: 'any.exists',
      };
      erroritem.message = "That question identifier already exists.";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionBusiness(requestScope(request)).isexistsquestionID(data.questionid);
  if (!tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questionid'],
      type: 'any.invalid',
    };
    erroritem.message = "That question doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
