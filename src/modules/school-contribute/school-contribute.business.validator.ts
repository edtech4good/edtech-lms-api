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
      path: [""],
      type: "",
    };
    erroritem.message = "School Contribute already create this month";
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
      path: [""],
      type: "",
    };
    erroritem.message = "School Contribute not create yet";
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
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid schoolid";
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
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid schoolcontributeid";
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
      path: [""],
      type: "",
    };
    erroritem.message = "Please Create SchoolContribute";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};