/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { CurriculumBusiness } from 'src/business';
import { SubjectBusiness } from 'src/business/subject.business';
import { IRequest } from 'src/models/IRequest';

export const CreateCurriculum = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const curriculumexists = await new CurriculumBusiness().isexistsCurriculumName({ curriculumname: data.curriculumname, curriculumid: "", curriculumstatus: false, curriculumdescription: "", isdeleted: false });
  const subjectexists = await new SubjectBusiness().isexistssubjectID(data.subjectid);
  if (!subjectexists) {
    const error = new ValidationError('Validation', {}, {});
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
  if (curriculumexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['curriculumname'],
      type: 'any.exists',
    };
    erroritem.message = "That curriculum already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditCurriculum = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const curriculumexists = await new CurriculumBusiness().isexistsCurriculumID(data.curriculumid);
  const subjectexists = await new SubjectBusiness().isexistssubjectID(data.subjectid);
  if (!subjectexists) {
    const error = new ValidationError('Validation', {}, {});
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
  if (!curriculumexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['curriculumid'],
      type: 'any.invalid',
    };
    erroritem.message = "That curriculum doesn't exist.";
    error.details.push(erroritem);
    return [error];
  } else {
    const curriculumexistsnew = await new CurriculumBusiness().isexistsCurriculumName({ curriculumname: data.curriculumname, curriculumid: data.curriculumid, curriculumstatus: false, curriculumdescription: "", isdeleted: false });
    if (curriculumexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: ['curriculumname'],
        type: 'any.exists',
      };
      erroritem.message = "That curriculum already exists.";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteCurriculum = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const curriculumexists = await new CurriculumBusiness().isexistsCurriculumID(data.curriculumid);
  if (!curriculumexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['curriculumid'],
      type: 'any.invalid',
    };
    erroritem.message = "That curriculum doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
