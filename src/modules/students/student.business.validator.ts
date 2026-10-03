/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { SchoolUserBusiness } from "src/business/schooluser.business";
import { findOwnedStudent } from "src/business/school-scope";
import { orgOrServerOf } from "src/decorators/org.decorator";
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
    const error = new ValidationError("Validation", [], {});
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

/**
 * A learner that does not exist and one that is another organisation's (or in
 * a school with none) are reported identically: 404 "That student doesn't
 * exist.", thrown. (A rule sees the path, query and body merged, the body last;
 * the business methods check the learner again from the path itself.)
 */
export const ValidateSchoolUserid = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  await findOwnedStudent(orgOrServerOf(request.user), { schooluserid: typeof data.schooluserid === "string" ? data.schooluserid : null });
  return [];
};

export const ValidatestudentID = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  await findOwnedStudent(orgOrServerOf(request.user), { studentid: typeof data.studentid === "string" ? data.studentid : null });
  return [];
};
