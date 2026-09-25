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
    // One field per clashing row (row index + field), so the admin can find
    // it - without echoing anyone's username (docs/api-errors.md). A field
    // error is INVALID_INPUT: `fields` are only allowed on INVALID_INPUT.
    const taken = new Set(tagexists.map((x) => x.schoolusername));
    const error = new ValidationError("Validation", {}, {});
    error.details = data.students
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => taken.has(x.schoolusername))
      .map(({ i }): ValidationErrorItem => ({
        message: "That username is already taken.",
        path: [`students[${i}].schoolusername`],
        type: "any.invalid",
      }));
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
