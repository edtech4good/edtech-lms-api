/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { StudentBusiness } from "src/business/student.business";
import { IRequest } from "src/models/IRequest";
import { StudentImportBody } from "./models/studentimport";

export const BulkUpload = async (
  request: IRequest,
  data: StudentImportBody
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new SchoolUserBusiness().schoolUserExists(
    data.students.map((x) => x.schoolusername)
  );
  if (tagexists.length > 0) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ["students"],
      type: "any.exists",
    };
    // Was: joined the matching students' own usernames into the error
    // message - docs/api-errors.md: user-supplied input is never echoed.
    erroritem.message = "Some students in this file already exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const ValidateSchoolUserid = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new StudentBusiness().findbyschooluserid(
    data.schooluserid
  );
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schooluserid'],
      type: 'any.invalid',
    };
    erroritem.message = "That school user doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const ValidatestudentID = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new StudentBusiness().studentExists(data.studentid);
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['studentid'],
      type: 'any.invalid',
    };
    erroritem.message = "That student doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
