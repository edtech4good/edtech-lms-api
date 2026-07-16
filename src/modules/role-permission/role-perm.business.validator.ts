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
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid role id";
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
        path: [""],
        type: "",
      };
      erroritem.message = "Role name already exists";
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
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid role id";
    error.details.push(erroritem);
    return [error];
  }
  if (await new RolePermissionBusiness().checkRoleIsBinded(data.roleid)) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message =
      "Role is binded, role cannot be deleted";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
