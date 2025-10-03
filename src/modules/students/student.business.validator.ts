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
      path: [""],
      type: "",
    };
    erroritem.message = `Students already exists, ${tagexists
      .map((x) => x.schoolusername)
      .join(",")}`;
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
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid school user id";
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
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid student id";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
