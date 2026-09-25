/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { TeacherBusiness } from "src/business/teacher.business";
import { IRequest } from "src/models/IRequest";
import { TeacherImportBody } from "./models/teachersimport";

export const BulkUpload = async (
  request: IRequest,
  data: TeacherImportBody
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new TeacherBusiness().getTeachersByName(
    data.teachers.map((x) => x.schoolusername)
  );
  if (tagexists.length > 0) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ["teachers"],
      type: "any.exists",
    };
    // Was: joined the matching teachers' own usernames into the error
    // message - docs/api-errors.md: user-supplied input is never echoed.
    // (Same fix as import.controller.ts's identical check.)
    erroritem.message = "Some teachers in this file already exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const ValidateTeacherid = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new TeacherBusiness().getTeacherByID(
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
    erroritem.message = "That teacher doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const ValidateTeacherUserid = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new TeacherBusiness().getTeacherByID(data.schooluserid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['schooluserid'],
      type: 'any.invalid',
    };
    erroritem.message = "That teacher doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
