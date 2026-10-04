import { ValidationError, ValidationErrorItem } from "joi";
import { BaselineQuestionBusiness } from "src/business/baslinequestion.business";
import { requestScope } from "src/business/content-scope";
import { IRequest } from "src/models";

export const DeleteBaselineQuestion = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const baselinequestionexit =
    await new BaselineQuestionBusiness(requestScope(request)).isBaselineQuestionexit(
      data.baselinequestionid
    );
  if (!baselinequestionexit) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['baselinequestionid'],
      type: 'any.invalid',
    };
    erroritem.message = "That baseline question doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const BaselineQuestionExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const baselineexists = await new BaselineQuestionBusiness(requestScope(request)).isexistsBaselineQuestionAdded(data.curriculumbaselineid, data.questionid, data.baselinequestionid);
  if (baselineexists) {
    const error = new ValidationError('Validation', [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questionid'],
      type: 'any.exists',
    };
    erroritem.message = "That question has already been added.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const CloneCurriculumBaseLine = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const curriculumbaselinequestionexists =
    await new BaselineQuestionBusiness(requestScope(request)).getCurriculumBaseLineQuestionDuplicate(
      data.clonecurriculumbaselineid
    );
  if (curriculumbaselinequestionexists) {
    const error = new ValidationError("Validation", [], {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['curriculumbaselineid'],
      type: 'any.exists',
    };
    erroritem.message = "That curriculum baseline already has a question.";
    error.details.push(erroritem);
    return [error];
  }

  const curriculumbaselinequestionempty =
  await new BaselineQuestionBusiness(requestScope(request)).getCurriculumBaseLineQuestionEmpty(
    data.curriculumbaselineid
  );
if (!curriculumbaselinequestionempty) {
  const error = new ValidationError("Validation", [], {});
  error.details = [];
  const erroritem: ValidationErrorItem = {
    message: "",
    path: ['curriculumbaselineid'],
    type: 'any.invalid',
  };
  erroritem.message = "Add a question to the curriculum baseline first.";
  error.details.push(erroritem);
  return [error];
}
return [];
};