/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { SchoolBusiness } from "src/business/school.business";
import { IRequest } from "src/models/IRequest";

export const SchoolExists = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const schoolexists = await new SchoolBusiness().getschoolbyname(
    data.schoolname
  );
  if (!schoolexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid School Name";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const SchoolExistsById = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const schoolexists = await new SchoolBusiness().getschoolbyid(
    data.schoolid
  );
  if (!schoolexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid School Name";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const CreateSchool = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SchoolBusiness().isexistsschoolName({
    schoolname: data.schoolname,
    countryid: data.countryid,
    curriculums: data.curriculums,
    schoolid: "",
    isdeleted: false,
  });
  if (tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Document tag already exists";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditSchool = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SchoolBusiness().isexistsschoolID(data.schoolid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid document tag id";
    error.details.push(erroritem);
    return [error];
  }
  const schoolexists = await new SchoolBusiness().getschoolbyname(
    data.schoolname
  );
  // if school exist and not bind with country yet or not bind with curriculums yet
  if (schoolexists && (!schoolexists.countryid || !schoolexists.curriculums)) {
    return [];
  }
  // if (await new SchoolBusiness().schoolstudentexists(data.schoolid)) {
  //   const error = new ValidationError("Validation", {}, {});
  //   error.details = [];
  //   const erroritem: ValidationErrorItem = {
  //     message: "",
  //     path: [""],
  //     type: "",
  //   };
  //   erroritem.message =
  //     "School has students assigned. School cannot be updated";
  //   error.details.push(erroritem);
  //   return [error];
  // }
  return [];
};
export const DeleteSchool = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SchoolBusiness().isexistsschoolID(data.schoolid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid document tag id";
    error.details.push(erroritem);
    return [error];
  }
  if (await new SchoolBusiness().schoolstudentexists(data.schoolid)) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message =
      "School has students assigned. School cannot be deleted";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
