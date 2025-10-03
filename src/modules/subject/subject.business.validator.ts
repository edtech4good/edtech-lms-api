/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { SubjectBusiness } from 'src/business/subject.business';
import { IRequest } from 'src/models/IRequest';

export const CreateSubject = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SubjectBusiness().isexistssubjectName({
    subjectname: data.subjectname,
    subjectid: '',
    isdeleted: false,
  });
  if (tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Subject already exists';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditSubject = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SubjectBusiness().isexistssubjectID(data.subjectid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid subject id';
    error.details.push(erroritem);
    return [error];
  } else {
    const tagexistsnew = await new SubjectBusiness().isexistssubjectName({
      subjectname: data.subjectname,
      subjectid: data.subjectid,
      isdeleted: false,
    });
    if (tagexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: [''],
        type: '',
      };
      erroritem.message = 'Subject already exists';
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteSubject = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SubjectBusiness().isexistssubjectID(data.subjectid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid subject id';
    error.details.push(erroritem);
    return [error];
  }
  const curriculumbinded = await new SubjectBusiness().subjectbindtocurriculum(data.subjectid);
  if (curriculumbinded) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Subject is assigned to a curriculum.';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
