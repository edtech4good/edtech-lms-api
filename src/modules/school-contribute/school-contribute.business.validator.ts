import {IRequest} from "../../models";
import {ValidationError, ValidationErrorItem} from "joi";
import {SchoolcontributeBusiness} from "../../business/schoolcontribute.business";
import { findOwnedFeesRow, findOwnedSchool } from "../../business/school-scope";
import { orgOrServerOf } from "../../decorators/org.decorator";

export const CreateSchoolContribute = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  // The school must be one of the caller's (404 otherwise) before anything is said about its rows.
  await findOwnedSchool(orgOrServerOf(request.user), data.schoolid);
  const tagexists = await new SchoolcontributeBusiness().isexistcreated_at(data.schoolid);
  if (tagexists) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolid'],
      type: 'any.exists',
    };
    erroritem.message = "A school contribution has already been created for this month.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditSchoolContribute = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  // The school must be one of the caller's (404 otherwise) before anything is said about its rows.
  await findOwnedSchool(orgOrServerOf(request.user), data.schoolid, { includeDeleted: true });
  const tagexists = await new SchoolcontributeBusiness().isexistsschoolID(data.schoolid);
  if (!tagexists) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolid'],
      type: 'any.invalid',
    };
    erroritem.message = "No school contribution has been created for this yet.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

/** `PUT /school-contribute/updateschooldashboard/:schoolcontributeid`: the row must be one of the caller's (404 otherwise). */
export const EditSchoolContributeRow = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  await findOwnedFeesRow(orgOrServerOf(request.user), data.schoolcontributeid);
  return [];
};

export const DeleteSchoolContribute = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  await findOwnedSchool(orgOrServerOf(request.user), data.schoolid, { includeDeleted: true });
  const tagexists = await new SchoolcontributeBusiness().isexistsschoolID(data.schoolid);
  if (!tagexists) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolid'],
      type: 'any.invalid',
    };
    erroritem.message = "That school doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteSchoolContributeId = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  // One of the caller's (404 otherwise: the same as one that does not exist).
  await findOwnedFeesRow(orgOrServerOf(request.user), data.schoolcontributeid);
  return [];
};

export const checkSchoolContribute = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SchoolcontributeBusiness().isexistsschoolcontributeID(data.schoolid);
  if (!tagexists) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolid'],
      type: 'any.invalid',
    };
    erroritem.message = "Create a school contribution first.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};