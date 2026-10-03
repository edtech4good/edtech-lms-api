/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { TeacherBusiness } from "src/business/teacher.business";
import { findOwnedTeacher } from "src/business/school-scope";
import { orgOrServerOf } from "src/decorators/org.decorator";
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
    const error = new ValidationError("Validation", [], {});
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

/**
 * A teacher that does not exist and one that is another organisation's (or in a
 * school with none) are reported identically: 404 "That teacher doesn't exist.",
 * thrown. (The handler checks the teacher named in the path again.)
 */
export const ValidateTeacherid = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  await findOwnedTeacher(orgOrServerOf(request.user), data.schooluserid);
  return [];
};

export const ValidateTeacherUserid = ValidateTeacherid;
