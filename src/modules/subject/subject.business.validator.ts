/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { SubjectBusiness } from 'src/business/subject.business';
import { nameScope, requestScope } from "src/business/content-scope";
import { ownerOfSubject } from "src/business/content-owner";
import { IRequest } from 'src/models/IRequest';

export const CreateSubject = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SubjectBusiness(requestScope(request)).isexistssubjectName({
    subjectname: data.subjectname,
    subjectid: '',
    isdeleted: false,
  });
  if (tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['subjectname'],
      type: 'any.exists',
    };
    erroritem.message = "That subject already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditSubject = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SubjectBusiness(requestScope(request)).isexistssubjectID(data.subjectid);
  if (!tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['subjectid'],
      type: 'any.invalid',
    };
    erroritem.message = "That subject doesn't exist.";
    error.details.push(erroritem);
    return [error];
  } else {
    const tagexistsnew = await new SubjectBusiness(await nameScope(request, ownerOfSubject, data.subjectid)).isexistssubjectName({
      subjectname: data.subjectname,
      subjectid: data.subjectid,
      isdeleted: false,
    });
    if (tagexistsnew) {
      const error = new ValidationError('Validation', [], {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: ['subjectname'],
        type: 'any.exists',
      };
      erroritem.message = "That subject already exists.";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteSubject = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SubjectBusiness(requestScope(request)).isexistssubjectID(data.subjectid);
  if (!tagexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['subjectid'],
      type: 'any.invalid',
    };
    erroritem.message = "That subject doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  const curriculumbinded = await new SubjectBusiness(requestScope(request)).subjectbindtocurriculum(data.subjectid);
  if (curriculumbinded) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['subjectid'],
      type: 'any.invalid',
    };
    erroritem.message = "That subject is used by a curriculum and can't be deleted.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
