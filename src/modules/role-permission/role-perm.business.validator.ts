/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { RolePermissionBusiness } from "src/business/role-permission.business";
import { IRequest } from "src/models/IRequest";

export const EditRole = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new RolePermissionBusiness().isexistsroleID(data.roleid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['roleid'],
      type: 'any.invalid',
    };
    erroritem.message = "That role doesn't exist.";
    error.details.push(erroritem);
    return [error];
  } else {
    const tagexistsnew = await new RolePermissionBusiness().isexistsroleName({
      rolename: data.rolename,
      roleid: data.roleid
    });
    if (tagexistsnew) {
      const error = new ValidationError("Validation", {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: "",
        path: ['rolename'],
        type: 'any.exists',
      };
      erroritem.message = "That role name already exists.";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteRole = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new RolePermissionBusiness().isexistsroleID(data.roleid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['roleid'],
      type: 'any.invalid',
    };
    erroritem.message = "That role doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  if (await new RolePermissionBusiness().checkRoleIsBinded(data.roleid)) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ["roleid"],
      type: "any.invalid",
    };
    erroritem.message =
      "That role is in use and can't be deleted.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
