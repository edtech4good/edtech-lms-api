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
      path: [''],
      type: '',
    };
    erroritem.message = 'Lesson already exists';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid Lesson id';
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
        path: [''],
        type: '',
      };
      erroritem.message = 'Lesson already exists';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid Lesson id';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Learning document already added to lesson';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Plan document already added to lesson';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid lesson learning id';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid lesson plan id';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Practice name already added to lesson';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid lesson learning id';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Quiz name already added to lesson';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid lesson learning id';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid Lesson quiz question id';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Question already added to lesson quiz';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid Lesson practice question id';
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
      path: [''],
      type: '',
    };
    erroritem.message = 'Question already added to lesson practice';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
