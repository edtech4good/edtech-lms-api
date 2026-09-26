/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { LessonBusiness } from 'src/business';
import { LessonLearningBusiness } from 'src/business/lessonlearning.business';
import { LessonPlanBusiness } from 'src/business/lessonplan.business';
import { LessonPracticeBusiness } from 'src/business/lessonpractice.business';
import { LessonPracticeQuestionBusiness } from 'src/business/lessonpracticequestion.business';
import { LessonQuizBusiness } from 'src/business/lessonquiz.business';
import { LessonQuizQuestionBusiness } from 'src/business/lessonquizquestion.business';
import { IRequest } from 'src/models/IRequest';

export const CreateLesson = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const lessonexists = await new LessonBusiness().isexistsLessonName({
    lessonname: data.lessonname,
    lessonid: '',
    lessonstatus: false,
    lessondescription: '',
    isdeleted: false,
    levelid: data.levelid,
    lessonorder: 0,
    lessonpasspercentage: 80,
    practicecount: 0,
    quizcount: 0,
  });
  if (lessonexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonname'],
      type: 'any.exists',
    };
    erroritem.message = "That lesson already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditLesson = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const lessonexists = await new LessonBusiness().isexistsLessonID(data.lessonid);
  if (!lessonexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonid'],
      type: 'any.invalid',
    };
    erroritem.message = "That lesson doesn't exist.";
    error.details.push(erroritem);
    return [error];
  } else {
    const lessonexistsnew = await new LessonBusiness().isexistsLessonName({
      lessonname: data.lessonname,
      lessonid: data.lessonid,
      lessonstatus: false,
      lessondescription: '',
      isdeleted: false,
      levelid: data.levelid,
      lessonorder: 0,
      lessonpasspercentage: 80,
      practicecount: 0,
      quizcount: 0,
    });
    if (lessonexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: ['lessonname'],
        type: 'any.exists',
      };
      erroritem.message = "That lesson already exists.";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteLesson = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const lessonexists = await new LessonBusiness().isexistsLessonID(data.lessonid);
  if (!lessonexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonid'],
      type: 'any.invalid',
    };
    erroritem.message = "That lesson doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
export const LessonLearningExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LessonLearningBusiness().isexistsLessonLearningAdded(data.lessonid, data.documentid, data.lessonlearningid);
  if (levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['documentid'],
      type: 'any.exists',
    };
    erroritem.message = "That learning document has already been added to this lesson.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
export const LessonPlanExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LessonPlanBusiness().isexistsLessonPlanAdded(data.lessonid, data.documentid, data.lessonplanid);
  if (levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['documentid'],
      type: 'any.exists',
    };
    erroritem.message = "That plan document has already been added to this lesson.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteLessonLearning = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LessonLearningBusiness().isexistsLessonLearningID(data.lessonlearningid);
  if (!levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonlearningid'],
      type: 'any.invalid',
    };
    erroritem.message = "That lesson learning item doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteLessonPlan = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LessonPlanBusiness().isexistsLessonPlanID(data.lessonplanid);
  if (!levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonplanid'],
      type: 'any.invalid',
    };
    erroritem.message = "That lesson plan doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const LessonPracticeExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LessonPracticeBusiness().isexistsLessonPracticeAdded(data.lessonid, data.lessonpracticename, data.lessonpracticeid);
  if (levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonpracticename'],
      type: 'any.exists',
    };
    erroritem.message = "That practice name has already been added to this lesson.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteLessonPractice = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LessonPracticeBusiness().isexistsLessonPracticeID(data.lessonpracticeid);
  if (!levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonpracticeid'],
      type: 'any.invalid',
    };
    erroritem.message = "That lesson practice doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const LessonQuizExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LessonQuizBusiness().isexistsLessonQuizAdded(data.lessonid, data.lessonquizname, data.lessonquizid);
  if (levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonquizname'],
      type: 'any.exists',
    };
    erroritem.message = "That quiz name has already been added to this lesson.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteLessonQuiz = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const levelexists = await new LessonQuizBusiness().isexistsLessonQuizID(data.lessonquizid);
  if (!levelexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonquizid'],
      type: 'any.invalid',
    };
    erroritem.message = "That lesson quiz doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteLessonQuizQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const lessonexists = await new LessonQuizQuestionBusiness().isexistsLessonQuizQuestionID(data.lessonquizquestionid);
  if (!lessonexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonquizquestionid'],
      type: 'any.invalid',
    };
    erroritem.message = "That lesson quiz question doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const LessonQuizQuestionExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const lessonexists = await new LessonQuizQuestionBusiness().isexistsLessonQuizQuestionAdded(data.lessonquizid, data.questionid, data.lessonquizquestionid);
  if (lessonexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questionid'],
      type: 'any.exists',
    };
    erroritem.message = "That question has already been added to this quiz.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const DeleteLessonPracticeQuestion = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const lessonexists = await new LessonPracticeQuestionBusiness().isexistsLessonPracticeQuestionID(data.lessonpracticequestionid);
  if (!lessonexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['lessonpracticequestionid'],
      type: 'any.invalid',
    };
    erroritem.message = "That lesson practice question doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const LessonPracticeQuestionExists = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const lessonexists = await new LessonPracticeQuestionBusiness().isexistsLessonPracticeQuestionAdded(data.lessonpracticeid, data.questionid, data.lessonpracticequestionid);
  if (lessonexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: ['questionid'],
      type: 'any.exists',
    };
    erroritem.message = "That question has already been added to this practice.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
