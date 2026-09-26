/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { UserBusiness } from "src/business";
import { SUPERADMIN_USERNAME } from "src/models/enums/permissions.enum";
import { IRequest } from "src/models/IRequest";

export const CreateUser = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new UserBusiness().isemailtaken(data.lmsusername);
  if (tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['lmsusername'],
      type: 'any.exists',
    };
    erroritem.message = "That email is already registered.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditUser = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const user = await new UserBusiness().getuser(
    data.lmsuserid
  );
  if (!user) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['lmsuserid'],
      type: 'any.invalid',
    };
    erroritem.message = "That user doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
export const DeleteUser = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const user = await new UserBusiness().getuser(
    data.lmsuserid
  );
  if (!user) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['lmsuserid'],
      type: 'any.invalid',
    };
    erroritem.message = "That user doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  if (user.lmsusername === SUPERADMIN_USERNAME) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['lmsuserid'],
      type: 'any.invalid',
    };
    erroritem.message = "The superadmin account can't be deleted.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
