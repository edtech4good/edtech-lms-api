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
      path: [""],
      type: "",
    };
    erroritem.message = `Teachers already exists, ${tagexists
      .map((x) => x.schoolusername)
      .join(",")}`;
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
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid teacher user id";
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid teacher user id';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
