import { ValidationError, ValidationErrorItem } from "joi";
import { BaselineQuestionBusiness } from "src/business/baslinequestion.business";
import { IRequest } from "src/models";

export const DeleteBaselineQuestion = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const baselinequestionexit =
    await new BaselineQuestionBusiness().isBaselineQuestionexit(
      data.baselinequestionid
    );
  if (!baselinequestionexit) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Invalid BaselineQuestion ID";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const BaselineQuestionExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const baselineexists = await new BaselineQuestionBusiness().isexistsBaselineQuestionAdded(data.curriculumbaselineid, data.questionid, data.baselinequestionid);
  if (baselineexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Question already added to BaselineQuestion';
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
    await new BaselineQuestionBusiness().getCurriculumBaseLineQuestionDuplicate(
      data.clonecurriculumbaselineid
    );
  if (curriculumbaselinequestionexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: [""],
      type: "",
    };
    erroritem.message = "Curriculum Base Line already have question!";
    error.details.push(erroritem);
    return [error];
  }

  const curriculumbaselinequestionempty =
  await new BaselineQuestionBusiness().getCurriculumBaseLineQuestionEmpty(
    data.curriculumbaselineid
  );
if (!curriculumbaselinequestionempty) {
  const error = new ValidationError("Validation", {}, {});
  error.details = [];
  const erroritem: ValidationErrorItem = {
    message: "",
    path: [""],
    type: "",
  };
  erroritem.message = "Curriculum Base Line have empty question!";
  error.details.push(erroritem);
  return [error];
}
return [];
};