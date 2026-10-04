/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { StandardBusiness } from "src/business/standard.business";
import { findOwnedStandard, requireOwnedSchoolById } from "src/business/school-scope";
import { orgOrServerOf } from "src/decorators/org.decorator";
import { IRequest } from "src/models/IRequest";

export const CreateStandard = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  // The school must be one of the caller's (404 otherwise) before anything is said about the classes in it.
  await requireOwnedSchoolById(orgOrServerOf(request.user), data.schoolid);
  const tagexists = await new StandardBusiness().isexistsstandardName({
    standardname: data.standardname,
    standardid: "",
    schoolid: data.schoolid,
    schoolname: '',
    isdeleted: false,
  });
  if (tagexists) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['standardname'],
      type: 'any.exists',
    };
    erroritem.message = "That standard already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditStandard = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const org = orgOrServerOf(request.user);
  // The class, and the school it is moved to, must be the caller's (404 otherwise: the same as one that does not exist).
  await findOwnedStandard(org, data.standardid);
  await requireOwnedSchoolById(org, data.schoolid);
  const tagexistsnew = await new StandardBusiness().isexistsstandardName({
    standardname: data.standardname,
    standardid: data.standardid,
    schoolid: data.schoolid,
    schoolname: '',
    isdeleted: false,
  });
  if (tagexistsnew) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['standardname'],
      type: 'any.exists',
    };
    erroritem.message = "That standard already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
export const DeleteStandard = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  // The class must be one of the caller's (404 otherwise: the same as one that does not exist).
  await findOwnedStandard(orgOrServerOf(request.user), data.standardid);
  if (await new StandardBusiness().standardstudentexists(data.standardid)) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ["standardid"],
      type: "any.invalid",
    };
    erroritem.message =
      "That standard has students and can't be deleted.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
