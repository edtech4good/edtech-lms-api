/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { GradeBusiness } from 'src/business';
import { IRequest } from 'src/models/IRequest';

export const CreateGrade = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const gradeexists = await new GradeBusiness().isexistsGradeName({
    gradename: data.gradename,
    gradeid: '',
    gradestatus: false,
    gradedescription: '',
    isdeleted: false,
    curriculumid: data.curriculumid,
    gradeorder: 0
  });
  if (gradeexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Grade already exists';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditGrade = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const gradeexists = await new GradeBusiness().isexistsGradeID(data.gradeid);
  if (!gradeexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid Grade id';
    error.details.push(erroritem);
    return [error];
  } else {
    const gradeexistsnew = await new GradeBusiness().isexistsGradeName({
      gradename: data.gradename,
      gradeid: data.gradeid,
      gradestatus: false,
      gradedescription: '',
      isdeleted: false,
      curriculumid: data.curriculumid,
      gradeorder: 0
    });
    if (gradeexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: [''],
        type: '',
      };
      erroritem.message = 'Grade already exists';
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteGrade = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const gradeexists = await new GradeBusiness().isexistsGradeID(data.gradeid);
  if (!gradeexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid Grade id';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
