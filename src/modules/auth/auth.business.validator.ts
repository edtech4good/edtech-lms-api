/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { UserBusiness } from 'src/business';
import { IRequest } from 'src/models/IRequest';

const UserEmailExistsValidator = async (request: IRequest): Promise<ValidationError | null | undefined> => {
  const userexists = await new UserBusiness().isemailtaken(request.path === '/auth/register' ? request.body.lmsusername : request.user.sub);
  if (userexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Email already exists';
    error.details.push(erroritem);
    return error;
  }
  return null;
};
const isNotUserEmailExistsValidator = async (request: IRequest): Promise<ValidationError | null | undefined> => {
  const userexists = await new UserBusiness().isemailtaken(request.body.lmsusername);
  if (!userexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Email not exists';
    error.details.push(erroritem);
    return error;
  }
  return null;
};

const UserExistsValidator = async (request: IRequest, user: any): Promise<ValidationError | null | undefined> => {
  const userexists = await new UserBusiness().getuserbyid(user.lmsuserid);
  if (!userexists) {
    const error = new ValidationError('Validation', {}, user);
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'User not exists';
    error.details.push(erroritem);
    return error;
  }
  return null;
};
const AuthBusinessisNotUserEmailExistsValidator = async (request: IRequest): Promise<Array<ValidationError | null | undefined>> => {
  const result: Array<ValidationError | null | undefined> = [];
  result.push(await isNotUserEmailExistsValidator(request));

  return result;
};
const AuthBusinessUserEmailExistsValidator = async (request: IRequest): Promise<Array<ValidationError | null | undefined>> => {
  const result: Array<ValidationError | null | undefined> = [];
  result.push(await UserEmailExistsValidator(request));

  return result;
};

export {
  UserExistsValidator,
  UserEmailExistsValidator,
  isNotUserEmailExistsValidator,
  AuthBusinessisNotUserEmailExistsValidator,
  AuthBusinessUserEmailExistsValidator,
};
