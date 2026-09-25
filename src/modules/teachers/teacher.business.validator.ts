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
    // One field per clashing row (row index + field), so the admin can find
    // it - without echoing anyone's username (docs/api-errors.md). A field
    // error is INVALID_INPUT: `fields` are only allowed on INVALID_INPUT.
    const taken = new Set(tagexists.map((x) => x.schoolusername));
    const error = new ValidationError("Validation", {}, {});
    error.details = data.teachers
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => taken.has(x.schoolusername))
      .map(({ i }): ValidationErrorItem => ({
        message: "That username is already taken.",
        path: [`teachers[${i}].schoolusername`],
        type: "any.invalid",
      }));
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
