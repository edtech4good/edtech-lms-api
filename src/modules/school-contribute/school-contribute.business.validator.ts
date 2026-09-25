import {IRequest} from "../../models";
import {ValidationError, ValidationErrorItem} from "joi";
import {SchoolcontributeBusiness} from "../../business/schoolcontribute.business";

export const CreateSchoolContribute = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SchoolcontributeBusiness().isexistcreated_at(data.schoolid);
  if (tagexists) {
    const error = new ValidationError("Validation", {}, {});
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
  const tagexists = await new SchoolcontributeBusiness().isexistsschoolcontributeID(data.schoolid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
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

export const DeleteSchoolContribute = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SchoolcontributeBusiness().isexistsschoolID(data.schoolid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
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
  const tagexists = await new SchoolcontributeBusiness().isexistsschoolcontributeID(data.schoolcontributeid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolcontributeid'],
      type: 'any.invalid',
    };
    erroritem.message = "That school contribution doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const checkSchoolContribute = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SchoolcontributeBusiness().isexistsschoolcontributeID(data.schoolid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
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