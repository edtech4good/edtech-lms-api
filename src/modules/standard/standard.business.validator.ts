/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { StandardBusiness } from "src/business/standard.business";
import { IRequest } from "src/models/IRequest";

export const CreateStandard = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new StandardBusiness().isexistsstandardName({
    standardname: data.standardname,
    standardid: "",
    schoolid: data.schoolid,
    schoolname: '',
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
    erroritem.message = "standard already exists";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditStandard = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new StandardBusiness().isexistsstandardID(
    data.standardid
  );
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid standard id";
    error.details.push(erroritem);
    return [error];
  } else {
    const tagexistsnew = await new StandardBusiness().isexistsstandardName({
      standardname: data.standardname,
      standardid: data.standardid,
      schoolid: data.schoolid,
      schoolname: '',
      isdeleted: false,
    });
    if (tagexistsnew) {
      const error = new ValidationError("Validation", {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: "",
        path: [""],
        type: "",
      };
      erroritem.message = "standard already exists";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteStandard = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new StandardBusiness().isexistsstandardID(
    data.standardid
  );
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid standard id";
    error.details.push(erroritem);
    return [error];
  }
  if (await new StandardBusiness().standardstudentexists(data.standardid)) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message =
      "Standard has students assigned. Standard cannot be deleted";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
