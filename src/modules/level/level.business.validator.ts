/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { LevelBusiness } from 'src/business';
import { LevelQuizQuestionBusiness } from 'src/business/levelquizquestion.business';
import { IRequest } from 'src/models/IRequest';

export const CreateLevel = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LevelBusiness().isexistsLevelName({
    levelname: data.levelname,
    levelid: '',
    levelstatus: false,
    leveldescription: '',
    isdeleted: false,
    gradeid: data.gradeid,
    levelorder: 0
  });
  if (levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['levelname'],
      type: 'any.exists',
    };
    erroritem.message = "That level already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditLevel = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LevelBusiness().isexistsLevelID(data.levelid);
  if (!levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['levelid'],
      type: 'any.invalid',
    };
    erroritem.message = "That level doesn't exist.";
    error.details.push(erroritem);
    return [error];
  } else {
    const levelexistsnew = await new LevelBusiness().isexistsLevelName({
      levelname: data.levelname,
      levelid: data.levelid,
      levelstatus: false,
      leveldescription: '',
      isdeleted: false,
      gradeid: data.gradeid,
      levelorder: 0
    });
    if (levelexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: ['levelname'],
        type: 'any.exists',
      };
      erroritem.message = "That level already exists.";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteLevel = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LevelBusiness().isexistsLevelID(data.levelid);
  if (!levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['levelid'],
      type: 'any.invalid',
    };
    erroritem.message = "That level doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteLevelQuizQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LevelQuizQuestionBusiness().isexistsLevelQuizQuestionID(data.levelquizquestionid);
  if (!levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['levelquizquestionid'],
      type: 'any.invalid',
    };
    erroritem.message = "That level quiz question doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const LevelQuizQuestionExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LevelQuizQuestionBusiness().isexistsLevelQuizQuestionAdded(data.levelid, data.questionid, data.levelquizquestionid);
  if (levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questionid'],
      type: 'any.exists',
    };
    erroritem.message = "That question has already been added to this level.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
