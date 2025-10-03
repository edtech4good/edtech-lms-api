/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { CurriculumBusiness } from "src/business";
import { CurriculumBaseLineBusiness } from "src/business/curriculumbaseline.business";
import { IRequest } from "src/models/IRequest";

export const CreateCurriculumBaseLine = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  let name = 'Baseline';
  if(data.baselinetype === 2) name = 'Midline';
  if(data.baselinetype === 3) name = 'Endline';
  const curriculumexists = await new CurriculumBusiness().getCurriculumbyid(
    data.curriculumid
  );
  if (!curriculumexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Curriculum does not exists";
    error.details.push(erroritem);
    return [error];
  }

  const curriculumbaselineexists =
    await new CurriculumBusiness().getCurriculumbyid(data.curriculumid);
  if (!curriculumbaselineexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = `${name} Curriculum does not exists`;
    error.details.push(erroritem);
    return [error];
  }

  const curriculumbaselineduplicate =
    await new CurriculumBaseLineBusiness().getCurriculumBaseLineValidationYear(
      data.curriculumid,
      data.baselineid,
      data.baselinetype
    );
  if (curriculumbaselineduplicate) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = `${name} Curriculum already exists this year`;
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const CurriculumBaseLineName = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  let name = 'Baseline';
  if(data.baselinetype === 2) name = 'Midline';
  if(data.baselinetype === 3) name = 'Endline';
  const curriculumbaselineexists =
    await new CurriculumBaseLineBusiness().getCurriculumBaseLineNameExits(
      data.curriculumbaselineid,
      data.baselinename,
      data.baselinetype,
    );
  if (curriculumbaselineexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = `${name} Name already exists`;
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteCurriculumBaseLine = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  let name = 'Baseline';
  if(data.baselinetype === 2) name = 'Midline';
  if(data.baselinetype === 3) name = 'Endline';
  const curriculumbaselineexists =
    await new CurriculumBaseLineBusiness().getCurriculumBaseLineByID(
      data.curriculumbaselineid
    );
  if (!curriculumbaselineexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = `Invalid curriculum ${name}`;
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const ActivateCurriculumBaseLine = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const curriculumbaselinequestionexists =
    await new CurriculumBaseLineBusiness().getBaselineQuestionExits(
      data.curriculumbaselineid
    );
  if (!curriculumbaselinequestionexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Please add question!";
    error.details.push(erroritem);
    return [error];
  }
  return [];
}