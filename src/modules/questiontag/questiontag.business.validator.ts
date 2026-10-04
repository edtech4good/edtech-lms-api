/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { QuestionTagBusiness } from 'src/business';
import { nameScope, requestScope } from "src/business/content-scope";
import { ownerOfQuestionTag } from "src/business/content-owner";
import { IRequest } from 'src/models/IRequest';

export const CreateQuestionTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionTagBusiness(requestScope(request)).isexistsquestionTagName({ questiontagname: data.questiontagname, questiontagid: "", isdeleted: false });
  if (tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questiontagname'],
      type: 'any.exists',
    };
    erroritem.message = "That question tag already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditQuestionTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionTagBusiness(requestScope(request)).isexistsquestionTagID(data.questiontagid);
  if (!tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questiontagid'],
      type: 'any.invalid',
    };
    erroritem.message = "That question tag doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  else {
    const tagexistsnew = await new QuestionTagBusiness(await nameScope(request, ownerOfQuestionTag, data.questiontagid)).isexistsquestionTagName({ questiontagname: data.questiontagname, questiontagid: data.questiontagid, isdeleted: false });
    if (tagexistsnew) {
      const error = new ValidationError('Validation', [], {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: ['questiontagname'],
        type: 'any.exists',
      };
      erroritem.message = "That question tag already exists.";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteQuestionTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new QuestionTagBusiness(requestScope(request)).isexistsquestionTagID(data.questiontagid);
  if (!tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questiontagid'],
      type: 'any.invalid',
    };
    erroritem.message = "That question tag doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
