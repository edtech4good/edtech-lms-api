/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { SchoolBusiness } from "src/business/school.business";
import { findSchoolSegment } from "src/business/school-identity";
import { IRequest } from "src/models/IRequest";

const schoolSegmentInvalid = (): ValidationError => {
  const error = new ValidationError("Validation", [], {});
  error.details = [];
  const erroritem: ValidationErrorItem = {
    message: "",
    path: ['schoolname'],
    type: 'any.invalid',
  };
  erroritem.message = "That school doesn't exist.";
  error.details.push(erroritem);
  return error;
};

/**
 * WRITE routes (`PUT /import/:schoolname/teachers`). The route's `:schoolname`
 * segment is a school's NAME or its id (see findSchoolSegment); the school must be
 * a live one, as before, and a name that matches two schools is not guessed.
 */
export const SchoolExists = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const found = await findSchoolSegment(data.schoolname ?? "");
  const schoolexists = found ? await new SchoolBusiness().getschoolbyid(found.schoolid) : null;
  return schoolexists ? [] : [schoolSegmentInvalid()];
};

/**
 * READ routes (`GET /export/:schoolname/students` and `/teachers`). The id is
 * identity, not liveness: a soft-deleted school can be read by its id, as the
 * reports and the edit export already allow. A name is resolved the way the
 * route's own handler resolves it (`forRead`: one live school among namesakes wins).
 * Do not put this on a route that writes.
 */
export const SchoolExistsForRead = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const found = await findSchoolSegment(data.schoolname ?? "", { forRead: true });
  return found ? [] : [schoolSegmentInvalid()];
};

export const SchoolExistsById = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const schoolexists = await new SchoolBusiness().getschoolbyid(
    data.schoolid
  );
  if (!schoolexists) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolid'],
      type: 'any.invalid',
    };
    erroritem.message = "That school doesn't exist.";
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
    schoolname: (data.schoolname ?? "").trim(),
    countryid: data.countryid,
    curriculums: data.curriculums,
    schoolid: "",
    isdeleted: false,
  });
  if (tagexists) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolname'],
      type: 'any.exists',
    };
    erroritem.message = "That school already exists.";
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
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolid'],
      type: 'any.invalid',
    };
    erroritem.message = "That school doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  const schoolexists = await new SchoolBusiness().getschoolbyname(
    (data.schoolname ?? "").trim()
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
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['schoolid'],
      type: 'any.invalid',
    };
    erroritem.message = "That school doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  if (await new SchoolBusiness().schoolstudentexists(data.schoolid)) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ["schoolid"],
      type: "any.invalid",
    };
    erroritem.message =
      "That school has students and can't be deleted.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
